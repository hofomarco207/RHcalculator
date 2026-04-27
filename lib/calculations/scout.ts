/**
 * Tab 2: Scout (方案搜索) — enumerate vendor combos that meet min margin.
 *
 * Strategy:
 * 1. For each segment, compute cost at the representative weight independently
 * 2. Take top-N cheapest per segment to cap combos
 * 3. Enumerate all combos, sum costs, filter by margin
 *
 * This avoids calling the full compute engine per combo (which needs DB data).
 * Instead we pre-compute segment costs and just sum them.
 */

import type { ScoutCombination, ScoutResult, ScoutVendorInfo, PriceUnit, SegmentBreakdown } from '@/types/pricing-analysis'
import { getVerdict } from '@/types/pricing-analysis'

const TOP_N = 5
const MAX_COMBOS = 500

// ─── Pre-computed segment cost for a single vendor ──────────────────────────

export interface SegmentCostEntry {
  vendor: ScoutVendorInfo
  cost: number
}

export interface ScoutData {
  pricingMode: 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c'
  aEntries: SegmentCostEntry[]
  // segmented
  bEntries: SegmentCostEntry[]
  cEntries: SegmentCostEntry[]
  // bc_combined
  bcEntries: SegmentCostEntry[]
  // shared
  dEntries: SegmentCostEntry[]
  // multi-leg
  b2Entries?: SegmentCostEntry[]
  b2cEntries?: SegmentCostEntry[]
}

