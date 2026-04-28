import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { loadScenarioComputeData, computeAtWeights } from '@/lib/api-helpers/scenario-data-loader'
import type { Scenario } from '@/types/scenario'
import type { WeightPoint } from '@/types'

interface CountryRequest {
  country_code: string
  brackets: Array<{
    weight_min: number
    weight_max: number
    representative_weight: number
    label: string
  }>
}

/**
 * POST /api/pricing-flow/batch-costs
 * Computes scenario costs for multiple countries in parallel.
 * Body: { scenario_id: string, countries: CountryRequest[] }
 * Returns: { results: { country_code, bracket_costs: { label, cost_hkd }[] }[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { scenario_id, countries } = body as {
      scenario_id: string
      countries: CountryRequest[]
    }

    if (!scenario_id || !countries?.length) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: scenario, error } = await supabase
      .from('scenarios')
      .select('*')
      .eq('id', scenario_id)
      .single()

    if (error || !scenario) {
      return NextResponse.json({ error: '找不到方案' }, { status: 404 })
    }

    const data = await loadScenarioComputeData(scenario as Scenario)
    if (!data.vendorBCRate) {
      return NextResponse.json({ error: 'BC 供應商尚未設定費率' }, { status: 400 })
    }

    // Compute all countries in parallel
    const results = await Promise.all(
      countries.map(async (cr) => {
        const weightPoints: WeightPoint[] = cr.brackets.map((b) => ({
          range: b.label,
          min: b.weight_min,
          max: b.weight_max,
          representative: b.representative_weight,
        }))

        try {
          const computed = computeAtWeights(data, weightPoints, cr.country_code)
          const bracket_costs = computed.cost_per_bracket.map((c, i) => ({
            label: cr.brackets[i]?.label ?? c.weight_range,
            cost_hkd: c.cost_hkd,
          }))
          return { country_code: cr.country_code, bracket_costs, ok: true }
        } catch {
          // Country not serviceable by D-segment — return nulls
          return {
            country_code: cr.country_code,
            bracket_costs: cr.brackets.map((b) => ({ label: b.label, cost_hkd: null })),
            ok: false,
          }
        }
      }),
    )

    return NextResponse.json({ results })
  } catch (error) {
    console.error('batch-costs error:', error)
    return NextResponse.json({ error: '批量成本計算失敗' }, { status: 500 })
  }
}
