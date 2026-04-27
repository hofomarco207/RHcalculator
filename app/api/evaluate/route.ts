import { NextRequest, NextResponse } from 'next/server'
import { loadScenarioById, loadScenarioComputeData } from '@/lib/api-helpers/scenario-data-loader'
import { evaluatePrice } from '@/lib/calculations/evaluate'
import type { EvaluateInput } from '@/types/pricing-analysis'

export async function POST(request: NextRequest) {
  try {
    const body: EvaluateInput = await request.json()
    const { price, price_unit, representative_weight, scenario_id } = body

    if (!scenario_id || !price || !representative_weight) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
    }

    const scenario = await loadScenarioById(scenario_id)
    if (!scenario) {
      return NextResponse.json({ error: '找不到方案' }, { status: 404 })
    }

    const data = await loadScenarioComputeData(scenario)

    if (data.pricingMode === 'bc_combined' && !data.vendorBCRate) {
      return NextResponse.json({ error: 'BC 供應商尚未設定費率' }, { status: 400 })
    }

    const result = evaluatePrice(data, price, price_unit, representative_weight)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Evaluate error:', error)
    return NextResponse.json({ error: '驗價計算失敗' }, { status: 500 })
  }
}
