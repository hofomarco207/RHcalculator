/**
 * Tab 1: Evaluate (驗價) — single weight point margin calculation + sensitivity.
 */

import type { WeightPoint } from '@/types'
import type { ScenarioComputeData } from '@/lib/api-helpers/scenario-data-loader'
import { computeAtWeights } from '@/lib/api-helpers/scenario-data-loader'
import type { EvaluateResult, PriceUnit, SensitivityPoint, SegmentBreakdown } from '@/types/pricing-analysis'
import { getVerdict } from '@/types/pricing-analysis'

const SENSITIVITY_FACTORS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3]

function makeWeightPoint(weight: number): WeightPoint {
  return {
    range: `${weight}kg`,
    min: Math.max(0, weight - 0.01),
    max: weight,
    representative: weight,
  }
}

export function evaluatePrice(
  data: ScenarioComputeData,
  price: number,
  priceUnit: PriceUnit,
  representativeWeight: number,
): EvaluateResult {
  // Build weight points for sensitivity analysis
  const sensitivityWeights = SENSITIVITY_FACTORS.map(
    (f) => Math.round(representativeWeight * f * 1000) / 1000
  )
  const allWeights = [...new Set(sensitivityWeights)].sort((a, b) => a - b)
  const weightPoints = allWeights.map(makeWeightPoint)

  // Compute costs at all sensitivity weights in one call
  const results = computeAtWeights(data, weightPoints)
  const costs = results.cost_per_bracket

  // Find the representative weight result
  const repIdx = allWeights.indexOf(representativeWeight)
  const repCost = costs[repIdx >= 0 ? repIdx : Math.floor(costs.length / 2)]

  const revenue = priceUnit === 'per_ticket' ? price : price * representativeWeight
  const cost = repCost.cost_hkd
  const margin = revenue > 0 ? (revenue - cost) / revenue : -Infinity

  const breakdown: SegmentBreakdown = {
    a: repCost.seg_a,
    b: repCost.seg_b,
    c: repCost.seg_c,
    d: repCost.seg_d,
    bc: repCost.seg_bc,
    b2: repCost.seg_b2,
    b2c: repCost.seg_b2c,
  }

  // Build sensitivity array
  const sensitivity: SensitivityPoint[] = sensitivityWeights.map((w) => {
    const idx = allWeights.indexOf(w)
    const c = costs[idx]
    const rev = priceUnit === 'per_ticket' ? price : price * w
    const m = rev > 0 ? (rev - c.cost_hkd) / rev : -Infinity
    return { weight: w, cost: c.cost_hkd, revenue: rev, margin: m }
  })

  return {
    revenue,
    cost,
    margin,
    verdict: getVerdict(margin),
    segment_breakdown: breakdown,
    sensitivity,
    pricing_mode: data.pricingMode,
  }
}
