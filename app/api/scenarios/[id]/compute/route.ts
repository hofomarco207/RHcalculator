import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { loadScenarioComputeData, computeAtWeights } from '@/lib/api-helpers/scenario-data-loader'
import type { Scenario } from '@/types/scenario'
import { SCENARIO_VERIFICATION_WEIGHTS } from '@/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Optional body with country_code for per-country D-segment verification
    let countryCode = ''
    try {
      const body = await request.json()
      if (typeof body?.country_code === 'string') countryCode = body.country_code
    } catch { /* no body or invalid JSON — fine */ }

    const supabase = createAdminClient()

    const { data: scenario, error: sErr } = await supabase
      .from('scenarios')
      .select('*')
      .eq('id', id)
      .single()
    if (sErr || !scenario) {
      return NextResponse.json({ error: '找不到方案' }, { status: 404 })
    }

    const sc = scenario as Scenario
    const data = await loadScenarioComputeData(sc)

    if (!data.vendorBCRate) {
      return NextResponse.json({ error: 'BC 供應商尚未設定費率' }, { status: 400 })
    }

    const results = computeAtWeights(data, undefined, countryCode)
    const verificationResults = computeAtWeights(data, SCENARIO_VERIFICATION_WEIGHTS, countryCode)
    const fullResults = { ...results, verification_costs: verificationResults.cost_per_bracket }

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
