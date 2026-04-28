import { NextRequest, NextResponse } from 'next/server'
import {
  loadScenarioById,
  loadScenarioComputeData,
  computeAtWeights,
  getCountryWeightPoints,
} from '@/lib/api-helpers/scenario-data-loader'

/**
 * POST /api/scenarios/compute-global
 * Body: { scenario_id: string, country_codes?: string[] }
 *
 * For each country found in the D-segment vendor's tiered rates, compute the full
 * A+BC+D cost at that country's own weight breakpoints.
 *
 * Returns:
 *   { scenario_name: string, countries: Array<{
 *       country_code, country_name_en, country_name_zh, cost_per_bracket
 *     }> }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { scenario_id, country_codes } = body as {
      scenario_id: string
      country_codes?: string[]
    }

    if (!scenario_id) {
      return NextResponse.json({ error: 'scenario_id required' }, { status: 400 })
    }

    const scenario = await loadScenarioById(scenario_id)
    if (!scenario) {
      return NextResponse.json({ error: '找不到方案' }, { status: 404 })
    }

    const computeData = await loadScenarioComputeData(scenario)
    const tieredRates = computeData.vendorDTieredRates

    if (tieredRates.length === 0) {
      return NextResponse.json(
        { error: 'D段供應商沒有 tiered rates，無法進行全球試算' },
        { status: 422 },
      )
    }

    // Unique country codes present in tiered rates
    const allCodes = [...new Set(tieredRates.map((r) => r.country_code).filter(Boolean))] as string[]
    const targetCodes = country_codes?.length ? country_codes.filter((c) => allCodes.includes(c)) : allCodes

    // Build country name lookup from tiered rates (first row per country)
    const nameMap = new Map<string, { en: string; zh?: string }>()
    for (const r of tieredRates) {
      if (r.country_code && !nameMap.has(r.country_code)) {
        nameMap.set(r.country_code, { en: r.country_name ?? r.country_code })
      }
    }

    const countries = targetCodes.map((cc) => {
      const weights = getCountryWeightPoints(tieredRates, cc)
      const result = computeAtWeights(computeData, weights, cc)
      const info = nameMap.get(cc) ?? { en: cc }
      return {
        country_code: cc,
        country_name_en: info.en,
        country_name_zh: info.zh ?? null,
        cost_per_bracket: result.cost_per_bracket,
      }
    })

    return NextResponse.json({ scenario_name: scenario.name, countries })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '試算失敗'
    console.error('compute-global error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
