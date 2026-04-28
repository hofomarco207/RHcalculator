/**
 * Scenario cost calculation engine — RH fork.
 * Only bc_combined pricing mode (A + BC + D).
 */

import type { ExchangeRates, Vendor, WeightPoint } from '@/types'
import { WEIGHT_BRACKETS } from '@/types'
import type { VendorBCRate, VendorDRate, VendorDTieredRate, VendorDLookupRate, VendorDLookupAreaCountry } from '@/types/vendor'
import type {
  Scenario,
  ScenarioResults,
  BracketCost,
  BracketDetail,
} from '@/types/scenario'

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
  if (currency === 'TWD') return rates.twd_hkd ?? 0.2440
  return 1 // HKD
}

// ─── D段 First-Additional Cost ─────────────────────────────────────────────

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

export function computeWeightBracketCost(
  weightKg: number,
  dRates: VendorDRate[],
  exchangeRates: ExchangeRates,
  zoneWeights?: Record<string, number>,
): { costHkd: number; detail: { zone?: string; weight?: number; matched_bracket_max: number; bracket_price: number; additional_units: number; additional_price_per_unit: number; currency: string; weight_kg: number; cost_in_currency: number; exchange_rate_to_hkd: number }[] } {
  if (dRates.length === 0) return { costHkd: 0, detail: [] }

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
      const match = brackets.find((b) => weightKg <= b.first_weight_kg) ?? lastBracket
      cost = match.first_weight_price
      matchedMax = match.first_weight_kg
      bracketPrice = match.first_weight_price
    } else {
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

// ─── D-5: Tiered Per-KG Cost ────────────────────────────────────────────────

export function computeTieredPerKgCost(
  weightKg: number,
  countryCode: string,
  tieredRates: VendorDTieredRate[],
  exchangeRates: ExchangeRates,
): { costHkd: number; detail: { country_code: string; weight_tier: string; rate_per_kg: number; registration_fee: number; chargeable_weight: number; currency: string; cost_in_currency: number; exchange_rate_to_hkd: number } | null } {
  const countryRates = tieredRates.filter((r) => r.country_code === countryCode)
  if (countryRates.length === 0) return { costHkd: 0, detail: null }

  const tier = countryRates.find((r) => weightKg > r.weight_min_kg && weightKg <= r.weight_max_kg)
    ?? countryRates[countryRates.length - 1]

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

// ─── D-6: Lookup Table Cost ─────────────────────────────────────────────────

export function computeLookupTableCost(
  weightKg: number,
  countryCode: string,
  lookupRates: VendorDLookupRate[],
  areaCountries: VendorDLookupAreaCountry[],
  exchangeRates: ExchangeRates,
): { costHkd: number; detail: { country_code: string; area_code: string; area_name?: string; weight_point: number; amount: number; currency: string; exchange_rate_to_hkd: number } | null } {
  const areaMapping = areaCountries.find((m) => m.country_code === countryCode)
  if (!areaMapping) return { costHkd: 0, detail: null }

  const areaRates = lookupRates
    .filter((r) => r.area_code === areaMapping.area_code)
    .sort((a, b) => a.weight_kg - b.weight_kg)

  if (areaRates.length === 0) return { costHkd: 0, detail: null }

  const match = areaRates.find((r) => r.weight_kg >= weightKg)
    ?? areaRates[areaRates.length - 1]

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

// ─── BC-Combined Computation (A + BC + D independent) ─────────────────────

export interface BCCombinedComputeInput {
  scenario: Scenario
  vendorBCRate: VendorBCRate
  countryCode?: string                  // Phase 2: per-country loop passes this
  tierDistribution?: Record<string, number>
  vendorDRates?: VendorDRate[]
  vendorDTieredRates?: VendorDTieredRate[]
  vendorDLookupRates?: VendorDLookupRate[]
  vendorDLookupAreaCountries?: VendorDLookupAreaCountry[]
  vendorD?: Vendor | null
  avgWeightKg: number
  weights?: WeightPoint[]
}

export function computeScenarioCostBCCombined(input: BCCombinedComputeInput): ScenarioResults {
  const {
    scenario, vendorBCRate, countryCode = '',
    vendorDRates, vendorDTieredRates, vendorDLookupRates, vendorDLookupAreaCountries,
    vendorD, avgWeightKg, weights, tierDistribution,
  } = input
  const brackets = weights ?? WEIGHT_BRACKETS
  const rates = scenario.exchange_rates!
  const dPricingModel = scenario.d_pricing_model ?? 'tiered_per_kg'

  const bcExr = exchangeRateToHkd(vendorBCRate.currency ?? 'HKD', rates)
  const bcRateHkdPerKg = vendorBCRate.rate_per_kg * bcExr
  const bcFuelSurchargePct = (vendorBCRate as unknown as Record<string, number>).fuel_surcharge_pct ?? 0
  const bcExchangeRateToHkd = bcExr

  const dIsPerPiece = dPricingModel === 'per_piece' && vendorD?.config?.per_piece === true
  const dIsSimple = dPricingModel === 'simple' && vendorD?.config?.simple_rate === true

  const cost_per_bracket: BracketCost[] = brackets.map((bracket) => {
    const w = bracket.representative

    // A段: per-kg (with bubble, currency conversion) + per-piece
    const pickupRate = scenario.seg_a?.pickup_hkd_per_kg ?? 0
    const sortingRate = scenario.seg_a?.sorting_hkd_per_kg ?? 0
    const includeSorting = scenario.seg_a?.include_sorting ?? false
    const aBubble = scenario.seg_a?.bubble_ratio ?? 1.0
    const aPerKgCurrency = (scenario.seg_a as Record<string, unknown>)?.per_kg_currency as string ?? 'TWD'
    const aPerKgExr = exchangeRateToHkd(aPerKgCurrency, rates)
    const perKgRate = pickupRate + (includeSorting ? sortingRate : 0)
    const segA_perKg = perKgRate * aPerKgExr * w * aBubble

    const perPieceFee = scenario.seg_a?.per_piece_fee ?? 0
    const perPieceCur = scenario.seg_a?.per_piece_currency ?? 'TWD'
    const aExr = exchangeRateToHkd(perPieceCur, rates)
    const segA_perPiece = perPieceFee > 0 ? perPieceFee * aExr : 0
    const segA = segA_perKg + segA_perPiece

    // BC combined: rate_per_kg × weight × (1 + fuel_surcharge_pct / 100)
    const segBC = bcRateHkdPerKg * w * (1 + bcFuelSurchargePct / 100)

    // D段
    let segD = 0
    const dGatewayDetails: BracketDetail['seg_d']['gateways'] = []
    let dPricingDetail: BracketDetail['seg_d']['pricing_detail']

    if (dIsPerPiece && vendorD) {
      const fee = (vendorD.config!.per_piece_fee as number) ?? 0
      const cur = (vendorD.config!.per_piece_currency as string) ?? 'HKD'
      const exrToHkd = exchangeRateToHkd(cur, rates)
      segD = fee * exrToHkd
      dPricingDetail = { model: 'per_piece', weight_kg: w, cost_hkd: segD, per_piece_fee: fee, currency: cur, exchange_rate_to_hkd: exrToHkd }
    } else if (dIsSimple && vendorD) {
      const dRatePerKg = vendorD.config!.rate_per_kg ?? 0
      const dCurrency = vendorD.config!.rate_currency ?? 'HKD'
      const exrToHkd = exchangeRateToHkd(dCurrency, rates)
      segD = dRatePerKg * exrToHkd * w
      dPricingDetail = { model: 'simple', weight_kg: w, cost_hkd: segD, rate_per_kg: dRatePerKg, currency: dCurrency, exchange_rate_to_hkd: exrToHkd }
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
      const dResult = computeTieredPerKgCost(w, countryCode, vendorDTieredRates, rates)
      segD = dResult.costHkd
      if (dResult.detail) {
        dPricingDetail = { model: 'tiered_per_kg', weight_kg: w, cost_hkd: segD, tiered: dResult.detail }
      }
    } else if (dPricingModel === 'lookup_table' && vendorDLookupRates && vendorDLookupRates.length > 0 && vendorDLookupAreaCountries) {
      const dResult = computeLookupTableCost(w, countryCode, vendorDLookupRates, vendorDLookupAreaCountries, rates)
      segD = dResult.costHkd
      if (dResult.detail) {
        dPricingDetail = { model: 'lookup_table', weight_kg: w, cost_hkd: segD, lookup: dResult.detail }
      }
    }

    // Additional surcharges
    const bcSurchargeVal = (vendorBCRate as unknown as Record<string, number>).additional_surcharge ?? 0
    let segBC_final = segBC
    if (bcSurchargeVal > 0) segBC_final += bcSurchargeVal * bcExr
    if (vendorDRates && vendorDRates.length > 0) {
      const dSurchargeVal = (vendorDRates[0] as unknown as Record<string, number>).additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD += toHkd(dSurchargeVal, vendorDRates[0].currency, rates)
    } else if (vendorDTieredRates && vendorDTieredRates.length > 0) {
      const dSurchargeVal = (vendorDTieredRates[0] as unknown as Record<string, number>).additional_surcharge ?? 0
      if (dSurchargeVal > 0) segD += toHkd(dSurchargeVal, vendorDTieredRates[0].currency, rates)
    } else if (vendorDLookupRates && vendorDLookupRates.length > 0) {
      const dSurchargeVal = (vendorDLookupRates[0] as unknown as Record<string, number>).additional_surcharge ?? 0
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
        fuel_surcharge_pct: bcFuelSurchargePct,
        currency: vendorBCRate.currency,
        weight_kg: w,
        cost_in_currency: vendorBCRate.rate_per_kg * w * (1 + bcFuelSurchargePct / 100),
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
    gateway_allocation: {},
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
      weekly_tickets: scenario.weekly_tickets ?? 1000,
      exchange_rates: {
        usd_hkd: rates.usd_hkd,
        hkd_rmb: rates.hkd_rmb,
        usd_rmb: rates.usd_rmb,
        twd_hkd: rates.twd_hkd ?? 0.2440,
      },
      gateway_mode: 'bc_combined',
    },
  }
}
