import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeVolumeCurve } from '@/lib/calculations/volume'
import { loadScenarioComputeData, computeAtWeights } from '@/lib/api-helpers/scenario-data-loader'
import type { Scenario } from '@/types/scenario'
import { SCENARIO_VERIFICATION_WEIGHTS } from '@/types'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // 1. Load scenario
    const { data: scenario, error: sErr } = await supabase
      .from('scenarios')
      .select('*')
      .eq('id', id)
      .single()
    if (sErr || !scenario) {
      return NextResponse.json({ error: '找不到方案' }, { status: 404 })
    }

    const sc = scenario as Scenario

    // 2. Load all compute data (resolves gateways, D-model auto-detection, etc.)
    const data = await loadScenarioComputeData(sc)

    if (data.pricingMode === 'bc_combined' && !data.vendorBCRate) {
      return NextResponse.json({ error: 'BC 供應商尚未設定費率' }, { status: 400 })
    }
    if (data.pricingMode === 'segmented' && data.vendorBRates.length === 0 && !sc.vendor_b_id) {
      return NextResponse.json({ error: '請選擇 B段供應商' }, { status: 400 })
    }

    // 3. Compute costs
    const results = computeAtWeights(data)

    // 4. Compute verification costs at 24 weight points
    const verificationResults = computeAtWeights(data, SCENARIO_VERIFICATION_WEIGHTS)

    // 5. Compute volume curve (segmented mode only) and merge into results
    let fullResults: Record<string, unknown> = { ...results, verification_costs: verificationResults.cost_per_bracket }
    if (data.pricingMode === 'segmented') {
      const rates = data.scenario.exchange_rates!
      const gwProportions = results.gateway_allocation
      const bBufferPct = typeof data.vendorB?.config?.b_buffer_pct === 'number' ? data.vendorB.config.b_buffer_pct : 0.1
      const volumeCurve = computeVolumeCurve(
        data.scenario,
        data.vendorBRates,
        data.vendorCRates,
        gwProportions,
        data.avgWeightKg,
        rates,
        bBufferPct,
      )
      fullResults = { ...fullResults, volume_curve: volumeCurve }
    }

    // 6. Cache results in scenario
    const { error: updateErr } = await supabase
      .from('scenarios')
      .update({ results: fullResults, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateErr) console.error('Failed to cache results:', updateErr)

    return NextResponse.json(fullResults)
  } catch (error) {
    console.error('Scenario compute error:', error)
    return NextResponse.json({ error: '計算失敗' }, { status: 500 })
  }
}
