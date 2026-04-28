import { NextRequest, NextResponse } from 'next/server'
import { loadScenarioById, loadScenarioComputeData } from '@/lib/api-helpers/scenario-data-loader'
import { competeAnalysis } from '@/lib/calculations/compete'
import type { CompeteInput } from '@/types/pricing-analysis'

export async function POST(request: NextRequest) {
  try {
    const body: CompeteInput = await request.json()
    const {
      competitor_prices,
      price_unit,
      scenario_id,
      adjustment_pct,
      country_code,
      manual_overrides,
      weight_distribution,
    } = body

    if (!scenario_id || !competitor_prices?.length) {
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

    const result = competeAnalysis(data, {
      competitorPrices: competitor_prices,
      priceUnit: price_unit,
      adjustmentPct: adjustment_pct ?? 0,
      countryCode: country_code ?? '',
      manualOverrides: manual_overrides,
      weightDistribution: weight_distribution,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Compete error:', error)
    return NextResponse.json({ error: '競價計算失敗' }, { status: 500 })
  }
}
