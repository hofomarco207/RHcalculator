/**
 * Scenario cost calculation engine.
 *
 * Unlike the original cost.ts which uses a flat CostParams with a single composite
 * air freight rate, this engine works with vendor-specific rates and three-layer
 * cost structure (per-kg variable + per-HAWB + per-MAWB amortized).
 */

import type { ExchangeRates, LastMileRate, ZipZoneMapping, CarrierProportion, Vendor, WeightPoint } from '@/types'
import { WEIGHT_BRACKETS } from '@/types'
import type { VendorBRate, VendorCRate, VendorBCRate, VendorDRate, VendorDTieredRate, VendorDLookupRate, VendorDLookupAreaCountry, VendorBCDRate, BSurcharge } from '@/types/vendor'
import type {
  Scenario,
  ScenarioResults,
  BracketCost,
  BracketDetail,
  VolumeAnalysis,
  TierBreakpoint,
  MawbInfo,
} from '@/types/scenario'

const KG_TO_OZ = 35.274

/** Convert an amount in any supported currency to HKD */
function toHkd(amount: number, currency: string, rates: ExchangeRates): number {
  if (currency === 'USD') return amount * rates.usd_hkd
  if (currency === 'RMB') return amount / rates.hkd_rmb
  if (currency === 'JPY') return amount * (rates.jpy_hkd ?? 0.052)
  return amount // HKD
}

/** Get the exchange rate multiplier from a currency to HKD */
function exchangeRateToHkd(currency: string, rates: ExchangeRates): number {
  if (currency === 'USD') return rates.usd_hkd
  if (currency === 'RMB') return 1 / rates.hkd_rmb
  if (currency === 'JPY') return rates.jpy_hkd ?? 0.052
  return 1 // HKD
}

// ─── B段 Cost Resolution ────────────────────────────────────────────────────

interface BSegmentCost {
  /** Air freight per-kg rate in HKD */
  rate_per_kg_hkd: number
  /** Total per-MAWB fixed fees in HKD */
  mawb_fixed_hkd: number
  /** Which tier was matched */
  tier_label: string
  /** Flights per week for this gateway */
  flights_per_week: number
  /** Number of services considered at this gateway × tier (≥1) */
  service_count: number
  /** True when rate was derived from median × (1+buffer) across ≥2 services */
  is_median: boolean
}

/** Median of a non-empty list: middle value for odd count, average of two middle for even. */
function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Compute per-MAWB fixed fees in HKD for a single B段 rate row.
 * Prefers `surcharges` JSONB when populated; falls back to the 8 legacy columns.
 *
 * Surcharge unit handling:
 *   - per_mawb         → amount
 *   - per_kg_with_min  → max(rate × kgPerMawb, min)
 *   - per_kg           → rate × kgPerMawb
 *   - per_hawb         → amount × ticketsPerMawb (skipped if ticketsPerMawb not provided)
 *   - conditional      → skipped (treated as not-mandatory)
 *
 * Each surcharge is converted using its own currency (may differ from the main rate).
 */
function computeBMawbFixedHkd(
  rate: VendorBRate,
  kgPerMawb: number,
  exchangeRates: ExchangeRates,
  ticketsPerMawb?: number,
): number {
  const surcharges: BSurcharge[] = rate.surcharges ?? []
  if (surcharges.length > 0) {
    let totalHkd = 0
    for (const s of surcharges) {
      const currency = s.currency || rate.currency || 'RMB'
      let amountInCurrency = 0
      switch (s.unit) {
        case 'per_mawb':
          amountInCurrency = s.amount ?? 0
          break
        case 'per_kg_with_min': {
          const byKg = (s.rate ?? 0) * kgPerMawb
          amountInCurrency = Math.max(byKg, s.min ?? 0)
          break
        }
        case 'per_kg':
          amountInCurrency = (s.rate ?? 0) * kgPerMawb
          break
        case 'per_hawb':
          if (ticketsPerMawb && ticketsPerMawb > 0) {
            amountInCurrency = (s.amount ?? 0) * ticketsPerMawb
          }
          break
        case 'conditional':
          // Not-mandatory — excluded from cost calc
          break
      }
      if (amountInCurrency > 0) {
        totalHkd += toHkd(amountInCurrency, currency, exchangeRates)
      }
    }
    return totalHkd
  }

  // Fallback: legacy 8 columns (all in the main rate's currency)
  const legacyTotal =
    rate.pickup_fee + rate.handling_fee +
    rate.operation_fee + rate.document_fee +
    rate.battery_check_fee + rate.customs_fee +
    rate.airport_transfer_fee + rate.magnetic_check_fee

  return toHkd(legacyTotal, rate.currency ?? 'RMB', exchangeRates)
}

/**
 * Resolve B段 cost for a specific gateway and volume.
 * Picks the best tier the volume qualifies for, and the cheapest service option.
 *
 * Optional `ticketsPerMawb` enables per_hawb surcharge handling (added as
 * `amount × ticketsPerMawb` into `mawb_fixed_hkd`, which is later amortized by
 * the same factor downstream, preserving per-ticket cost).
 */
export function resolveBCost(
  vendorBRates: VendorBRate[],
  gateway: string,
  kgPerMawb: number,
  exchangeRates: ExchangeRates,
  ticketsPerMawb?: number,
  useMedian: boolean = false,
  bufferPct: number = 0,
): BSegmentCost | null {
  // Filter rates for this gateway
  const gwRates = vendorBRates.filter((r) => r.gateway_code === gateway)
  if (gwRates.length === 0) return null

  // Per-service matched rate: for each service, pick the tier the volume qualifies for.
  const services = [...new Set(gwRates.map((r) => r.service_name ?? ''))]
  const serviceMatches: Array<{
    service: string
    rateHkd: number
    fixedHkd: number
    tierLabel: string
    flightsPerWeek: number
  }> = []

  for (const svc of services) {
    const svcRates = gwRates
      .filter((r) => (r.service_name ?? '') === svc)
      .sort((a, b) => b.weight_tier_min_kg - a.weight_tier_min_kg) // highest tier first

    const matchedRate = svcRates.find((r) => kgPerMawb >= r.weight_tier_min_kg) ?? svcRates[svcRates.length - 1]
    if (!matchedRate) continue

    const rateHkd = toHkd(matchedRate.rate_per_kg, matchedRate.currency ?? 'RMB', exchangeRates)
    const fixedHkd = computeBMawbFixedHkd(matchedRate, kgPerMawb, exchangeRates, ticketsPerMawb)

    serviceMatches.push({
      service: svc,
      rateHkd,
      fixedHkd,
      tierLabel: matchedRate.weight_tier_min_kg > 0 ? `${matchedRate.weight_tier_min_kg}+` : '單一',
      flightsPerWeek: matchedRate.flights_per_week ?? 7,
    })
  }

  if (serviceMatches.length === 0) return null

  // Median + buffer path: only when explicitly requested AND ≥2 services available.
  if (useMedian && serviceMatches.length >= 2) {
    const buffer = 1 + bufferPct
    const medianRateHkd = median(serviceMatches.map((m) => m.rateHkd)) * buffer
    const medianFixedHkd = median(serviceMatches.map((m) => m.fixedHkd)) * buffer
    // Use the tier_label / flights from the service whose effective per-kg is nearest
    // the median (stable representative for display); fall back to the first.
    const representative = serviceMatches[0]
    return {
      rate_per_kg_hkd: medianRateHkd,
      mawb_fixed_hkd: medianFixedHkd,
      tier_label: representative.tierLabel,
      flights_per_week: representative.flightsPerWeek,
      service_count: serviceMatches.length,
      is_median: true,
    }
  }

  // Fallback: pick the cheapest service by effective per-kg cost.
  let bestCost: BSegmentCost | null = null
  let bestTotalPerKg = Infinity
  for (const m of serviceMatches) {
    const effectivePerKg = m.rateHkd + (kgPerMawb > 0 ? m.fixedHkd / kgPerMawb : 0)
    if (effectivePerKg < bestTotalPerKg) {
      bestTotalPerKg = effectivePerKg
      bestCost = {
        rate_per_kg_hkd: m.rateHkd,
        mawb_fixed_hkd: m.fixedHkd,
        tier_label: m.tierLabel,
        flights_per_week: m.flightsPerWeek,
        service_count: serviceMatches.length,
        is_median: false,
      }
    }
  }
  return bestCost
}

// ─── C段 Cost Resolution ────────────────────────────────────────────────────

interface CSegmentCost {
  /** Per-ticket cost in HKD */
  per_ticket_hkd: number
  /** Breakdown */
  mawb_amortized_hkd: number
  per_kg_hkd: number
  per_hawb_hkd: number
}

/**
 * Resolve C段 cost for a specific gateway, weight, and ticket volume.
 * Three layers: per-MAWB (amortized) + per-KG + per-HAWB.
 */
export function resolveCCost(
  vendorCRates: VendorCRate[],
  weightKg: number,
  gateway: string,
  ticketsPerMawb: number,
  exchangeRates: ExchangeRates
): CSegmentCost {
  let totalMawbUsd = 0
  let totalPerKgUsd = 0
  let totalPerHawbUsd = 0

  for (const rate of vendorCRates) {
    // Check gateway scope: null = all gateways, or must match
    if (rate.gateway_code && rate.gateway_code !== gateway) continue

    // Convert amount to USD (most C段 fees are USD already)
    let amountUsd = rate.amount
    if (rate.currency === 'HKD') amountUsd = rate.amount / exchangeRates.usd_hkd
    else if (rate.currency === 'RMB') amountUsd = rate.amount / exchangeRates.usd_rmb
    else if (rate.currency === 'JPY') amountUsd = rate.amount * (exchangeRates.jpy_hkd ?? 0.052) / exchangeRates.usd_hkd

    switch (rate.fee_type) {
      case 'per_mawb':
        totalMawbUsd += amountUsd
        break
      case 'per_kg':
        totalPerKgUsd += amountUsd * weightKg
        break
      case 'per_hawb':
        totalPerHawbUsd += amountUsd
        break
    }
  }

  // Amortize per-MAWB fees
  const mawbPerTicketUsd = ticketsPerMawb > 0 ? totalMawbUsd / ticketsPerMawb : totalMawbUsd

  // Convert all to HKD
  const mawb_amortized_hkd = mawbPerTicketUsd * exchangeRates.usd_hkd
  const per_kg_hkd = totalPerKgUsd * exchangeRates.usd_hkd
  const per_hawb_hkd = totalPerHawbUsd * exchangeRates.usd_hkd

  return {
    per_ticket_hkd: mawb_amortized_hkd + per_kg_hkd + per_hawb_hkd,
    mawb_amortized_hkd,
    per_kg_hkd,
    per_hawb_hkd,
  }
}

// ─── D段 Cost (reuses existing logic pattern) ───────────────────────────────

/**
 * Compute D段 last-mile cost with per-carrier detail for tooltip breakdown.
 *
 * Carrier fallback: if a carrier returns cost_usd = 0 at this weight (e.g.
 * GOFO max is ~9kg so it's unavailable at 10kg+), its configured pct is
 * reallocated proportionally to the remaining carriers that DO serve the
 * weight. Otherwise the weighted average would silently undercount the
 * cost of packages that must actually route through the other carriers.
 */
interface DGatewayDetail {
  weight_oz: number
  carriers: Array<{ carrier: string; pct: number; effective_pct: number; cost_usd: number }>
  avg_cost_usd: number
}

