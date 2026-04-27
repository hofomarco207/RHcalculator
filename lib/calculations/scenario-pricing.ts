import type { RateCardBracket } from '@/types'
import type { BracketCost } from '@/types/scenario'

/**
 * Registration fee lookup by weight (HKD).
 * Weight-based, not bracket-range-string-based, so it works with custom brackets.
 */
export function getRegFee(weightKg: number): number {
  if (weightKg <= 0.1) return 32
  if (weightKg <= 0.45) return 29
  return 36
}

/**
 * Generate rate card brackets from pre-computed scenario costs.
 * Uses the same margin/pricing formula as pricing.ts but reads costs
 * directly from ScenarioResults instead of recomputing them.
 */
/**
 * Update a single bracket's freight rate and recalculate margin.
 */
export function updateBracketMargin(
  bracket: RateCardBracket,
  newFreightRate: number,
  newRegFee?: number
): RateCardBracket {
  const regFee = newRegFee !== undefined ? newRegFee : bracket.reg_fee_hkd
  const revenue = newFreightRate * bracket.representative_weight_kg + regFee
  const margin = revenue > 0 ? (revenue - bracket.cost_hkd) / revenue : 0
  return {
    ...bracket,
    freight_rate_hkd_per_kg: newFreightRate,
    reg_fee_hkd: regFee,
    revenue_hkd: revenue,
    actual_margin: margin,
    is_manually_adjusted: true,
  }
}

/**
 * Generate rate card brackets from pre-computed scenario costs.
 */
export function generateRateCardFromScenario(
  scenarioCosts: BracketCost[],
  targetMargin: number
): RateCardBracket[] {
  return scenarioCosts.map((bracket) => {
    const cost = bracket.cost_hkd
    const regFee = getRegFee(bracket.representative_weight_kg)
    const revenue = targetMargin < 1 ? cost / (1 - targetMargin) : cost * 2
    const freightRate = Math.ceil(Math.max(0, (revenue - regFee) / bracket.representative_weight_kg))
    const actualRevenue = Math.ceil(freightRate * bracket.representative_weight_kg + regFee)
    const actualMargin = actualRevenue > 0 ? (actualRevenue - cost) / actualRevenue : 0

    return {
      weight_range: bracket.weight_range,
      weight_min_kg: bracket.weight_min_kg,
      weight_max_kg: bracket.weight_max_kg,
      representative_weight_kg: bracket.representative_weight_kg,
      cost_hkd: cost,
      freight_rate_hkd_per_kg: freightRate,
      reg_fee_hkd: regFee,
      revenue_hkd: actualRevenue,
      actual_margin: actualMargin,
      is_manually_adjusted: false,
    }
  })
}
