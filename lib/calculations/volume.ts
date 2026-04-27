/**
 * Volume-cost curve computation.
 * Computes total per-ticket cost at various weekly ticket volumes.
 * Output is ready for recharts visualization.
 */

import type { ExchangeRates } from '@/types'
import type { VendorBRate, VendorCRate } from '@/types/vendor'
import type { Scenario } from '@/types/scenario'
import { resolveBCost, resolveCCost } from './scenario'

export interface VolumeCurvePoint {
  tickets: number
  costPerTicket: number   // total B+C variable per ticket in HKD
  bCostPerTicket: number
  cCostPerTicket: number
  tier: string            // current tier label
}

export interface VolumeCurveData {
  points: VolumeCurvePoint[]
  tierJumps: Array<{
    tickets: number
    fromTier: string
    toTier: string
    costDrop: number       // HKD savings per ticket at jump
  }>
  optimalMinTickets: number  // tickets where cost stabilizes (< 1% change)
}

const TICKET_POINTS = [
  50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 2500,
  3000, 4000, 5000, 6000, 7000, 8000, 10000, 12000, 15000, 20000,
]

/**
 * Compute volume-cost curve for a scenario's B+C segment costs.
 * A段 and D段 are excluded since they don't vary with volume.
 */
export function computeVolumeCurve(
  scenario: Scenario,
  vendorBRates: VendorBRate[],
  vendorCRates: VendorCRate[],
  gwProportions: Record<string, number>,
  avgWeightKg: number,
  exchangeRates: ExchangeRates,
  bufferPct: number = 0.1,
): VolumeCurveData {
  const useMedian = scenario.use_median_pricing === true
  const points: VolumeCurvePoint[] = []
  const tierJumps: VolumeCurveData['tierJumps'] = []
  let prevTier = ''
  let prevCost = 0

  for (const tickets of TICKET_POINTS) {
    let totalB = 0
    let totalC = 0
    let tierKey = ''

    for (const [gw, pct] of Object.entries(gwProportions)) {
      if (pct <= 0) continue

      // Calculate gateway volume
      const gwWeeklyKg = tickets * pct * avgWeightKg
      const gwRates = vendorBRates.filter((r) => r.gateway_code === gw)
      const flights = scenario.flights_per_week ?? gwRates[0]?.flights_per_week ?? 7
      const kgPerMawb = flights > 0 ? gwWeeklyKg / flights : gwWeeklyKg
      const ticketsPerMawb = flights > 0 ? (tickets * pct) / flights : tickets * pct

      // B段
      const bCost = resolveBCost(vendorBRates, gw, kgPerMawb, exchangeRates, ticketsPerMawb, useMedian, bufferPct)
      if (bCost) {
        const bPerTicket = bCost.rate_per_kg_hkd * avgWeightKg * (scenario.b_bubble_rate ?? 1.1) +
          (ticketsPerMawb > 0 ? bCost.mawb_fixed_hkd / ticketsPerMawb : 0)
        totalB += bPerTicket * pct
        tierKey += `${gw}:${bCost.tier_label},`
      }

      // C段
      const cCost = resolveCCost(vendorCRates, avgWeightKg, gw, ticketsPerMawb, exchangeRates)
      totalC += cCost.per_ticket_hkd * pct
    }

    const tier = tierKey.replace(/,$/, '')
    const costPerTicket = totalB + totalC

    points.push({
      tickets,
      costPerTicket: Math.round(costPerTicket * 100) / 100,
      bCostPerTicket: Math.round(totalB * 100) / 100,
      cCostPerTicket: Math.round(totalC * 100) / 100,
      tier,
    })

    // Detect tier jumps
    if (prevTier && tier !== prevTier) {
      tierJumps.push({
        tickets,
        fromTier: prevTier,
        toTier: tier,
        costDrop: Math.round((prevCost - costPerTicket) * 100) / 100,
      })
    }

    prevTier = tier
    prevCost = costPerTicket
  }

  // Find optimal min tickets (where further increases save < 1%)
  let optimalMinTickets = TICKET_POINTS[0]
  for (let i = 1; i < points.length; i++) {
    const pctChange = Math.abs(points[i].costPerTicket - points[i - 1].costPerTicket) / points[i - 1].costPerTicket
    if (pctChange < 0.01) {
      optimalMinTickets = points[i - 1].tickets
      break
    }
    optimalMinTickets = points[i].tickets
  }

  return { points, tierJumps, optimalMinTickets }
}