function computeLastMileCostForGatewayDetailed(
  weightKg: number,
  gateway: string,
  carrierMix: Array<{ carrier: string; pct: number }>,
  lastMileRates: LastMileRate[],
  zoneDistribution?: Record<string, Record<string, Record<number, number>>>
): DGatewayDetail {
  const weightOz = weightKg * KG_TO_OZ

  // Pass 1: compute each carrier's cost_usd at this weight (keeping the
  // original configured pct; effective_pct comes in pass 2).
  const firstPass: Array<{ carrier: string; pct: number; cost_usd: number }> = []
  for (const cm of carrierMix) {
    if (cm.pct === 0) continue

    const carrierRates = lastMileRates.filter((r) => r.carrier === cm.carrier)
    if (carrierRates.length === 0) {
      firstPass.push({ carrier: cm.carrier, pct: cm.pct, cost_usd: 0 })
      continue
    }

    // Group + sort by weight_oz_max ASC per zone so the lookup always picks
    // the smallest bracket covering the weight, regardless of DB row order
    // or whether weight_oz_min is populated (legacy rows have min=0).
    const ratesByZone = new Map<number, typeof carrierRates>()
    for (const r of carrierRates) {
      const list = ratesByZone.get(r.zone) ?? []
      list.push(r)
      ratesByZone.set(r.zone, list)
    }
    for (const list of ratesByZone.values()) {
      list.sort((a, b) => a.weight_oz_max - b.weight_oz_max)
    }

    const gatewayZoneDist = zoneDistribution?.[cm.carrier]?.[gateway]
    let zoneWeightedCost = 0
    let totalPct = 0

    for (let zone = 1; zone <= 8; zone++) {
      const zoneRates = ratesByZone.get(zone)
      const rate = zoneRates?.find((r) => weightOz <= r.weight_oz_max)
      if (!rate) continue
      const zonePct = gatewayZoneDist?.[zone] ?? 0.125
      zoneWeightedCost += rate.price_usd * zonePct
      totalPct += zonePct
    }

    const carrierCostUsd = totalPct > 0 ? (zoneWeightedCost / totalPct) : 0
    firstPass.push({ carrier: cm.carrier, pct: cm.pct, cost_usd: carrierCostUsd })
  }

  // Pass 2: reallocate pct among carriers that actually serve this weight.
  const activePctSum = firstPass.filter((c) => c.cost_usd > 0).reduce((s, c) => s + c.pct, 0)
  const carriers = firstPass.map((c) => ({
    ...c,
    effective_pct: c.cost_usd > 0 && activePctSum > 0 ? c.pct / activePctSum : 0,
  }))
  const avg_cost_usd = carriers.reduce((s, c) => s + c.cost_usd * c.effective_pct, 0)

  return { weight_oz: weightOz, carriers, avg_cost_usd }
}

// ─── Volume Tier Resolution ─────────────────────────────────────────────────

export interface GatewayVolume {
  gateway: string
  proportion: number
  weeklyTickets: number
  weeklyKg: number
  flightsPerWeek: number
  kgPerMawb: number
  ticketsPerMawb: number
}

/**
 * Calculate per-gateway volume breakdown from weekly tickets + gateway proportions.
 * scenarioFlightsPerWeek overrides the per-vendor flights if set.
 */
export function resolveGatewayVolumes(
  weeklyTickets: number,
  gatewayProportions: Record<string, number>,
  avgWeightKg: number,
  vendorBRates: VendorBRate[],
  exchangeRates: ExchangeRates,
  scenarioFlightsPerWeek?: number | null,
): GatewayVolume[] {
  const result: GatewayVolume[] = []

  for (const [gw, pct] of Object.entries(gatewayProportions)) {
    if (pct <= 0) continue

    const gwTickets = weeklyTickets * pct
    const gwKg = gwTickets * avgWeightKg

    // Scenario-level override takes precedence over per-vendor flights
    const gwRates = vendorBRates.filter((r) => r.gateway_code === gw)
    const flights = scenarioFlightsPerWeek ?? gwRates[0]?.flights_per_week ?? 7

    const kgPerMawb = flights > 0 ? gwKg / flights : gwKg
    const ticketsPerMawb = flights > 0 ? gwTickets / flights : gwTickets

    result.push({
      gateway: gw,
      proportion: pct,
      weeklyTickets: gwTickets,
      weeklyKg: gwKg,
      flightsPerWeek: flights,
      kgPerMawb,
      ticketsPerMawb,
    })
  }

  return result
}

// ─── Main Scenario Computation ──────────────────────────────────────────────

export interface ScenarioComputeInput {
  scenario: Scenario
  vendorBRates: VendorBRate[]
  vendorCRates: VendorCRate[]
  lastMileRates: LastMileRate[]
  carrierProportions: Array<{ carrier: string; pct: number }>
  zoneDistribution?: Record<string, Record<string, Record<number, number>>>
  tierDistribution?: Record<string, number>
  avgWeightKg: number
  vendorD?: Vendor | null
  vendorDRates?: VendorDRate[]
  vendorDTieredRates?: VendorDTieredRate[]
  vendorDLookupRates?: VendorDLookupRate[]
  vendorDLookupAreaCountries?: VendorDLookupAreaCountry[]
  vendorB?: Vendor | null
  weights?: WeightPoint[]
}

/**
 * Compute full scenario cost across all weight brackets.
 */