export function scoutFeasibleCombinations(
  data: ScoutData,
  price: number,
  priceUnit: PriceUnit,
  representativeWeight: number,
  minMargin: number,
): ScoutResult {
  const revenue = priceUnit === 'per_ticket' ? price : price * representativeWeight

  if (revenue <= 0) {
    return { feasible_combinations: [], total_combinations_checked: 0 }
  }

  // Take top-N cheapest per segment
  const sortedA = [...data.aEntries].sort((a, b) => a.cost - b.cost)
  const sortedD = [...data.dEntries].sort((a, b) => a.cost - b.cost).slice(0, TOP_N)

  let totalChecked = 0
  const feasible: ScoutCombination[] = []

  if (data.pricingMode === 'bc_combined') {
    const sortedBC = [...data.bcEntries].sort((a, b) => a.cost - b.cost).slice(0, TOP_N)

    for (const a of sortedA) {
      for (const bc of sortedBC) {
        for (const d of sortedD) {
          totalChecked++
          if (totalChecked > MAX_COMBOS) break

          const cost = a.cost + bc.cost + d.cost
          const margin = (revenue - cost) / revenue
          if (margin < minMargin) continue

          feasible.push({
            vendors: {
              a: a.vendor,
              bc: bc.vendor,
              d: d.vendor,
            },
            cost: Math.round(cost * 100) / 100,
            margin,
            segment_breakdown: {
              a: Math.round(a.cost * 100) / 100,
              b: 0,
              c: 0,
              d: Math.round(d.cost * 100) / 100,
              bc: Math.round(bc.cost * 100) / 100,
            },
          })
        }
        if (totalChecked > MAX_COMBOS) break
      }
      if (totalChecked > MAX_COMBOS) break
    }
  } else if (data.pricingMode === 'multi_b') {
    // A × B1 × B2 × C × D
    const sortedB1 = [...data.bEntries].sort((a, b) => a.cost - b.cost).slice(0, TOP_N)
    const sortedB2 = [...(data.b2Entries ?? data.bEntries)].sort((a, b) => a.cost - b.cost).slice(0, TOP_N)
    const sortedC = [...data.cEntries].sort((a, b) => a.cost - b.cost).slice(0, TOP_N)

    for (const a of sortedA) {
      for (const b1 of sortedB1) {
        for (const b2 of sortedB2) {
          // Skip if B1 and B2 are the same vendor
          if (b1.vendor.id === b2.vendor.id) continue
          for (const c of sortedC) {
            for (const d of sortedD) {
              totalChecked++
              if (totalChecked > MAX_COMBOS) break

              const cost = a.cost + b1.cost + b2.cost + c.cost + d.cost
              const margin = (revenue - cost) / revenue
              if (margin < minMargin) continue

              feasible.push({
                vendors: {
                  a: a.vendor,
                  b: b1.vendor,
                  b2: b2.vendor,
                  c: c.vendor,
                  d: d.vendor,
                },
                cost: Math.round(cost * 100) / 100,
                margin,
                segment_breakdown: {
                  a: Math.round(a.cost * 100) / 100,
                  b: Math.round(b1.cost * 100) / 100,
                  b2: Math.round(b2.cost * 100) / 100,
                  c: Math.round(c.cost * 100) / 100,
                  d: Math.round(d.cost * 100) / 100,
                },
              })
            }
            if (totalChecked > MAX_COMBOS) break
          }
          if (totalChecked > MAX_COMBOS) break
        }
        if (totalChecked > MAX_COMBOS) break
      }
      if (totalChecked > MAX_COMBOS) break
    }
  } else if (data.pricingMode === 'multi_b_b2c') {
    // A × B1 × B2C × D (no C)
    const sortedB1 = [...data.bEntries].sort((a, b) => a.cost - b.cost).slice(0, TOP_N)
    const sortedB2C = [...(data.b2cEntries ?? data.bcEntries)].sort((a, b) => a.cost - b.cost).slice(0, TOP_N)

    for (const a of sortedA) {
      for (const b1 of sortedB1) {
        for (const b2c of sortedB2C) {
          for (const d of sortedD) {
            totalChecked++
            if (totalChecked > MAX_COMBOS) break

            const cost = a.cost + b1.cost + b2c.cost + d.cost
            const margin = (revenue - cost) / revenue
            if (margin < minMargin) continue

            feasible.push({
              vendors: {
                a: a.vendor,
                b: b1.vendor,
                b2c: b2c.vendor,
                d: d.vendor,
              },
              cost: Math.round(cost * 100) / 100,
              margin,
              segment_breakdown: {
                a: Math.round(a.cost * 100) / 100,
                b: Math.round(b1.cost * 100) / 100,
                b2c: Math.round(b2c.cost * 100) / 100,
                c: 0,
                d: Math.round(d.cost * 100) / 100,
              },
            })
          }
          if (totalChecked > MAX_COMBOS) break
        }
        if (totalChecked > MAX_COMBOS) break
      }
      if (totalChecked > MAX_COMBOS) break
    }
  } else {
    // Segmented mode
    const sortedB = [...data.bEntries].sort((a, b) => a.cost - b.cost).slice(0, TOP_N)
    const sortedC = [...data.cEntries].sort((a, b) => a.cost - b.cost).slice(0, TOP_N)

    for (const a of sortedA) {
      for (const b of sortedB) {
        for (const c of sortedC) {
          for (const d of sortedD) {
            totalChecked++
            if (totalChecked > MAX_COMBOS) break

            const cost = a.cost + b.cost + c.cost + d.cost
            const margin = (revenue - cost) / revenue
            if (margin < minMargin) continue

            feasible.push({
              vendors: {
                a: a.vendor,
                b: b.vendor,
                c: c.vendor,
                d: d.vendor,
              },
              cost: Math.round(cost * 100) / 100,
              margin,
              segment_breakdown: {
                a: Math.round(a.cost * 100) / 100,
                b: Math.round(b.cost * 100) / 100,
                c: Math.round(c.cost * 100) / 100,
                d: Math.round(d.cost * 100) / 100,
              },
            })
          }
          if (totalChecked > MAX_COMBOS) break
        }
        if (totalChecked > MAX_COMBOS) break
      }
      if (totalChecked > MAX_COMBOS) break
    }
  }

  // Sort by margin desc
  feasible.sort((a, b) => b.margin - a.margin)

  return {
    feasible_combinations: feasible,
    total_combinations_checked: totalChecked,
  }
}
