import { NextRequest, NextResponse } from 'next/server'
import { loadScenarioComputeData, computeAtWeights } from '@/lib/api-helpers/scenario-data-loader'
import type { Scenario } from '@/types/scenario'
import { SCENARIO_VERIFICATION_WEIGHTS } from '@/types'

/**
 * Preview compute: same logic as /scenarios/[id]/compute but without saving.
 * Accepts full scenario config in request body.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { weights, ...scenarioBody } = body
    const sc = scenarioBody as Scenario
    const customWeights = Array.isArray(weights) ? weights : undefined

    const data = await loadScenarioComputeData(sc)

    if (data.pricingMode === 'bc_combined' && !data.vendorBCRate) {
      return NextResponse.json({ error: 'BC 供應商尚未設定費率' }, { status: 400 })
    }
    if (data.pricingMode === 'segmented' && data.vendorBRates.length === 0 && !sc.vendor_b_id) {
      return NextResponse.json({ error: '請選擇 B段供應商' }, { status: 400 })
    }

    const results = computeAtWeights(data, customWeights)

    // Also compute verification costs at 24 weight points (unless custom weights were provided)
    if (!customWeights) {
      const verificationResults = computeAtWeights(data, SCENARIO_VERIFICATION_WEIGHTS)
      return NextResponse.json({ ...results, verification_costs: verificationResults.cost_per_bracket })
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Preview compute error:', error)
    return NextResponse.json({ error: '預覽計算失敗' }, { status: 500 })
  }
}