export function computeScenarioCost(input: ScenarioComputeInput): ScenarioResults {
  const { scenario, vendorBRates, vendorCRates, lastMileRates, carrierProportions, zoneDistribution, tierDistribution, avgWeightKg, vendorD, vendorDRates, vendorDTieredRates, vendorDLookupRates, vendorDLookupAreaCountries, vendorB, weights } = input
  const brackets = weights ?? WEIGHT_BRACKETS
  const dIsPerPiece = vendorD?.config?.per_piece === true
  const dIsSimple = vendorD?.config?.simple_rate === true
  const bIsSimple = vendorB?.config?.simple_rate === true
  const dPricingModel = scenario.d_pricing_model ?? (vendorDRates && vendorDRates.length > 0 ? 'first_additional' : 'zone_based')
  const rates = scenario.exchange_rates!
  const weeklyTickets = scenario.weekly_tickets ?? 1000
  const bUseMedian = scenario.use_median_pricing === true
  const bBufferPct = typeof vendorB?.config?.b_buffer_pct === 'number' ? vendorB.config.b_buffer_pct : 0.1

  // Resolve gateway proportions (no hardcoded defaults — must come from scenario or data loader)
  const gwProportions = scenario.b_gateway_mode === 'single' && scenario.b_single_gateway
    ? { [scenario.b_single_gateway]: 1.0 }
    : scenario.b_manual_proportions ?? {}

  // Calculate per-gateway volumes
  const gwVolumes = resolveGatewayVolumes(
    weeklyTickets, gwProportions, avgWeightKg, vendorBRates, rates, scenario.flights_per_week
  )

  // Build MAWB breakdown
  const mawb_breakdown: Record<string, MawbInfo> = {}
  for (const gv of gwVolumes) {
    const bCost = resolveBCost(vendorBRates, gv.gateway, gv.kgPerMawb, rates, gv.ticketsPerMawb, bUseMedian, bBufferPct)
    mawb_breakdown[gv.gateway] = {
      tickets_per_mawb: Math.round(gv.ticketsPerMawb),
      kg_per_mawb: Math.round(gv.kgPerMawb),
      tier: bCost?.tier_label ?? 'N/A',
    }
  }

  // Compute cost for each weight bracket
  const bubbleRate = scenario.b_bubble_rate ?? 1.1
  const cost_per_bracket: BracketCost[] = brackets.map((bracket) => {
    const w = bracket.representative

    // A段 — additive: per-kg portion (with bubble) + per-piece portion
    const pickupRate = scenario.seg_a.pickup_hkd_per_kg ?? 0
    const sortingRate = scenario.seg_a.sorting_hkd_per_kg ?? 0
    const includeSorting = scenario.seg_a.include_sorting ?? false
    const aBubble = scenario.seg_a.bubble_ratio ?? 1.0
    const perKgRate = pickupRate + (includeSorting ? sortingRate : 0)
    const segA_perKg = perKgRate * w * aBubble

    const perPieceFee = scenario.seg_a.per_piece_fee ?? 0
    const perPieceCur = scenario.seg_a.per_piece_currency ?? 'HKD'
    const aExr = exchangeRateToHkd(perPieceCur, rates)
    const segA_perPiece = perPieceFee > 0 ? perPieceFee * aExr : 0

    const segA = segA_perKg + segA_perPiece

    // B段: simple per-KG or gateway-weighted
    let segB = 0
    const bGatewayDetails: BracketDetail['seg_b']['gateways'] = []

    if (bIsSimple && vendorB) {
      // B段 simple rate: flat per-KG, read from vendor_b_rates table per gateway
      // Also include MAWB-level fixed fees if present (e.g. document_fee)
      for (const gv of gwVolumes) {
        const gwRate = vendorBRates.find((r) => r.gateway_code === gv.gateway)
        if (!gwRate) continue
        const bRateHkd = toHkd(gwRate.rate_per_kg, gwRate.currency ?? 'HKD', rates)
        const freightCost = bRateHkd * w
        // Sum MAWB-level fixed fees
        const totalFixedFees =
          (gwRate.pickup_fee ?? 0) + (gwRate.handling_fee ?? 0) +
          (gwRate.operation_fee ?? 0) + (gwRate.document_fee ?? 0) +
          (gwRate.battery_check_fee ?? 0) + (gwRate.customs_fee ?? 0) +
          (gwRate.airport_transfer_fee ?? 0) + (gwRate.magnetic_check_fee ?? 0)
        const fixedHkd = toHkd(totalFixedFees, gwRate.currency ?? 'HKD', rates)
        const mawbAmortized = totalFixedFees > 0 && gv.ticketsPerMawb > 0 ? fixedHkd / gv.ticketsPerMawb : 0
        const subtotal = freightCost + mawbAmortized
        segB += subtotal * gv.proportion
        bGatewayDetails.push({
          gateway: gv.gateway, proportion: gv.proportion, rate_per_kg: bRateHkd,
          tier_label: '簡易', bubble_rate: 1, freight_cost: freightCost,
          mawb_fixed_total: fixedHkd, tickets_per_mawb: gv.ticketsPerMawb, mawb_amortized: mawbAmortized, subtotal,
        })
      }
    } else {
      for (const gv of gwVolumes) {
        const bCost = resolveBCost(vendorBRates, gv.gateway, gv.kgPerMawb, rates, gv.ticketsPerMawb, bUseMedian, bBufferPct)
        if (!bCost) continue
        const freightCost = bCost.rate_per_kg_hkd * w * bubbleRate
        const mawbAmortized = gv.ticketsPerMawb > 0 ? bCost.mawb_fixed_hkd / gv.ticketsPerMawb : 0
        const bPerTicket = freightCost + mawbAmortized
        segB += bPerTicket * gv.proportion

        bGatewayDetails.push({
          gateway: gv.gateway,
          proportion: gv.proportion,
          rate_per_kg: bCost.rate_per_kg_hkd,
          tier_label: bCost.tier_label,
          bubble_rate: bubbleRate,
          freight_cost: freightCost,
          mawb_fixed_total: bCost.mawb_fixed_hkd,
          tickets_per_mawb: gv.ticketsPerMawb,
          mawb_amortized: mawbAmortized,
          subtotal: bPerTicket,
          service_count: bCost.service_count,
          is_median: bCost.is_median,
        })
      }
    }

    // C段: always calculate independently (even if B is simple)
    let segC = 0
    const cGatewayDetails: BracketDetail['seg_c']['gateways'] = []
    for (const gv of gwVolumes) {
      const cCost = resolveCCost(vendorCRates, w, gv.gateway, gv.ticketsPerMawb, rates)
      segC += cCost.per_ticket_hkd * gv.proportion

      cGatewayDetails.push({
        gateway: gv.gateway,
        proportion: gv.proportion,
        mawb_amortized: cCost.mawb_amortized_hkd,
        per_kg_cost: cCost.per_kg_hkd,
        per_hawb_cost: cCost.per_hawb_hkd,
        subtotal: cCost.per_ticket_hkd,
      })
    }

    // D段: simple | first_additional | zone_based
    let segD = 0
    const dGatewayDetails: BracketDetail['seg_d']['gateways'] = []
    let dPricingDetail: BracketDetail['seg_d']['pricing_detail']

    if (dIsPerPiece && vendorD) {
      const fee = (vendorD.config!.per_piece_fee as number) ?? 0
      const cur = (vendorD.config!.per_piece_currency as string) ?? 'USD'
      const exrToHkd = exchangeRateToHkd(cur, rates)
      segD = fee * exrToHkd
      dPricingDetail = {
        model: 'per_piece', weight_kg: w, cost_hkd: segD,
        per_piece_fee: fee, currency: cur, exchange_rate_to_hkd: exrToHkd,
      }
    } else if (dIsSimple) {
      const dRatePerKg = vendorD!.config!.rate_per_kg ?? 0
      const dCurrency = vendorD!.config!.rate_currency ?? 'USD'
      const exrToHkd = exchangeRateToHkd(dCurrency, rates)
      const dRateHkd = dRatePerKg * exrToHkd
      segD = dRateHkd * w
      dPricingDetail = {
        model: 'simple', weight_kg: w, cost_hkd: segD,
        rate_per_kg: dRatePerKg, currency: dCurrency, exchange_rate_to_hkd: exrToHkd,
      }
    } else if ((dPricingModel === 'first_additional' || dPricingModel === 'weight_bracket') && vendorDRates && vendorDRates.length > 0) {
      // Auto-select between first_additional and weight_bracket based on row count per zone
      const zoneRowCounts = new Map<string, number>()
      for (const r of vendorDRates) { const z = r.zone ?? 'default'; zoneRowCounts.set(z, (zoneRowCounts.get(z) ?? 0) + 1) }
      const isWeightBracket = [...zoneRowCounts.values()].some((c) => c > 1)
      if (isWeightBracket) {
        const dResult = computeWeightBracketCost(w, vendorDRates, rates, tierDistribution)
        segD = dResult.costHkd
        dPricingDetail = {
          model: 'weight_bracket', weight_kg: w, cost_hkd: segD,
          zones: dResult.detail.map((d) => ({
            zone: d.zone, weight: d.weight, matched_bracket_max: d.matched_bracket_max,
            bracket_price: d.bracket_price, additional_units: d.additional_units,
            additional_weight_kg: undefined, additional_weight_price: d.additional_price_per_unit,
            currency: d.currency, cost_in_currency: d.cost_in_currency,
            exchange_rate_to_hkd: d.exchange_rate_to_hkd,
          })),
        }
      } else {
        const dResult = computeFirstAdditionalCost(w, vendorDRates, rates, tierDistribution)
        segD = dResult.costHkd
        dPricingDetail = {
          model: 'first_additional', weight_kg: w, cost_hkd: segD,
          zones: dResult.detail.map((d) => ({
            zone: d.zone, weight: d.weight, first_weight_kg: d.first_weight_kg,
            first_weight_price: d.first_weight_price,
            additional_weight_kg: d.additional_weight_kg,
            additional_weight_price: d.additional_weight_price,
            additional_units: d.additional_weight_kg > 0
              ? Math.ceil(Math.max(0, w - d.first_weight_kg) / d.additional_weight_kg) : 0,
            currency: d.currency, cost_in_currency: d.cost_in_currency,
            exchange_rate_to_hkd: d.exchange_rate_to_hkd,
          })),
        }
      }
    } else if (dPricingModel === 'tiered_per_kg' && vendorDTieredRates && vendorDTieredRates.length > 0) {
      const dResult = computeTieredPerKgCost(w, scenario.country_code, vendorDTieredRates, rates)
      segD = dResult.costHkd
      if (dResult.detail) {
        dPricingDetail = {
          model: 'tiered_per_kg', weight_kg: w, cost_hkd: segD,
          tiered: dResult.detail,
        }
      }
    } else if (dPricingModel === 'lookup_table' && vendorDLookupRates && vendorDLookupRates.length > 0 && vendorDLookupAreaCountries) {
      const dResult = computeLookupTableCost(w, scenario.country_code, vendorDLookupRates, vendorDLookupAreaCountries, rates)
      segD = dResult.costHkd
      if (dResult.detail) {
        dPricingDetail = {
          model: 'lookup_table', weight_kg: w, cost_hkd: segD,
          lookup: dResult.detail,
        }
      }
    } else {
      for (const gv of gwVolumes) {
        const dDetail = computeLastMileCostForGatewayDetailed(
          w, gv.gateway, carrierProportions, lastMileRates, zoneDistribution
        )
        const subtotalHkd = dDetail.avg_cost_usd * rates.usd_hkd
        segD += subtotalHkd * gv.proportion

        dGatewayDetails.push({
          gateway: gv.gateway,
          proportion: gv.proportion,
          weight_oz: dDetail.weight_oz,
          carriers: dDetail.carriers,
          avg_cost_usd: dDetail.avg_cost_usd,
          usd_hkd: rates.usd_hkd,
          subtotal: subtotalHkd,
        })
      }
    }

    // Additional surcharges (per-ticket, converted to HKD)
    if (vendorBRates.length > 0) {
      const bSurchargeVal = vendorBRates[0].additional_surcharge ?? 0
      if (bSurchargeVal > 0) segB += toHkd(bSurchargeVal, vendorBRates[0].currency ?? 'HKD', rates)
    }
    if (vendorCRates.length > 0) {
      const cSurchargeVal = vendorCRates[0].additional_surcharge ?? 0
      if (cSurchargeVal > 0) segC += toHkd(cSurchargeVal, vendorCRates[0].currency ?? 'USD', rates)
    }
    if (vendorDRates && vendorDRates.length > 0) {
      const dSurchargeVal = vendorDRates[0].additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD += toHkd(dSurchargeVal, vendorDRates[0].currency, rates)
    } else if (vendorDTieredRates && vendorDTieredRates.length > 0) {
      const dSurchargeVal = vendorDTieredRates[0].additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD += toHkd(dSurchargeVal, vendorDTieredRates[0].currency, rates)
    } else if (vendorDLookupRates && vendorDLookupRates.length > 0) {
      const dSurchargeVal = vendorDLookupRates[0].additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD += toHkd(dSurchargeVal, vendorDLookupRates[0].currency, rates)
    }

    const segADetail: BracketDetail['seg_a'] = {
      pickup_rate: pickupRate,
      sorting_rate: sortingRate,
      include_sorting: includeSorting,
      weight_kg: w,
      bubble_ratio: aBubble,
      per_kg_cost_hkd: segA_perKg,
      per_piece_fee: perPieceFee > 0 ? perPieceFee : undefined,
      per_piece_currency: perPieceFee > 0 ? perPieceCur : undefined,
      exchange_rate: perPieceFee > 0 ? aExr : undefined,
      per_piece_cost_hkd: segA_perPiece,
      cost_hkd: segA,
    }

    const detail: BracketDetail = {
      seg_a: segADetail,
      seg_b: { gateways: bGatewayDetails },
      seg_c: { gateways: cGatewayDetails },
      seg_d: { gateways: dGatewayDetails, pricing_detail: dPricingDetail },
    }

    return {
      weight_range: bracket.range,
      weight_min_kg: bracket.min,
      weight_max_kg: bracket.max,
      representative_weight_kg: bracket.representative,
      cost_hkd: segA + segB + segC + segD,
      seg_a: segA,
      seg_b: segB,
      seg_c: segC,
      seg_d: segD,
      detail,
    }
  })

  // Average cost per ticket (weighted by bracket? for now simple average)
  const avg_cost_per_ticket = cost_per_bracket.reduce((sum, b) => sum + b.cost_hkd, 0) / cost_per_bracket.length

  // Volume analysis: compute costs at different ticket volumes
  const volume_analysis = computeVolumeAnalysis(
    scenario, vendorBRates, vendorCRates, gwProportions, avgWeightKg, rates, bUseMedian, bBufferPct
  )

  return {
    gateway_allocation: gwProportions,
    cost_per_bracket,
    avg_cost_per_ticket,
    volume_analysis: {
      ...volume_analysis,
      mawb_breakdown,
    },
    computed_at: new Date().toISOString(),
    assumptions: {
      avg_weight_kg: avgWeightKg,
      bubble_rate: bubbleRate,
      weekly_tickets: weeklyTickets,
      exchange_rates: {
        usd_hkd: rates.usd_hkd,
        hkd_rmb: rates.hkd_rmb,
        usd_rmb: rates.usd_rmb,
      },
      gateway_mode: scenario.b_gateway_mode,
    },
  }
}

// ─── Volume Analysis ────────────────────────────────────────────────────────

function computeVolumeAnalysis(
  scenario: Scenario,
  vendorBRates: VendorBRate[],
  vendorCRates: VendorCRate[],
  gwProportions: Record<string, number>,
  avgWeightKg: number,
  rates: ExchangeRates,
  useMedian: boolean = false,
  bufferPct: number = 0,
): Omit<VolumeAnalysis, 'mawb_breakdown'> {
  const ticketPoints = [100, 200, 500, 1000, 2000, 3000, 5000, 7000, 10000, 15000, 20000]
  const tierBreakpoints: TierBreakpoint[] = []
  let lastTierKey = ''

  for (const tickets of ticketPoints) {
    // Calculate B段 cost at this volume (representative weight = avgWeightKg)
    let totalBPerTicket = 0
    let tierKey = ''

    for (const [gw, pct] of Object.entries(gwProportions)) {
      if (pct <= 0) continue
      const gwKg = tickets * pct * avgWeightKg
      const gwRates = vendorBRates.filter((r) => r.gateway_code === gw)
      const flights = scenario.flights_per_week ?? gwRates[0]?.flights_per_week ?? 7
      const kgPerMawb = flights > 0 ? gwKg / flights : gwKg
      const ticketsPerMawb = flights > 0 ? (tickets * pct) / flights : tickets * pct

      const bCost = resolveBCost(vendorBRates, gw, kgPerMawb, rates, ticketsPerMawb, useMedian, bufferPct)
      if (bCost) {
        const bPerTicket = bCost.rate_per_kg_hkd * avgWeightKg * (scenario.b_bubble_rate ?? 1.1) +
          (ticketsPerMawb > 0 ? bCost.mawb_fixed_hkd / ticketsPerMawb : 0)
        totalBPerTicket += bPerTicket * pct
        tierKey += `${gw}:${bCost.tier_label},`
      }

      // C段 amortization
      const cCost = resolveCCost(vendorCRates, avgWeightKg, gw, ticketsPerMawb, rates)
      totalBPerTicket += cCost.mawb_amortized_hkd * pct // only the MAWB-amortized portion changes with volume
    }

    // Record tier breakpoints when tier changes
    if (tierKey !== lastTierKey) {
      tierBreakpoints.push({
        tier_label: tierKey.replace(/,$/, ''),
        min_weekly_tickets: tickets,
        cost_at_tier: totalBPerTicket,
      })
      lastTierKey = tierKey
    }
  }

  // Current tier
  const currentTickets = scenario.weekly_tickets ?? 1000
  let currentTier = tierBreakpoints[0]?.tier_label ?? 'N/A'
  for (const bp of tierBreakpoints) {
    if (currentTickets >= bp.min_weekly_tickets) currentTier = bp.tier_label
  }

  return {
    tier_breakpoints: tierBreakpoints,
    current_tier: currentTier,
  }
}

