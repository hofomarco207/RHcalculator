/**
 * B+D coupled gateway optimizer.
 *
 * For each zip group × each gateway: compute B+D cost per ticket.
 * Assign each zip group to the cheapest gateway.
 * Iterate because volume changes affect tier pricing.
 */

import type { ExchangeRates, LastMileRate, ZipZoneMapping } from '@/types'
import type { VendorBRate } from '@/types/vendor'
import { resolveBCost } from './scenario'

const KG_TO_OZ = 35.274
const MAX_ITERATIONS = 5

export interface ZipGroup {
  prefix3: string
  ticketCount: number
  avgWeightKg: number
}

export interface OptimizationResult {
  allocation: Record<string, number>     // gateway → proportion
  costPerTicket: number                  // weighted average B+D cost
  zipAssignments: Record<string, string> // prefix3 → assigned gateway
  iterations: number
  perGatewayCost: Record<string, number> // gateway → avg B+D cost for assigned zips
}

/**
 * Build a zone lookup: carrier → gateway → zip_prefix → zone
 */
function buildZoneLookup(
  zoneMappings: ZipZoneMapping[]
): Record<string, Record<string, Record<string, number>>> {
  const lookup: Record<string, Record<string, Record<string, number>>> = {}
  for (const m of zoneMappings) {
    if (!lookup[m.carrier]) lookup[m.carrier] = {}
    if (!lookup[m.carrier][m.gateway]) lookup[m.carrier][m.gateway] = {}
    lookup[m.carrier][m.gateway][m.zip_prefix] = m.zone
  }
  return lookup
}

/**
 * Compute D段 cost for a single zip prefix via a specific gateway.
 * Returns cost in USD.
 */
function computeDCostForZip(
  zipPrefix3: string,
  gateway: string,
  weightKg: number,
  carrierMix: Array<{ carrier: string; pct: number }>,
  lastMileRates: LastMileRate[],
  zoneLookup: Record<string, Record<string, Record<string, number>>>
): number {
  const weightOz = weightKg * KG_TO_OZ
  let totalUsd = 0

  for (const cm of carrierMix) {
    if (cm.pct === 0) continue

    const carrierRates = lastMileRates.filter((r) => r.carrier === cm.carrier)
    if (carrierRates.length === 0) continue

    // Look up zone for this zip × gateway × carrier
    const gwLookup = zoneLookup[cm.carrier]?.[gateway]
    const zone = gwLookup?.[zipPrefix3] ?? 4 // default zone 4

    // Find rate for this zone × weight. Sort by weight_oz_max ASC so find()
    // returns the smallest bracket covering the weight — robust against
    // legacy rows where weight_oz_min is 0 and DB row ordering.
    const zoneRates = carrierRates
      .filter((r) => r.zone === zone)
      .sort((a, b) => a.weight_oz_max - b.weight_oz_max)
    const rate = zoneRates.find((r) => weightOz <= r.weight_oz_max)

    if (rate) {
      totalUsd += rate.price_usd * cm.pct
    }
  }

  return totalUsd
}

/**
 * Run the B+D coupled gateway optimization.
 */
