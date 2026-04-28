import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { loadScenarioComputeData, computeAtWeights } from '@/lib/api-helpers/scenario-data-loader'
import { SCENARIO_VERIFICATION_WEIGHTS } from '@/types'
import type { Scenario } from '@/types/scenario'

export async function POST(request: NextRequest) {
  try {
    const { ids } = await request.json() as { ids: string[] }

    if (!ids || ids.length < 2) {
      return NextResponse.json({ error: '至少需要 2 個方案進行比較' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('scenarios')
      .select('*')
      .in('id', ids)

    if (error) throw error

    // Also fetch vendor names for display
    const vendorIds = new Set<string>()
    for (const sc of data ?? []) {
      if (sc.vendor_b_id) vendorIds.add(sc.vendor_b_id)
      if (sc.vendor_c_id) vendorIds.add(sc.vendor_c_id)
      if (sc.vendor_d_id) vendorIds.add(sc.vendor_d_id)
      if (sc.vendor_bc_id) vendorIds.add(sc.vendor_bc_id)
      if (sc.vendor_bcd_id) vendorIds.add(sc.vendor_bcd_id)
    }

    let vendorMap: Record<string, string> = {}
    if (vendorIds.size > 0) {
      const { data: vendors } = await supabase
        .from('vendors')
        .select('id, name')
        .in('id', [...vendorIds])
      if (vendors) {
        vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]))
      }
    }

    // Compute costs at 24 weight points for each scenario using full engine
    const enriched = await Promise.all((data ?? []).map(async (sc) => {
      let weightPointCosts = null
      try {
        const computeData = await loadScenarioComputeData(sc as Scenario)
        const results = computeAtWeights(computeData, SCENARIO_VERIFICATION_WEIGHTS)
        weightPointCosts = results.cost_per_bracket
      } catch (e) {
        console.error(`Failed to compute costs for scenario ${sc.id}:`, e)
      }

      return {
        ...sc,
        vendor_b_name: sc.vendor_b_id ? vendorMap[sc.vendor_b_id] : null,
        vendor_c_name: sc.vendor_c_id ? vendorMap[sc.vendor_c_id] : null,
        vendor_d_name: sc.vendor_d_id ? vendorMap[sc.vendor_d_id] : null,
        vendor_bc_name: sc.vendor_bc_id ? vendorMap[sc.vendor_bc_id] : null,
        vendor_bcd_name: sc.vendor_bcd_id ? vendorMap[sc.vendor_bcd_id] : null,
        weight_point_costs: weightPointCosts,
      }
    }))

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Compare fetch error:', error)
    return NextResponse.json({ error: '載入比較數據失敗' }, { status: 500 })
  }
}