// ─── D段 First-Weight / Additional-Weight Cost ────────────────────────────

/**
 * Compute D段 cost using 首重/續重 model.
 * Cost = first_weight_price + ceil((weightKg - first_weight_kg) / additional_weight_kg) × additional_weight_price
 * If zoneWeights provided, weight each zone's cost by its proportion; otherwise equal average.
 */
export function computeFirstAdditionalCost(
  weightKg: number,
  dRates: VendorDRate[],
  exchangeRates: ExchangeRates,
  zoneWeights?: Record<string, number>,
): { costHkd: number; detail: { zone?: string; weight?: number; first_weight_kg: number; first_weight_price: number; additional_weight_kg: number; additional_weight_price: number; currency: string; weight_kg: number; cost_in_currency: number; exchange_rate_to_hkd: number }[] } {
  if (dRates.length === 0) return { costHkd: 0, detail: [] }

  const zones = [...new Set(dRates.map((r) => r.zone ?? 'default'))]
  const details: { zone?: string; weight?: number; first_weight_kg: number; first_weight_price: number; additional_weight_kg: number; additional_weight_price: number; currency: string; weight_kg: number; cost_in_currency: number; exchange_rate_to_hkd: number }[] = []
  let weightedHkd = 0
  const hasWeights = zoneWeights && Object.keys(zoneWeights).length > 0
  const equalWeight = zones.length > 0 ? 1 / zones.length : 0

  for (const zone of zones) {
    const zoneRate = dRates.find((r) => (r.zone ?? 'default') === zone)
    if (!zoneRate) continue

    const extraWeight = Math.max(0, weightKg - zoneRate.first_weight_kg)
    const additionalUnits = zoneRate.additional_weight_kg > 0
      ? Math.ceil(extraWeight / zoneRate.additional_weight_kg)
      : 0
    const costInCurrency = zoneRate.first_weight_price + additionalUnits * zoneRate.additional_weight_price

    const exrToHkd = exchangeRateToHkd(zoneRate.currency ?? 'USD', exchangeRates)

    const costHkd = costInCurrency * exrToHkd
    const zoneKey = zoneRate.zone ?? zone
    const w = hasWeights ? (zoneWeights![zoneKey] ?? equalWeight) : equalWeight

    details.push({
      zone: zoneRate.zone ?? undefined,
      weight: w,
      first_weight_kg: zoneRate.first_weight_kg,
      first_weight_price: zoneRate.first_weight_price,
      additional_weight_kg: zoneRate.additional_weight_kg,
      additional_weight_price: zoneRate.additional_weight_price,
      currency: zoneRate.currency,
      weight_kg: weightKg,
      cost_in_currency: costInCurrency,
      exchange_rate_to_hkd: exrToHkd,
    })

    weightedHkd += costHkd * w
  }

  return { costHkd: weightedHkd, detail: details }
}

// ─── D段 Weight-Bracket Cost ────────────────────────────────────────────────

/**
 * Compute D段 cost using weight-bracket model.
 * Each zone has multiple weight brackets (per-parcel price) + an additional per-kg rate.
 * Rows are stored in vendor_d_rates with multiple rows per zone.
 * `first_weight_kg` = bracket upper bound, `first_weight_price` = bracket price.
 * The row with the highest first_weight_kg per zone carries additional_weight_kg/price.
 * If zoneWeights provided, weight each zone's cost by its proportion; otherwise equal average.
 */
export function computeWeightBracketCost(
  weightKg: number,
  dRates: VendorDRate[],
  exchangeRates: ExchangeRates,
  zoneWeights?: Record<string, number>,
): { costHkd: number; detail: { zone?: string; weight?: number; matched_bracket_max: number; bracket_price: number; additional_units: number; additional_price_per_unit: number; currency: string; weight_kg: number; cost_in_currency: number; exchange_rate_to_hkd: number }[] } {
  if (dRates.length === 0) return { costHkd: 0, detail: [] }

  // Group by zone
  const zoneMap: Record<string, VendorDRate[]> = {}
  for (const rate of dRates) {
    const zone = rate.zone ?? 'default'
    if (!zoneMap[zone]) zoneMap[zone] = []
    zoneMap[zone].push(rate)
  }

  const zones = Object.keys(zoneMap)
  const details: { zone?: string; weight?: number; matched_bracket_max: number; bracket_price: number; additional_units: number; additional_price_per_unit: number; currency: string; weight_kg: number; cost_in_currency: number; exchange_rate_to_hkd: number }[] = []
  let weightedHkd = 0
  const hasWeights = zoneWeights && Object.keys(zoneWeights).length > 0
  const equalWeight = zones.length > 0 ? 1 / zones.length : 0

  for (const zone of zones) {
    const brackets = zoneMap[zone].sort((a, b) => a.first_weight_kg - b.first_weight_kg)
    const lastBracket = brackets[brackets.length - 1]

    let cost: number
    let matchedMax: number
    let bracketPrice: number
    let additionalUnits = 0
    let additionalPricePerUnit = 0

    if (weightKg <= lastBracket.first_weight_kg) {
      // Within bracket range — find matching bracket
      const match = brackets.find((b) => weightKg <= b.first_weight_kg) ?? lastBracket
      cost = match.first_weight_price
      matchedMax = match.first_weight_kg
      bracketPrice = match.first_weight_price
    } else {
      // Beyond bracket range — last bracket price + additional surcharge
      bracketPrice = lastBracket.first_weight_price
      matchedMax = lastBracket.first_weight_kg
      const extraWeight = weightKg - lastBracket.first_weight_kg
      const addKg = lastBracket.additional_weight_kg > 0 ? lastBracket.additional_weight_kg : 1
      additionalUnits = Math.ceil(extraWeight / addKg)
      additionalPricePerUnit = lastBracket.additional_weight_price ?? 0
      cost = bracketPrice + additionalUnits * additionalPricePerUnit
    }

    const cur = brackets[0]?.currency ?? 'USD'
    const exrToHkd = exchangeRateToHkd(cur, exchangeRates)

    const costHkd = cost * exrToHkd
    const w = hasWeights ? (zoneWeights![zone] ?? equalWeight) : equalWeight
    weightedHkd += costHkd * w

    details.push({
      zone: zone !== 'default' ? zone : undefined,
      weight: w,
      matched_bracket_max: matchedMax,
      bracket_price: bracketPrice,
      additional_units: additionalUnits,
      additional_price_per_unit: additionalPricePerUnit,
      currency: cur,
      weight_kg: weightKg,
      cost_in_currency: cost,
      exchange_rate_to_hkd: exrToHkd,
    })
  }

  return { costHkd: weightedHkd, detail: details }
}

// ─── B段 Surcharges Calculation ──────────────────────────────────────────────

/**
 * Compute B段 surcharges from the structured JSONB array.
 * Each surcharge has a unit type that determines how it's calculated.
 */
export function computeBSurcharges(
  surcharges: BSurcharge[],
  weightKg: number,
  mawbWeightKg: number,
  exchangeRates: ExchangeRates,
  rateCurrency: string,
): number {
  let total = 0
  for (const s of surcharges) {
    // Convert surcharge amount to HKD
    const surchargeToHkd = (amount: number, cur: string) => {
      if (cur === 'USD') return amount * exchangeRates.usd_hkd
      if (cur === 'RMB') return amount / exchangeRates.hkd_rmb
      if (cur === 'JPY') return amount * (exchangeRates.jpy_hkd ?? 0.052)
      return amount // HKD
    }

    switch (s.unit) {
      case 'per_mawb':
        // Amortize across MAWB weight, then scale to this parcel
        if (s.amount != null && mawbWeightKg > 0) {
          total += surchargeToHkd(s.amount, s.currency) / mawbWeightKg * weightKg
        }
        break
      case 'per_kg':
        if (s.rate != null) {
          total += surchargeToHkd(s.rate * weightKg, s.currency)
        }
        break
      case 'per_kg_with_min':
        if (s.rate != null && s.min != null && mawbWeightKg > 0) {
          const rawCost = Math.max(s.rate * mawbWeightKg, s.min)
          total += surchargeToHkd(rawCost, s.currency) / mawbWeightKg * weightKg
        }
        break
      case 'per_hawb':
        if (s.amount != null) {
          total += surchargeToHkd(s.amount, s.currency)
        }
        break
      case 'conditional':
        // Not automatically included — annotated in reports only
        break
    }
  }
  return total
}

// ─── D-5: Tiered Per-KG Cost (e.g. Yuntu) ──────────────────────────────────

/**
 * Compute D段 cost using tiered per-kg model.
 * Finds the matching weight tier for a country, then:
 * cost = rate_per_kg × max(weight, min_chargeable_weight) + registration_fee
 */
export function computeTieredPerKgCost(
  weightKg: number,
  countryCode: string,
  tieredRates: VendorDTieredRate[],
  exchangeRates: ExchangeRates,
): { costHkd: number; detail: { country_code: string; weight_tier: string; rate_per_kg: number; registration_fee: number; chargeable_weight: number; currency: string; cost_in_currency: number; exchange_rate_to_hkd: number } | null } {
  const countryRates = tieredRates.filter((r) => r.country_code === countryCode)
  if (countryRates.length === 0) return { costHkd: 0, detail: null }

  // Find the matching weight tier (weight_min_kg < weightKg <= weight_max_kg)
  const tier = countryRates.find((r) => weightKg > r.weight_min_kg && weightKg <= r.weight_max_kg)
    ?? countryRates[countryRates.length - 1] // fallback to last tier

  if (!tier) return { costHkd: 0, detail: null }

  const chargeableWeight = tier.min_chargeable_weight_kg
    ? Math.max(weightKg, tier.min_chargeable_weight_kg)
    : weightKg

  const costInCurrency = tier.rate_per_kg * chargeableWeight + tier.registration_fee

  const exrToHkd = exchangeRateToHkd(tier.currency ?? 'USD', exchangeRates)

  const costHkd = costInCurrency * exrToHkd

  return {
    costHkd,
    detail: {
      country_code: countryCode,
      weight_tier: `${tier.weight_min_kg}-${tier.weight_max_kg}kg`,
      rate_per_kg: tier.rate_per_kg,
      registration_fee: tier.registration_fee,
      chargeable_weight: chargeableWeight,
      currency: tier.currency,
      cost_in_currency: costInCurrency,
      exchange_rate_to_hkd: exrToHkd,
    },
  }
}

// ─── D-6: Lookup Table Cost (e.g. ECMS / 中華郵政) ─────────────────────────

/**
 * Compute D段 cost using lookup table model.
 * Maps country → area, then finds the ceiling weight point for absolute amount.
 */