export function optimizeGatewayAllocation(
  zipGroups: ZipGroup[],
  vendorBRates: VendorBRate[],
  lastMileRates: LastMileRate[],
  zoneMappings: ZipZoneMapping[],
  carrierMix: Array<{ carrier: string; pct: number }>,
  exchangeRates: ExchangeRates,
  availableGateways: string[],
  bubbleRate: number,
  weeklyTickets: number
): OptimizationResult {
  if (zipGroups.length === 0 || availableGateways.length === 0) {
    const uniform = 1.0 / (availableGateways.length || 1)
    return {
      allocation: Object.fromEntries(availableGateways.map((g) => [g, uniform])),
      costPerTicket: 0,
      zipAssignments: {},
      iterations: 0,
      perGatewayCost: {},
    }
  }

  const totalTickets = zipGroups.reduce((s, z) => s + z.ticketCount, 0)
  const zoneLookup = buildZoneLookup(zoneMappings)

  // Start with uniform allocation to determine initial tiers
  let allocation: Record<string, number> = Object.fromEntries(
    availableGateways.map((g) => [g, 1.0 / availableGateways.length])
  )

  let zipAssignments: Record<string, string> = {}
  let iterations = 0

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    iterations = iter + 1
    const newAssignments: Record<string, string> = {}
    const gwTickets: Record<string, number> = Object.fromEntries(availableGateways.map((g) => [g, 0]))

    // Pre-compute B段 cost per gateway (depends on current allocation → volume → tier)
    const bCosts: Record<string, ReturnType<typeof resolveBCost>> = {}
    for (const gw of availableGateways) {
      const gwPct = allocation[gw] ?? 0
      const gwWeeklyKg = weeklyTickets * gwPct * 1.2 // avg weight estimate
      const gwRates = vendorBRates.filter((r) => r.gateway_code === gw)
      const flights = gwRates[0]?.flights_per_week ?? 7
      const kgPerMawb = flights > 0 ? gwWeeklyKg / flights : gwWeeklyKg
      bCosts[gw] = resolveBCost(vendorBRates, gw, kgPerMawb, exchangeRates)
    }

    // Assign each zip group to cheapest gateway (B+D combined)
    for (const zip of zipGroups) {
      let bestGw = availableGateways[0]
      let bestCost = Infinity

      for (const gw of availableGateways) {
        const bCost = bCosts[gw]
        if (!bCost) continue

        // B段 per-ticket cost
        const bPerTicket = bCost.rate_per_kg_hkd * zip.avgWeightKg * bubbleRate

        // D段 per-ticket cost
        const dCostUsd = computeDCostForZip(
          zip.prefix3, gw, zip.avgWeightKg, carrierMix, lastMileRates, zoneLookup
        )
        const dPerTicket = dCostUsd * exchangeRates.usd_hkd

        const totalBD = bPerTicket + dPerTicket
        if (totalBD < bestCost) {
          bestCost = totalBD
          bestGw = gw
        }
      }

      newAssignments[zip.prefix3] = bestGw
      gwTickets[bestGw] = (gwTickets[bestGw] ?? 0) + zip.ticketCount
    }

    // Calculate new allocation proportions
    const newAllocation: Record<string, number> = {}
    for (const gw of availableGateways) {
      newAllocation[gw] = totalTickets > 0 ? (gwTickets[gw] ?? 0) / totalTickets : 0
    }

    // Check convergence (< 1% change in any gateway)
    let converged = true
    for (const gw of availableGateways) {
      if (Math.abs((newAllocation[gw] ?? 0) - (allocation[gw] ?? 0)) > 0.01) {
        converged = false
        break
      }
    }

    allocation = newAllocation
    zipAssignments = newAssignments

    if (converged) break
  }

  // Compute final weighted cost
  let totalWeightedCost = 0
  const perGatewayCost: Record<string, number> = {}
  const perGatewayTickets: Record<string, number> = {}

  for (const zip of zipGroups) {
    const gw = zipAssignments[zip.prefix3] ?? availableGateways[0]
    const bCost = resolveBCost(
      vendorBRates, gw,
      (() => {
        const gwPct = allocation[gw] ?? 0
        const gwWeeklyKg = weeklyTickets * gwPct * zip.avgWeightKg
        const flights = vendorBRates.find((r) => r.gateway_code === gw)?.flights_per_week ?? 7
        return flights > 0 ? gwWeeklyKg / flights : gwWeeklyKg
      })(),
      exchangeRates
    )

    const bPerTicket = bCost ? bCost.rate_per_kg_hkd * zip.avgWeightKg * bubbleRate : 0
    const dCostUsd = computeDCostForZip(zip.prefix3, gw, zip.avgWeightKg, carrierMix, lastMileRates, zoneLookup)
    const dPerTicket = dCostUsd * exchangeRates.usd_hkd
    const ticketCost = bPerTicket + dPerTicket

    totalWeightedCost += ticketCost * zip.ticketCount
    perGatewayCost[gw] = (perGatewayCost[gw] ?? 0) + ticketCost * zip.ticketCount
    perGatewayTickets[gw] = (perGatewayTickets[gw] ?? 0) + zip.ticketCount
  }

  // Normalize per-gateway cost to average
  for (const gw of availableGateways) {
    if (perGatewayTickets[gw] > 0) {
      perGatewayCost[gw] = perGatewayCost[gw] / perGatewayTickets[gw]
    }
  }

  return {
    allocation,
    costPerTicket: totalTickets > 0 ? totalWeightedCost / totalTickets : 0,
    zipAssignments,
    iterations,
    perGatewayCost,
  }
}

/**
 * Aggregate historical shipments into zip groups (3-digit prefix).
 * If no historical data, creates groups from zip_zone_mapping prefixes.
 */
export function aggregateZipDistribution(
  shipments: Array<{ zip_code: string; weight_kg: number }>
): ZipGroup[] {
  const groups = new Map<string, { count: number; totalWeight: number }>()

  for (const s of shipments) {
    const prefix3 = s.zip_code.replace(/\D/g, '').substring(0, 3)
    if (!prefix3 || prefix3.length < 3) continue

    const existing = groups.get(prefix3)
    if (existing) {
      existing.count++
      existing.totalWeight += s.weight_kg
    } else {
      groups.set(prefix3, { count: 1, totalWeight: s.weight_kg })
    }
  }

  return [...groups.entries()].map(([prefix3, { count, totalWeight }]) => ({
    prefix3,
    ticketCount: count,
    avgWeightKg: totalWeight / count,
  }))
}
