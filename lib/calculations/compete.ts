/**
 * Tab 3: Compete (競價對比) — bracket-level margin analysis against competitor prices.
 */

import type { WeightPoint } from '@/types'
import type { ScenarioComputeData } from '@/lib/api-helpers/scenario-data-loader'
import { computeAtWeights } from '@/lib/api-helpers/scenario-data-loader'
import type {
  CompetitorBracketPrice,
  CompeteBracketResult,
  CompeteResult,
  CompeteSummary,
  PriceUnit,
  SegmentBreakdown,
} from '@/types/pricing-analysis'
import { getVerdict } from '@/types/pricing-analysis'

interface CompeteParams {
  competitorPrices: CompetitorBracketPrice[]
  priceUnit: PriceUnit
  adjustmentPct: number
  manualOverrides?: Array<{ weight_bracket: string; override_price: number }>
  weightDistribution?: Array<{ weight_bracket: string; proportion: number }>
}

export function competeAnalysis(
  data: ScenarioComputeData,
  params: CompeteParams,
): CompeteResult {
  const { competitorPrices, priceUnit, adjustmentPct, manualOverrides, weightDistribution } = params

  // Build WeightPoint[] from competitor brackets
  const weightPoints: WeightPoint[] = competitorPrices.map((cp) => ({
    range: cp.weight_bracket,
    min: cp.weight_min,
    max: cp.weight_max,
    representative: cp.representative_weight,
  }))

  // Compute costs at all bracket representative weights
  const results = computeAtWeights(data, weightPoints)
  const costs = results.cost_per_bracket

  // Build override lookup
  const overrideMap = new Map<string, number>()
  if (manualOverrides) {
    for (const o of manualOverrides) {
      overrideMap.set(o.weight_bracket, o.override_price)
    }
  }

  // Build distribution lookup
  const distMap = new Map<string, number>()
  if (weightDistribution) {
    for (const d of weightDistribution) {
      distMap.set(d.weight_bracket, d.proportion)
    }
  }

  // Calculate per-bracket results
  const brackets: CompeteBracketResult[] = competitorPrices.map((cp, i) => {
    const cost = costs[i]
    const competitorPrice = cp.price
    const repWeight = cp.representative_weight

    // Use competitor's actual freight (includes weight-step rounding) as base,
    // then apply adjustment. This matches CompeteTab's frontend recalculation.
    const competitorFreight = competitorPrice - (cp.reg_fee ?? 0)
    const myFreight = competitorFreight * (1 + adjustmentPct)
    const myFreightRate = repWeight > 0 ? myFreight / repWeight : 0
    const myRegFee = cp.reg_fee ?? 0

    // Check for manual override (overrides total price)
    const overridePrice = overrideMap.get(cp.weight_bracket)
    const isOverride = overridePrice !== undefined
    const myPrice = isOverride ? overridePrice : (myFreight + myRegFee)

    // Convert to per-ticket revenue if per_kg
    const myRevenue = priceUnit === 'per_ticket' ? myPrice : myPrice * repWeight
    const myCost = cost.cost_hkd

    const marginAmount = myRevenue - myCost
    const marginPct = myRevenue > 0 ? marginAmount / myRevenue : -Infinity

    const breakdown: SegmentBreakdown = {
      a: cost.seg_a,
      b: cost.seg_b,
      c: cost.seg_c,
      d: cost.seg_d,
      bc: cost.seg_bc,
      b2: cost.seg_b2,
      b2c: cost.seg_b2c,
    }

    return {
      weight_bracket: cp.weight_bracket,
      representative_weight: repWeight,
      competitor_price: competitorPrice,
      competitor_rate_per_kg: cp.rate_per_kg ?? 0,
      competitor_reg_fee: cp.reg_fee ?? 0,
      my_price: Math.round(myPrice * 100) / 100,
      my_freight_rate: Math.round(myFreightRate * 100) / 100,
      my_freight: Math.round(myFreight * 100) / 100,
      my_reg_fee: Math.round(myRegFee * 100) / 100,
      is_manual_override: isOverride,
      my_cost: Math.round(myCost * 100) / 100,
      margin_amount: Math.round(marginAmount * 100) / 100,
      margin_pct: marginPct,
      verdict: getVerdict(marginPct),
      segment_breakdown: breakdown,
    }
  })

  // Weighted margin
  let weightedMargin: number | null = null
  if (weightDistribution && weightDistribution.length > 0) {
    let totalProportion = 0
    let weightedSum = 0
    for (const b of brackets) {
      const prop = distMap.get(b.weight_bracket) ?? 0
      if (prop > 0) {
        weightedSum += b.margin_pct * prop
        totalProportion += prop
      }
    }
    if (totalProportion > 0) {
      weightedMargin = weightedSum / totalProportion
    }
  }

  // Summary
  const profitable = brackets.filter((b) => b.verdict === 'profitable').length
  const marginal = brackets.filter((b) => b.verdict === 'marginal').length
  const loss = brackets.filter((b) => b.verdict === 'loss').length

  const sorted = [...brackets].sort((a, b) => b.margin_pct - a.margin_pct)
  const summary: CompeteSummary = {
    profitable_brackets: profitable,
    marginal_brackets: marginal,
    loss_brackets: loss,
    best_bracket: sorted[0]?.weight_bracket ?? '',
    worst_bracket: sorted[sorted.length - 1]?.weight_bracket ?? '',
    total_manual_overrides: brackets.filter((b) => b.is_manual_override).length,
  }

  return {
    brackets,
    weighted_margin: weightedMargin,
    summary,
    pricing_mode: data.pricingMode,
    scenario_costs: costs,
  }
}