export function computeLookupTableCost(
  weightKg: number,
  countryCode: string,
  lookupRates: VendorDLookupRate[],
  areaCountries: VendorDLookupAreaCountry[],
  exchangeRates: ExchangeRates,
): { costHkd: number; detail: { country_code: string; area_code: string; area_name?: string; weight_point: number; amount: number; currency: string; exchange_rate_to_hkd: number } | null } {
  // Map country to area
  const areaMapping = areaCountries.find((m) => m.country_code === countryCode)
  if (!areaMapping) return { costHkd: 0, detail: null }

  // Filter rates for this area, sorted by weight ascending
  const areaRates = lookupRates
    .filter((r) => r.area_code === areaMapping.area_code)
    .sort((a, b) => a.weight_kg - b.weight_kg)

  if (areaRates.length === 0) return { costHkd: 0, detail: null }

  // Ceiling lookup: find the first weight point >= weightKg
  const match = areaRates.find((r) => r.weight_kg >= weightKg)
    ?? areaRates[areaRates.length - 1] // fallback to max weight

  const exrToHkd = exchangeRateToHkd(match.currency ?? 'USD', exchangeRates)

  const costHkd = match.amount * exrToHkd

  return {
    costHkd,
    detail: {
      country_code: countryCode,
      area_code: areaMapping.area_code,
      area_name: match.area_name ?? undefined,
      weight_point: match.weight_kg,
      amount: match.amount,
      currency: match.currency,
      exchange_rate_to_hkd: exrToHkd,
    },
  }
}

// ─── BCD Combined Cost ──────────────────────────────────────────────────────

/**
 * Compute BCD combined cost (e.g. ECMS Japan).
 * Same lookup-table structure as D-6 but covers all B+C+D segments.
 */
export function computeBCDCombinedCost(
  weightKg: number,
  countryCode: string,
  bcdRates: VendorBCDRate[],
  areaCountries: VendorDLookupAreaCountry[],
  exchangeRates: ExchangeRates,
): { costHkd: number; detail: { area_code: string; area_name?: string; weight_point: number; amount: number; fuel_surcharge_pct?: number; currency: string; exchange_rate_to_hkd: number } | null } {
  // Map country to area (shared mapping table)
  const areaMapping = areaCountries.find((m) => m.country_code === countryCode)
  if (!areaMapping) return { costHkd: 0, detail: null }

  // Filter and sort by weight
  const areaRates = bcdRates
    .filter((r) => r.area_code === areaMapping.area_code)
    .sort((a, b) => a.weight_kg - b.weight_kg)

  if (areaRates.length === 0) return { costHkd: 0, detail: null }

  // Ceiling lookup
  const match = areaRates.find((r) => r.weight_kg >= weightKg)
    ?? areaRates[areaRates.length - 1]

  let amount = match.amount
  if (match.fuel_surcharge_pct) {
    amount *= (1 + match.fuel_surcharge_pct / 100)
  }

  const exrToHkd = exchangeRateToHkd(match.currency ?? 'USD', exchangeRates)

  return {
    costHkd: amount * exrToHkd,
    detail: {
      area_code: areaMapping.area_code,
      area_name: match.area_name ?? undefined,
      weight_point: match.weight_kg,
      amount: match.amount,
      fuel_surcharge_pct: match.fuel_surcharge_pct ?? undefined,
      currency: match.currency,
      exchange_rate_to_hkd: exrToHkd,
    },
  }
}

// ─── BC-Combined Computation (A + BC + D independent) ─────────────────────

export interface BCCombinedComputeInput {
  scenario: Scenario
  vendorBCRate: VendorBCRate
  lastMileRates?: LastMileRate[]
  carrierProportions?: Array<{ carrier: string; pct: number }>
  zoneDistribution?: Record<string, Record<string, Record<number, number>>>
  tierDistribution?: Record<string, number>
  vendorDRates?: VendorDRate[]
  vendorDTieredRates?: VendorDTieredRate[]
  vendorDLookupRates?: VendorDLookupRate[]
  vendorDLookupAreaCountries?: VendorDLookupAreaCountry[]
  vendorD?: Vendor | null
  avgWeightKg: number
  weights?: WeightPoint[]
}

/**
 * Compute scenario cost for BC-combined pricing mode (A + BC + D independent).
 */
export function computeScenarioCostBCCombined(input: BCCombinedComputeInput): ScenarioResults {
  const { scenario, vendorBCRate, lastMileRates, carrierProportions, zoneDistribution, tierDistribution, vendorDRates, vendorDTieredRates, vendorDLookupRates, vendorDLookupAreaCountries, vendorD, avgWeightKg, weights } = input
  const brackets = weights ?? WEIGHT_BRACKETS
  const rates = scenario.exchange_rates!
  const dPricingModel = scenario.d_pricing_model ?? 'zone_based'

  // Convert BC rate to HKD
  const bcExr = exchangeRateToHkd(vendorBCRate.currency ?? 'USD', rates)
  const bcRateHkdPerKg = vendorBCRate.rate_per_kg * bcExr
  const bcHandlingHkd = vendorBCRate.handling_fee_per_unit * bcExr
  const bcExchangeRateToHkd = bcExr

  // D段 per_piece / simple rate config
  const dIsPerPiece = dPricingModel === 'per_piece' && vendorD?.config?.per_piece === true
  const dIsSimple = dPricingModel === 'simple' && vendorD?.config?.simple_rate === true

  // Gateway proportions for zone-based D段 (no hardcoded defaults — resolved by data loader)
  const gwProportions = scenario.b_gateway_mode === 'single' && scenario.b_single_gateway
    ? { [scenario.b_single_gateway]: 1.0 }
    : scenario.b_manual_proportions ?? {}

  const cost_per_bracket: BracketCost[] = brackets.map((bracket) => {
    const w = bracket.representative

    // A段 — additive: per-kg portion (with bubble) + per-piece portion
    const pickupRate = scenario.seg_a.pickup_hkd_per_kg ?? 0
    const sortingRate = scenario.seg_a.sorting_hkd_per_kg ?? 0
    const includeSorting = scenario.seg_a.include_sorting ?? false
    const aBubble = scenario.seg_a.bubble_ratio ?? 1.0
    const perKgRate = pickupRate + (includeSorting ? sortingRate : 0)
    const segA_perKg = perKgRate * w * aBubble

    const perPieceFee = scenario.seg_a.per_piece_fee ?? 0
    const perPieceCur = scenario.seg_a.per_piece_currency ?? 'HKD'
    const aExr = exchangeRateToHkd(perPieceCur, rates)
    const segA_perPiece = perPieceFee > 0 ? perPieceFee * aExr : 0

    const segA = segA_perKg + segA_perPiece

    // BC combined (rate_per_kg × weight × bubble_ratio + handling_fee)
    const bcBubbleRatio = scenario.bc_bubble_ratio ?? 1.0
    const segBC = bcRateHkdPerKg * w * bcBubbleRatio + bcHandlingHkd

    // D段 independent — branch on pricing model
    let segD = 0
    const dGatewayDetails: BracketDetail['seg_d']['gateways'] = []
    let dPricingDetail: BracketDetail['seg_d']['pricing_detail']

    if (dIsPerPiece && vendorD) {
      const fee = (vendorD.config!.per_piece_fee as number) ?? 0
      const cur = (vendorD.config!.per_piece_currency as string) ?? 'USD'
      const exrToHkd = exchangeRateToHkd(cur, rates)
      segD = fee * exrToHkd
      dPricingDetail = {
        model: 'per_piece', weight_kg: w, cost_hkd: segD,
        per_piece_fee: fee, currency: cur, exchange_rate_to_hkd: exrToHkd,
      }
    } else if ((dPricingModel === 'first_additional' || dPricingModel === 'weight_bracket') && vendorDRates && vendorDRates.length > 0) {
      // Auto-select between first_additional and weight_bracket
      const zoneRowCounts = new Map<string, number>()
      for (const r of vendorDRates) { const z = r.zone ?? 'default'; zoneRowCounts.set(z, (zoneRowCounts.get(z) ?? 0) + 1) }
      const isWeightBracket = [...zoneRowCounts.values()].some((c) => c > 1)
      if (isWeightBracket) {
        const dResult = computeWeightBracketCost(w, vendorDRates, rates, tierDistribution)
        segD = dResult.costHkd
        dPricingDetail = {
          model: 'weight_bracket', weight_kg: w, cost_hkd: segD,
          zones: dResult.detail.map((d) => ({
            zone: d.zone, weight: d.weight, matched_bracket_max: d.matched_bracket_max,
            bracket_price: d.bracket_price, additional_units: d.additional_units,
            additional_weight_kg: undefined, additional_weight_price: d.additional_price_per_unit,
            currency: d.currency, cost_in_currency: d.cost_in_currency,
            exchange_rate_to_hkd: d.exchange_rate_to_hkd,
          })),
        }
      } else {
        const dResult = computeFirstAdditionalCost(w, vendorDRates, rates, tierDistribution)
        segD = dResult.costHkd
        dPricingDetail = {
          model: 'first_additional', weight_kg: w, cost_hkd: segD,
          zones: dResult.detail.map((d) => ({
            zone: d.zone, weight: d.weight, first_weight_kg: d.first_weight_kg,
            first_weight_price: d.first_weight_price,
            additional_weight_kg: d.additional_weight_kg,
            additional_weight_price: d.additional_weight_price,
            additional_units: d.additional_weight_kg > 0
              ? Math.ceil(Math.max(0, w - d.first_weight_kg) / d.additional_weight_kg) : 0,
            currency: d.currency, cost_in_currency: d.cost_in_currency,
            exchange_rate_to_hkd: d.exchange_rate_to_hkd,
          })),
        }
      }
    } else if (dPricingModel === 'tiered_per_kg' && vendorDTieredRates && vendorDTieredRates.length > 0) {
      const dResult = computeTieredPerKgCost(w, scenario.country_code, vendorDTieredRates, rates)
      segD = dResult.costHkd
      if (dResult.detail) {
        dPricingDetail = {
          model: 'tiered_per_kg', weight_kg: w, cost_hkd: segD,
          tiered: dResult.detail,
        }
      }
    } else if (dPricingModel === 'lookup_table' && vendorDLookupRates && vendorDLookupRates.length > 0 && vendorDLookupAreaCountries) {
      const dResult = computeLookupTableCost(w, scenario.country_code, vendorDLookupRates, vendorDLookupAreaCountries, rates)
      segD = dResult.costHkd
      if (dResult.detail) {
        dPricingDetail = {
          model: 'lookup_table', weight_kg: w, cost_hkd: segD,
          lookup: dResult.detail,
        }
      }
    } else if (dIsSimple && vendorD) {
      const dRatePerKg = vendorD.config!.rate_per_kg ?? 0
      const dCurrency = vendorD.config!.rate_currency ?? 'USD'
      const exrToHkd = exchangeRateToHkd(dCurrency, rates)
      const dRateHkd = dRatePerKg * exrToHkd
      segD = dRateHkd * w
      dPricingDetail = {
        model: 'simple', weight_kg: w, cost_hkd: segD,
        rate_per_kg: dRatePerKg, currency: dCurrency, exchange_rate_to_hkd: exrToHkd,
      }
    } else if (dPricingModel === 'zone_based' && lastMileRates && carrierProportions) {
      // Zone-based: gateway-weighted last mile
      for (const [gw, pct] of Object.entries(gwProportions)) {
        if (pct <= 0) continue
        const dDetail = computeLastMileCostForGatewayDetailed(
          w, gw, carrierProportions, lastMileRates, zoneDistribution
        )
        const subtotalHkd = dDetail.avg_cost_usd * rates.usd_hkd
        segD += subtotalHkd * pct
        dGatewayDetails.push({
          gateway: gw,
          proportion: pct,
          weight_oz: dDetail.weight_oz,
          carriers: dDetail.carriers,
          avg_cost_usd: dDetail.avg_cost_usd,
          usd_hkd: rates.usd_hkd,
          subtotal: subtotalHkd,
        })
      }
    }

    // Additional surcharges (per-ticket, converted to HKD)
    const bcSurchargeVal = vendorBCRate.additional_surcharge ?? 0
    let segBC_final = segBC
    if (bcSurchargeVal > 0) segBC_final += bcSurchargeVal * bcExr
    if (vendorDRates && vendorDRates.length > 0) {
      const dSurchargeVal = vendorDRates[0].additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD += toHkd(dSurchargeVal, vendorDRates[0].currency, rates)
    } else if (vendorDTieredRates && vendorDTieredRates.length > 0) {
      const dSurchargeVal = vendorDTieredRates[0].additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD += toHkd(dSurchargeVal, vendorDTieredRates[0].currency, rates)
    } else if (vendorDLookupRates && vendorDLookupRates.length > 0) {
      const dSurchargeVal = vendorDLookupRates[0].additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD += toHkd(dSurchargeVal, vendorDLookupRates[0].currency, rates)
    }

    const bcSegADetail: BracketDetail['seg_a'] = {
      pickup_rate: pickupRate,
      sorting_rate: sortingRate,
      include_sorting: includeSorting,
      weight_kg: w,
      bubble_ratio: aBubble,
      per_kg_cost_hkd: segA_perKg,
      per_piece_fee: perPieceFee > 0 ? perPieceFee : undefined,
      per_piece_currency: perPieceFee > 0 ? perPieceCur : undefined,
      exchange_rate: perPieceFee > 0 ? aExr : undefined,
      per_piece_cost_hkd: segA_perPiece,
      cost_hkd: segA,
    }

    const detail: BracketDetail = {
      seg_a: bcSegADetail,
      seg_b: { gateways: [] },
      seg_c: { gateways: [] },
      seg_d: { gateways: dGatewayDetails, pricing_detail: dPricingDetail },
      seg_bc: {
        rate_per_kg: vendorBCRate.rate_per_kg,
        handling_fee: vendorBCRate.handling_fee_per_unit,
        currency: vendorBCRate.currency,
        weight_kg: w,
        bubble_ratio: bcBubbleRatio,
        cost_in_currency: vendorBCRate.rate_per_kg * w * bcBubbleRatio + vendorBCRate.handling_fee_per_unit,
        exchange_rate_to_hkd: bcExchangeRateToHkd,
      },
    }

    return {
      weight_range: bracket.range,
      weight_min_kg: bracket.min,
      weight_max_kg: bracket.max,
      representative_weight_kg: w,
      cost_hkd: segA + segBC_final + segD,
      seg_a: segA,
      seg_b: 0,
      seg_c: 0,
      seg_d: segD,
      seg_bc: segBC_final,
      detail,
    }
  })

  const avg_cost_per_ticket = cost_per_bracket.reduce((sum, b) => sum + b.cost_hkd, 0) / cost_per_bracket.length

  return {
    gateway_allocation: gwProportions,
    cost_per_bracket,
    avg_cost_per_ticket,
    volume_analysis: {
      tier_breakpoints: [],
      current_tier: 'N/A',
      mawb_breakdown: {},
    },
    computed_at: new Date().toISOString(),
    assumptions: {
      avg_weight_kg: avgWeightKg,
      bubble_rate: scenario.bc_bubble_ratio ?? 1.0,
      weekly_tickets: scenario.weekly_tickets ?? 1000,
      exchange_rates: {
        usd_hkd: rates.usd_hkd,
        hkd_rmb: rates.hkd_rmb,
        usd_rmb: rates.usd_rmb,
      },
      gateway_mode: 'bc_combined',
    },
  }
}

// ─── Helper: Compute A段 Cost ──────────────────────────────────────────────

function computeSegA(scenario: Scenario, weight: number, rates: ExchangeRates): { cost: number; detail: BracketDetail['seg_a'] } {
  const pickupRate = scenario.seg_a.pickup_hkd_per_kg ?? 0
  const sortingRate = scenario.seg_a.sorting_hkd_per_kg ?? 0
  const includeSorting = scenario.seg_a.include_sorting ?? false
  const bubble = scenario.seg_a.bubble_ratio ?? 1.0
  const perKgRate = pickupRate + (includeSorting ? sortingRate : 0)
  const perKgCost = perKgRate * weight * bubble

  const perPieceFee = scenario.seg_a.per_piece_fee ?? 0
  const perPieceCur = scenario.seg_a.per_piece_currency ?? 'HKD'
  const exr = exchangeRateToHkd(perPieceCur, rates)
  const perPieceCost = perPieceFee > 0 ? perPieceFee * exr : 0

  const cost = perKgCost + perPieceCost

  return {
    cost,
    detail: {
      pickup_rate: pickupRate,
      sorting_rate: sortingRate,
      include_sorting: includeSorting,
      weight_kg: weight,
      bubble_ratio: bubble,
      per_kg_cost_hkd: perKgCost,
      per_piece_fee: perPieceFee > 0 ? perPieceFee : undefined,
      per_piece_currency: perPieceFee > 0 ? perPieceCur : undefined,
      exchange_rate: perPieceFee > 0 ? exr : undefined,
      per_piece_cost_hkd: perPieceCost,
      cost_hkd: cost,
    },
  }
}

// ─── Helper: Compute D段 Cost (all models) ─────────────────────────────────

interface DSegComputeInput {
  w: number
  scenario: Scenario
  vendorD: Vendor | null | undefined
  vendorDRates: VendorDRate[] | undefined
  vendorDTieredRates: VendorDTieredRate[] | undefined
  vendorDLookupRates: VendorDLookupRate[] | undefined
  vendorDLookupAreaCountries: VendorDLookupAreaCountry[] | undefined
  gwProportions: Record<string, number>
  carrierProportions: Array<{ carrier: string; pct: number }>
  lastMileRates: unknown[]
  zoneDistribution?: Record<string, Record<string, Record<number, number>>>
  tierDistribution?: Record<string, number>
  rates: ExchangeRates
}

function computeSegD(input: DSegComputeInput): {
  cost: number
  gatewayDetails: BracketDetail['seg_d']['gateways']
  pricingDetail?: BracketDetail['seg_d']['pricing_detail']
} {
  const { w, scenario, vendorD, vendorDRates, vendorDTieredRates, vendorDLookupRates, vendorDLookupAreaCountries, gwProportions, carrierProportions, lastMileRates, zoneDistribution, tierDistribution, rates } = input
  const dPricingModel = scenario.d_pricing_model ?? 'zone_based'
  const dIsPerPiece = dPricingModel === 'per_piece' && vendorD?.config?.per_piece === true
  const dIsSimple = dPricingModel === 'simple' && vendorD?.config?.simple_rate === true

  let segD = 0
  const dGatewayDetails: BracketDetail['seg_d']['gateways'] = []
  let dPricingDetail: BracketDetail['seg_d']['pricing_detail']

  if (dIsPerPiece && vendorD) {
    const fee = (vendorD.config!.per_piece_fee as number) ?? 0
    const cur = (vendorD.config!.per_piece_currency as string) ?? 'USD'
    const exrToHkd = exchangeRateToHkd(cur, rates)
    segD = fee * exrToHkd
    dPricingDetail = {
      model: 'per_piece', weight_kg: w, cost_hkd: segD,
      per_piece_fee: fee, currency: cur, exchange_rate_to_hkd: exrToHkd,
    }
  } else if (dIsSimple && vendorD) {
    const dRatePerKg = vendorD.config!.rate_per_kg ?? 0
    const dCurrency = vendorD.config!.rate_currency ?? 'USD'
    const exrToHkd = exchangeRateToHkd(dCurrency, rates)
    segD = dRatePerKg * exrToHkd * w
    dPricingDetail = {
      model: 'simple', weight_kg: w, cost_hkd: segD,
      rate_per_kg: dRatePerKg, currency: dCurrency, exchange_rate_to_hkd: exrToHkd,
    }
  } else if ((dPricingModel === 'first_additional' || dPricingModel === 'weight_bracket') && vendorDRates && vendorDRates.length > 0) {
    const zoneRowCounts = new Map<string, number>()
    for (const r of vendorDRates) { const z = r.zone ?? 'default'; zoneRowCounts.set(z, (zoneRowCounts.get(z) ?? 0) + 1) }
    const isWeightBracket = [...zoneRowCounts.values()].some((c) => c > 1)
    if (isWeightBracket) {
      const dResult = computeWeightBracketCost(w, vendorDRates, rates, tierDistribution)
      segD = dResult.costHkd
      dPricingDetail = {
        model: 'weight_bracket', weight_kg: w, cost_hkd: segD,
        zones: dResult.detail.map((d) => ({
          zone: d.zone, weight: d.weight, matched_bracket_max: d.matched_bracket_max,
          bracket_price: d.bracket_price, additional_units: d.additional_units,
          additional_weight_kg: undefined, additional_weight_price: d.additional_price_per_unit,
          currency: d.currency, cost_in_currency: d.cost_in_currency,
          exchange_rate_to_hkd: d.exchange_rate_to_hkd,
        })),
      }
    } else {
      const dResult = computeFirstAdditionalCost(w, vendorDRates, rates, tierDistribution)
      segD = dResult.costHkd
      dPricingDetail = {
        model: 'first_additional', weight_kg: w, cost_hkd: segD,
        zones: dResult.detail.map((d) => ({
          zone: d.zone, weight: d.weight, first_weight_kg: d.first_weight_kg,
          first_weight_price: d.first_weight_price,
          additional_weight_kg: d.additional_weight_kg,
          additional_weight_price: d.additional_weight_price,
          additional_units: d.additional_weight_kg > 0
            ? Math.ceil(Math.max(0, w - d.first_weight_kg) / d.additional_weight_kg) : 0,
          currency: d.currency, cost_in_currency: d.cost_in_currency,
          exchange_rate_to_hkd: d.exchange_rate_to_hkd,
        })),
      }
    }
  } else if (dPricingModel === 'tiered_per_kg' && vendorDTieredRates && vendorDTieredRates.length > 0) {
    const dResult = computeTieredPerKgCost(w, scenario.country_code, vendorDTieredRates, rates)
    segD = dResult.costHkd
    if (dResult.detail) {
      dPricingDetail = {
        model: 'tiered_per_kg', weight_kg: w, cost_hkd: segD,
        tiered: dResult.detail,
      }
    }
  } else if (dPricingModel === 'lookup_table' && vendorDLookupRates && vendorDLookupRates.length > 0 && vendorDLookupAreaCountries) {
    const dResult = computeLookupTableCost(w, scenario.country_code, vendorDLookupRates, vendorDLookupAreaCountries, rates)
    segD = dResult.costHkd
    if (dResult.detail) {
      dPricingDetail = {
        model: 'lookup_table', weight_kg: w, cost_hkd: segD,
        lookup: dResult.detail,
      }
    }
  } else if (lastMileRates && carrierProportions) {
    for (const [gw, pct] of Object.entries(gwProportions)) {
      if (pct <= 0) continue
      const dDetail = computeLastMileCostForGatewayDetailed(
        w, gw, carrierProportions, lastMileRates as LastMileRate[], zoneDistribution
      )
      const subtotalHkd = dDetail.avg_cost_usd * rates.usd_hkd
      segD += subtotalHkd * pct
      dGatewayDetails.push({
        gateway: gw, proportion: pct, weight_oz: dDetail.weight_oz,
        carriers: dDetail.carriers, avg_cost_usd: dDetail.avg_cost_usd,
        usd_hkd: rates.usd_hkd, subtotal: subtotalHkd,
      })
    }
  }

  return { cost: segD, gatewayDetails: dGatewayDetails, pricingDetail: dPricingDetail }
}

// ─── Multi-B Computation (A + B1 + B2 + C + D) ─────────────────────────────

export interface MultiBComputeInput {
  scenario: Scenario
  vendorBRates: VendorBRate[]
  vendorCRates: VendorCRate[]
  vendorB: Vendor | null
  vendorB2: Vendor | null
  vendorB2Rates: VendorBRate[]
  b2GatewayProportions: Record<string, number>
  lastMileRates: unknown[]
  carrierProportions: Array<{ carrier: string; pct: number }>
  zoneDistribution?: Record<string, Record<string, Record<number, number>>>
  tierDistribution?: Record<string, number>
  vendorD: Vendor | null
  vendorDRates: VendorDRate[]
  vendorDTieredRates?: VendorDTieredRate[]
  vendorDLookupRates?: VendorDLookupRate[]
  vendorDLookupAreaCountries?: VendorDLookupAreaCountry[]
  avgWeightKg: number
  weights?: WeightPoint[]
}

export function computeScenarioCostMultiB(input: MultiBComputeInput): ScenarioResults {
  const {
    scenario, vendorBRates, vendorCRates, vendorB, vendorB2, vendorB2Rates,
    b2GatewayProportions, lastMileRates, carrierProportions, zoneDistribution,
    tierDistribution, vendorD, vendorDRates, vendorDTieredRates, vendorDLookupRates,
    vendorDLookupAreaCountries, avgWeightKg, weights,
  } = input
  const brackets = weights ?? WEIGHT_BRACKETS
  const rates = scenario.exchange_rates!
  const weeklyTickets = scenario.weekly_tickets ?? 1000
  // B1 and B2 have independent bubble ratios (v3.1 fix)
  const b1BubbleRate = scenario.b1_bubble_ratio ?? scenario.b_bubble_rate ?? 1.1
  const b2BubbleRate = scenario.b_bubble_rate ?? 1.1
  const b1IsSimple = vendorB?.config?.simple_rate === true
  const b2IsSimple = vendorB2?.config?.simple_rate === true
  const bUseMedian = scenario.use_median_pricing === true
  const b1BufferPct = typeof vendorB?.config?.b_buffer_pct === 'number' ? vendorB.config.b_buffer_pct : 0.1
  const b2BufferPct = typeof vendorB2?.config?.b_buffer_pct === 'number' ? vendorB2.config.b_buffer_pct : 0.1

  // B1 gateway proportions (transit, typically single gateway like HKG)
  const b1GwProportions = scenario.b_gateway_mode === 'single' && scenario.b_single_gateway
    ? { [scenario.b_single_gateway]: 1.0 }
    : scenario.b_manual_proportions ?? {}

  // B1 gateway volumes
  const b1GwVolumes = resolveGatewayVolumes(
    weeklyTickets, b1GwProportions, avgWeightKg, vendorBRates, rates, scenario.flights_per_week
  )

  // B2 gateway volumes (destination ports, used for C and D)
  const b2GwVolumes = resolveGatewayVolumes(
    weeklyTickets, b2GatewayProportions, avgWeightKg, vendorB2Rates, rates, scenario.flights_per_week
  )

  const cost_per_bracket: BracketCost[] = brackets.map((bracket) => {
    const w = bracket.representative

    // A段
    const { cost: segA, detail: segADetail } = computeSegA(scenario, w, rates)

    // B1段: existing B-segment logic with B1 gateway
    let segB1 = 0
    const b1GatewayDetails: BracketDetail['seg_b']['gateways'] = []
    if (b1IsSimple && vendorB) {
      for (const gv of b1GwVolumes) {
        const gwRate = vendorBRates.find((r) => r.gateway_code === gv.gateway)
        if (!gwRate) continue
        const bRateHkd = toHkd(gwRate.rate_per_kg, gwRate.currency ?? 'HKD', rates)
        const freightCost = bRateHkd * w
        const totalFixedFees =
          (gwRate.pickup_fee ?? 0) + (gwRate.handling_fee ?? 0) +
          (gwRate.operation_fee ?? 0) + (gwRate.document_fee ?? 0) +
          (gwRate.battery_check_fee ?? 0) + (gwRate.customs_fee ?? 0) +
          (gwRate.airport_transfer_fee ?? 0) + (gwRate.magnetic_check_fee ?? 0)
        const fixedHkd = toHkd(totalFixedFees, gwRate.currency ?? 'HKD', rates)
        const mawbAmortized = totalFixedFees > 0 && gv.ticketsPerMawb > 0 ? fixedHkd / gv.ticketsPerMawb : 0
        const subtotal = freightCost + mawbAmortized
        segB1 += subtotal * gv.proportion
        b1GatewayDetails.push({
          gateway: gv.gateway, proportion: gv.proportion, rate_per_kg: bRateHkd,
          tier_label: '簡易', bubble_rate: 1, freight_cost: freightCost,
          mawb_fixed_total: fixedHkd, tickets_per_mawb: gv.ticketsPerMawb,
          mawb_amortized: mawbAmortized, subtotal,
        })
      }
    } else {
      for (const gv of b1GwVolumes) {
        const bCost = resolveBCost(vendorBRates, gv.gateway, gv.kgPerMawb, rates, gv.ticketsPerMawb, bUseMedian, b1BufferPct)
        if (!bCost) continue
        const freightCost = bCost.rate_per_kg_hkd * w * b1BubbleRate
        const mawbAmortized = gv.ticketsPerMawb > 0 ? bCost.mawb_fixed_hkd / gv.ticketsPerMawb : 0
        const bPerTicket = freightCost + mawbAmortized
        segB1 += bPerTicket * gv.proportion
        b1GatewayDetails.push({
          gateway: gv.gateway, proportion: gv.proportion, rate_per_kg: bCost.rate_per_kg_hkd,
          tier_label: bCost.tier_label, bubble_rate: b1BubbleRate, freight_cost: freightCost,
          mawb_fixed_total: bCost.mawb_fixed_hkd, tickets_per_mawb: gv.ticketsPerMawb,
          mawb_amortized: mawbAmortized, subtotal: bPerTicket,
          service_count: bCost.service_count, is_median: bCost.is_median,
        })
      }
    }

    // B2段: same B-segment logic with B2 vendor + B2 gateway
    let segB2 = 0
    const b2GatewayDetails: NonNullable<BracketDetail['seg_b2']>['gateways'] = []
    if (b2IsSimple && vendorB2) {
      for (const gv of b2GwVolumes) {
        const gwRate = vendorB2Rates.find((r) => r.gateway_code === gv.gateway)
        if (!gwRate) continue
        const b2RateHkd = toHkd(gwRate.rate_per_kg, gwRate.currency ?? 'HKD', rates)
        const freightCost = b2RateHkd * w
        const totalFixedFees =
          (gwRate.pickup_fee ?? 0) + (gwRate.handling_fee ?? 0) +
          (gwRate.operation_fee ?? 0) + (gwRate.document_fee ?? 0) +
          (gwRate.battery_check_fee ?? 0) + (gwRate.customs_fee ?? 0) +
          (gwRate.airport_transfer_fee ?? 0) + (gwRate.magnetic_check_fee ?? 0)
        const fixedHkd = toHkd(totalFixedFees, gwRate.currency ?? 'HKD', rates)
        const mawbAmortized = totalFixedFees > 0 && gv.ticketsPerMawb > 0 ? fixedHkd / gv.ticketsPerMawb : 0
        const subtotal = freightCost + mawbAmortized
        segB2 += subtotal * gv.proportion
        b2GatewayDetails.push({
          gateway: gv.gateway, proportion: gv.proportion, rate_per_kg: b2RateHkd,
          tier_label: '簡易', bubble_rate: 1, freight_cost: freightCost,
          mawb_fixed_total: fixedHkd, tickets_per_mawb: gv.ticketsPerMawb,
          mawb_amortized: mawbAmortized, subtotal,
        })
      }
    } else {
      for (const gv of b2GwVolumes) {
        const bCost = resolveBCost(vendorB2Rates, gv.gateway, gv.kgPerMawb, rates, gv.ticketsPerMawb, bUseMedian, b2BufferPct)
        if (!bCost) continue
        const freightCost = bCost.rate_per_kg_hkd * w * b2BubbleRate
        const mawbAmortized = gv.ticketsPerMawb > 0 ? bCost.mawb_fixed_hkd / gv.ticketsPerMawb : 0
        const bPerTicket = freightCost + mawbAmortized
        segB2 += bPerTicket * gv.proportion
        b2GatewayDetails.push({
          gateway: gv.gateway, proportion: gv.proportion, rate_per_kg: bCost.rate_per_kg_hkd,
          tier_label: bCost.tier_label, bubble_rate: b2BubbleRate, freight_cost: freightCost,
          mawb_fixed_total: bCost.mawb_fixed_hkd, tickets_per_mawb: gv.ticketsPerMawb,
          mawb_amortized: mawbAmortized, subtotal: bPerTicket,
          service_count: bCost.service_count, is_median: bCost.is_median,
        })
      }
    }

    // C段: uses B2's gateway proportions (destination ports)
    let segC = 0
    const cGatewayDetails: BracketDetail['seg_c']['gateways'] = []
    for (const gv of b2GwVolumes) {
      const cCost = resolveCCost(vendorCRates, w, gv.gateway, gv.ticketsPerMawb, rates)
      segC += cCost.per_ticket_hkd * gv.proportion
      cGatewayDetails.push({
        gateway: gv.gateway, proportion: gv.proportion,
        mawb_amortized: cCost.mawb_amortized_hkd, per_kg_cost: cCost.per_kg_hkd,
        per_hawb_cost: cCost.per_hawb_hkd, subtotal: cCost.per_ticket_hkd,
      })
    }

    // D段: uses B2's gateway proportions
    const dResult = computeSegD({
      w, scenario, vendorD, vendorDRates, vendorDTieredRates, vendorDLookupRates,
      vendorDLookupAreaCountries, gwProportions: b2GatewayProportions,
      carrierProportions, lastMileRates, zoneDistribution, tierDistribution, rates,
    })

    // Additional surcharges (per-ticket, converted to HKD)
    if (vendorBRates.length > 0) {
      const b1SurchargeVal = vendorBRates[0].additional_surcharge ?? 0
      if (b1SurchargeVal > 0) segB1 += toHkd(b1SurchargeVal, vendorBRates[0].currency ?? 'HKD', rates)
    }
    if (vendorB2Rates.length > 0) {
      const b2SurchargeVal = vendorB2Rates[0].additional_surcharge ?? 0
      if (b2SurchargeVal > 0) segB2 += toHkd(b2SurchargeVal, vendorB2Rates[0].currency ?? 'HKD', rates)
    }
    if (vendorCRates.length > 0) {
      const cSurchargeVal = vendorCRates[0].additional_surcharge ?? 0
      if (cSurchargeVal > 0) segC += toHkd(cSurchargeVal, vendorCRates[0].currency ?? 'USD', rates)
    }
    let segD_final = dResult.cost
    if (vendorDRates && vendorDRates.length > 0) {
      const dSurchargeVal = vendorDRates[0].additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD_final += toHkd(dSurchargeVal, vendorDRates[0].currency, rates)
    } else if (vendorDTieredRates && vendorDTieredRates.length > 0) {
      const dSurchargeVal = vendorDTieredRates[0].additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD_final += toHkd(dSurchargeVal, vendorDTieredRates[0].currency, rates)
    } else if (vendorDLookupRates && vendorDLookupRates.length > 0) {
      const dSurchargeVal = vendorDLookupRates[0].additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD_final += toHkd(dSurchargeVal, vendorDLookupRates[0].currency, rates)
    }

    const detail: BracketDetail = {
      seg_a: segADetail,
      seg_b: { gateways: b1GatewayDetails },
      seg_b2: { gateways: b2GatewayDetails },
      seg_c: { gateways: cGatewayDetails },
      seg_d: { gateways: dResult.gatewayDetails, pricing_detail: dResult.pricingDetail },
    }

    return {
      weight_range: bracket.range,
      weight_min_kg: bracket.min,
      weight_max_kg: bracket.max,
      representative_weight_kg: w,
      cost_hkd: segA + segB1 + segB2 + segC + segD_final,
      seg_a: segA,
      seg_b: segB1,
      seg_b2: segB2,
      seg_c: segC,
      seg_d: segD_final,
      detail,
    }
  })

  const avg_cost_per_ticket = cost_per_bracket.reduce((sum, b) => sum + b.cost_hkd, 0) / cost_per_bracket.length

  return {
    gateway_allocation: b2GatewayProportions,
    cost_per_bracket,
    avg_cost_per_ticket,
    volume_analysis: {
      tier_breakpoints: [],
      current_tier: 'N/A',
      mawb_breakdown: {},
    },
    computed_at: new Date().toISOString(),
    assumptions: {
      avg_weight_kg: avgWeightKg,
      bubble_rate: b1BubbleRate,
      weekly_tickets: weeklyTickets,
      exchange_rates: { usd_hkd: rates.usd_hkd, hkd_rmb: rates.hkd_rmb, usd_rmb: rates.usd_rmb },
      gateway_mode: 'multi_b',
    },
  }
}

// ─── Multi-B-B2C Computation (A + B1 + B2C + D) ────────────────────────────

export interface MultiBB2CComputeInput {
  scenario: Scenario
  vendorBRates: VendorBRate[]
  vendorB: Vendor | null
  vendorB2: Vendor | null
  vendorB2CRate: VendorBCRate | null
  b2GatewayProportions: Record<string, number>
  lastMileRates: unknown[]
  carrierProportions: Array<{ carrier: string; pct: number }>
  zoneDistribution?: Record<string, Record<string, Record<number, number>>>
  tierDistribution?: Record<string, number>
  vendorD: Vendor | null
  vendorDRates: VendorDRate[]
  vendorDTieredRates?: VendorDTieredRate[]
  vendorDLookupRates?: VendorDLookupRate[]
  vendorDLookupAreaCountries?: VendorDLookupAreaCountry[]
  avgWeightKg: number
  weights?: WeightPoint[]
}

export function computeScenarioCostMultiBB2C(input: MultiBB2CComputeInput): ScenarioResults {
  const {
    scenario, vendorBRates, vendorB, vendorB2, vendorB2CRate,
    b2GatewayProportions, lastMileRates, carrierProportions, zoneDistribution,
    tierDistribution, vendorD, vendorDRates, vendorDTieredRates, vendorDLookupRates,
    vendorDLookupAreaCountries, avgWeightKg, weights,
  } = input
  const brackets = weights ?? WEIGHT_BRACKETS
  const rates = scenario.exchange_rates!
  const weeklyTickets = scenario.weekly_tickets ?? 1000
  // B1 independent bubble ratio (v3.1 fix)
  const b1BubbleRate = scenario.b1_bubble_ratio ?? scenario.b_bubble_rate ?? 1.1
  const b1IsSimple = vendorB?.config?.simple_rate === true
  const bUseMedian = scenario.use_median_pricing === true
  const b1BufferPct = typeof vendorB?.config?.b_buffer_pct === 'number' ? vendorB.config.b_buffer_pct : 0.1

  // B1 gateway proportions
  const b1GwProportions = scenario.b_gateway_mode === 'single' && scenario.b_single_gateway
    ? { [scenario.b_single_gateway]: 1.0 }
    : scenario.b_manual_proportions ?? {}

  const b1GwVolumes = resolveGatewayVolumes(
    weeklyTickets, b1GwProportions, avgWeightKg, vendorBRates, rates, scenario.flights_per_week
  )

  // B2C rate conversion
  const b2cExr = vendorB2CRate ? exchangeRateToHkd(vendorB2CRate.currency ?? 'USD', rates) : 1
  const b2cRateHkdPerKg = vendorB2CRate ? vendorB2CRate.rate_per_kg * b2cExr : 0
  const b2cHandlingHkd = vendorB2CRate ? vendorB2CRate.handling_fee_per_unit * b2cExr : 0

  const cost_per_bracket: BracketCost[] = brackets.map((bracket) => {
    const w = bracket.representative

    // A段
    const { cost: segA, detail: segADetail } = computeSegA(scenario, w, rates)

    // B1段
    let segB1 = 0
    const b1GatewayDetails: BracketDetail['seg_b']['gateways'] = []
    if (b1IsSimple && vendorB) {
      for (const gv of b1GwVolumes) {
        const gwRate = vendorBRates.find((r) => r.gateway_code === gv.gateway)
        if (!gwRate) continue
        const bRateHkd = toHkd(gwRate.rate_per_kg, gwRate.currency ?? 'HKD', rates)
        const freightCost = bRateHkd * w
        const totalFixedFees =
          (gwRate.pickup_fee ?? 0) + (gwRate.handling_fee ?? 0) +
          (gwRate.operation_fee ?? 0) + (gwRate.document_fee ?? 0) +
          (gwRate.battery_check_fee ?? 0) + (gwRate.customs_fee ?? 0) +
          (gwRate.airport_transfer_fee ?? 0) + (gwRate.magnetic_check_fee ?? 0)
        const fixedHkd = toHkd(totalFixedFees, gwRate.currency ?? 'HKD', rates)
        const mawbAmortized = totalFixedFees > 0 && gv.ticketsPerMawb > 0 ? fixedHkd / gv.ticketsPerMawb : 0
        const subtotal = freightCost + mawbAmortized
        segB1 += subtotal * gv.proportion
        b1GatewayDetails.push({
          gateway: gv.gateway, proportion: gv.proportion, rate_per_kg: bRateHkd,
          tier_label: '簡易', bubble_rate: 1, freight_cost: freightCost,
          mawb_fixed_total: fixedHkd, tickets_per_mawb: gv.ticketsPerMawb,
          mawb_amortized: mawbAmortized, subtotal,
        })
      }
    } else {
      for (const gv of b1GwVolumes) {
        const bCost = resolveBCost(vendorBRates, gv.gateway, gv.kgPerMawb, rates, gv.ticketsPerMawb, bUseMedian, b1BufferPct)
        if (!bCost) continue
        const freightCost = bCost.rate_per_kg_hkd * w * b1BubbleRate
        const mawbAmortized = gv.ticketsPerMawb > 0 ? bCost.mawb_fixed_hkd / gv.ticketsPerMawb : 0
        const bPerTicket = freightCost + mawbAmortized
        segB1 += bPerTicket * gv.proportion
        b1GatewayDetails.push({
          gateway: gv.gateway, proportion: gv.proportion, rate_per_kg: bCost.rate_per_kg_hkd,
          tier_label: bCost.tier_label, bubble_rate: b1BubbleRate, freight_cost: freightCost,
          mawb_fixed_total: bCost.mawb_fixed_hkd, tickets_per_mawb: gv.ticketsPerMawb,
          mawb_amortized: mawbAmortized, subtotal: bPerTicket,
          service_count: bCost.service_count, is_median: bCost.is_median,
        })
      }
    }

    // B2C段: BC combined logic (rate_per_kg × weight × bubble_ratio + handling_fee)
    const b2cBubbleRatio = scenario.bc_bubble_ratio ?? 1.0
    const segB2C = b2cRateHkdPerKg * w * b2cBubbleRatio + b2cHandlingHkd

    // C段: 0 — included in B2C
    const segC = 0

    // D段: uses B2's gateway proportions
    const dResult = computeSegD({
      w, scenario, vendorD, vendorDRates, vendorDTieredRates, vendorDLookupRates,
      vendorDLookupAreaCountries, gwProportions: b2GatewayProportions,
      carrierProportions, lastMileRates, zoneDistribution, tierDistribution, rates,
    })

    // Additional surcharges (per-ticket, converted to HKD)
    if (vendorBRates.length > 0) {
      const b1SurchargeVal = vendorBRates[0].additional_surcharge ?? 0
      if (b1SurchargeVal > 0) segB1 += toHkd(b1SurchargeVal, vendorBRates[0].currency ?? 'HKD', rates)
    }
    let segB2C_final = segB2C
    if (vendorB2CRate) {
      const b2cSurchargeVal = vendorB2CRate.additional_surcharge ?? 0
      if (b2cSurchargeVal > 0) segB2C_final += b2cSurchargeVal * b2cExr
    }
    let segD_b2c_final = dResult.cost
    if (vendorDRates && vendorDRates.length > 0) {
      const dSurchargeVal = vendorDRates[0].additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD_b2c_final += toHkd(dSurchargeVal, vendorDRates[0].currency, rates)
    } else if (vendorDTieredRates && vendorDTieredRates.length > 0) {
      const dSurchargeVal = vendorDTieredRates[0].additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD_b2c_final += toHkd(dSurchargeVal, vendorDTieredRates[0].currency, rates)
    } else if (vendorDLookupRates && vendorDLookupRates.length > 0) {
      const dSurchargeVal = vendorDLookupRates[0].additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD_b2c_final += toHkd(dSurchargeVal, vendorDLookupRates[0].currency, rates)
    }

    const detail: BracketDetail = {
      seg_a: segADetail,
      seg_b: { gateways: b1GatewayDetails },
      seg_b2c: vendorB2CRate ? {
        vendor_name: vendorB2?.name,
        rate_per_kg: vendorB2CRate.rate_per_kg,
        handling_fee: vendorB2CRate.handling_fee_per_unit,
        currency: vendorB2CRate.currency,
        weight_kg: w,
        bubble_ratio: b2cBubbleRatio,
        cost_in_currency: vendorB2CRate.rate_per_kg * w * b2cBubbleRatio + vendorB2CRate.handling_fee_per_unit,
        exchange_rate_to_hkd: b2cExr,
      } : undefined,
      seg_c: { gateways: [] },
      seg_d: { gateways: dResult.gatewayDetails, pricing_detail: dResult.pricingDetail },
    }

    return {
      weight_range: bracket.range,
      weight_min_kg: bracket.min,
      weight_max_kg: bracket.max,
      representative_weight_kg: w,
      cost_hkd: segA + segB1 + segB2C_final + segC + segD_b2c_final,
      seg_a: segA,
      seg_b: segB1,
      seg_b2c: segB2C_final,
      seg_c: segC,
      seg_d: segD_b2c_final,
      detail,
    }
  })

  const avg_cost_per_ticket = cost_per_bracket.reduce((sum, b) => sum + b.cost_hkd, 0) / cost_per_bracket.length

  return {
    gateway_allocation: b2GatewayProportions,
    cost_per_bracket,
    avg_cost_per_ticket,
    volume_analysis: {
      tier_breakpoints: [],
      current_tier: 'N/A',
      mawb_breakdown: {},
    },
    computed_at: new Date().toISOString(),
    assumptions: {
      avg_weight_kg: avgWeightKg,
      bubble_rate: b1BubbleRate,
      weekly_tickets: weeklyTickets,
      exchange_rates: { usd_hkd: rates.usd_hkd, hkd_rmb: rates.hkd_rmb, usd_rmb: rates.usd_rmb },
      gateway_mode: 'multi_b_b2c',
    },
  }
}
