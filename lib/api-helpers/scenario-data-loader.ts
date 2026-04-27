/**
 * Shared scenario data loader.
 *
 * Extracts the DB-fetching logic that was duplicated in preview/route.ts
 * so that evaluate, scout, and compete APIs can reuse it.
 */

import { createClient } from '@/lib/supabase/server'
import { computeScenarioCost, computeScenarioCostBCCombined, computeScenarioCostMultiB, computeScenarioCostMultiBB2C } from '@/lib/calculations/scenario'
import type { Scenario, ScenarioResults } from '@/types/scenario'
import type { WeightPoint, Vendor } from '@/types'
import { DEFAULT_EXCHANGE_RATES, WEIGHT_BRACKETS } from '@/types'
import type { VendorBRate, VendorCRate, VendorBCRate, VendorDRate, VendorDTieredRate, VendorDLookupRate, VendorDLookupAreaCountry, VendorBCDRate } from '@/types/vendor'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScenarioComputeData {
  scenario: Scenario
  pricingMode: 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c'
  avgWeightKg: number
  // segmented mode
  vendorBRates: VendorBRate[]
  vendorCRates: VendorCRate[]
  vendorB: Vendor | null
  // bc_combined mode
  vendorBCRate: VendorBCRate | null
  // bcd_combined mode
  vendorBCDRates: VendorBCDRate[]
  // multi-leg B2 data
  vendorB2: Vendor | null
  vendorB2Rates: VendorBRate[]       // multi_b: B2 segment=B rates
  vendorB2CRate: VendorBCRate | null // multi_b_b2c: B2 segment=BC rate
  b2GatewayProportions: Record<string, number>
  // D segment (shared)
  vendorD: Vendor | null
  vendorDRates: VendorDRate[]
  vendorDTieredRates: VendorDTieredRate[]
  vendorDLookupRates: VendorDLookupRate[]
  vendorDLookupAreaCountries: VendorDLookupAreaCountry[]
  dPricingModel: 'zone_based' | 'first_additional' | 'weight_bracket' | 'simple' | 'per_piece' | 'tiered_per_kg' | 'lookup_table'
  lastMileRates: unknown[]
  carrierProportions: Array<{ carrier: string; pct: number }>
  zoneDistribution?: Record<string, Record<string, Record<number, number>>>
  tierDistribution?: Record<string, number>
}

// ─── Load scenario from DB by ID ────────────────────────────────────────────

export async function loadScenarioById(scenarioId: string): Promise<Scenario | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('scenarios')
    .select('*')
    .eq('id', scenarioId)
    .single()
  if (error || !data) return null
  return data as Scenario
}

// ─── Load all data needed to compute costs for a scenario ───────────────────

export async function loadScenarioComputeData(scenarioInput: Scenario): Promise<ScenarioComputeData> {
  let scenario = scenarioInput
  const supabase = await createClient()
  const baseRates = scenario.exchange_rates ?? DEFAULT_EXCHANGE_RATES
  // Ensure jpy_hkd is always available (older scenarios may not have it)
  const rates = { ...baseRates, jpy_hkd: baseRates.jpy_hkd ?? DEFAULT_EXCHANGE_RATES.jpy_hkd }
  const pricingMode = scenario.pricing_mode ?? 'segmented'
  const weeklyTickets = scenario.weekly_tickets ?? 1000
  const avgWeightKg = (scenario.weekly_kg && weeklyTickets > 0)
    ? scenario.weekly_kg / weeklyTickets
    : 1.2

  // Common D segment data
  let vendorD: Vendor | null = null
  let vendorDRates: VendorDRate[] = []
  let vendorDTieredRates: VendorDTieredRate[] = []
  let vendorDLookupRates: VendorDLookupRate[] = []
  let vendorDLookupAreaCountries: VendorDLookupAreaCountry[] = []
  let dPricingModel: ScenarioComputeData['dPricingModel'] = scenario.d_pricing_model ?? 'zone_based'
  let lastMileRates: unknown[] = []
  let carrierProportions: Array<{ carrier: string; pct: number }> = []
  let zoneDistribution: Record<string, Record<string, Record<number, number>>> | undefined

  // BCD combined data
  let vendorBCDRates: VendorBCDRate[] = []

  // For bcd_combined, the BCD vendor also serves as the D pricing source
  const dVendorId = scenario.vendor_d_id
    || (pricingMode === 'bcd_combined' ? scenario.vendor_bcd_id : undefined)

  // Load vendor D (or BCD vendor for bcd_combined)
  if (dVendorId) {
    const { data } = await supabase.from('vendors').select('*').eq('id', dVendorId).single()
    vendorD = data as Vendor | null
  }

  const dIsPerPiece = vendorD?.config?.per_piece === true
  if (dIsPerPiece) {
    dPricingModel = 'per_piece'
  }
  const dIsSimple = vendorD?.config?.simple_rate === true
  if (dIsSimple) {
    dPricingModel = 'simple'
  }

  // Auto-detect D pricing model with priority order:
  // 1. vendor_d_rates → first_additional / weight_bracket
  // 2. vendor_d_tiered_rates → tiered_per_kg
  // 3. vendor_d_lookup_rates → lookup_table
  // 4. simple (config flag)
  // 5. zone_based (fallback)
  if (dVendorId && !dIsPerPiece && !dIsSimple) {
    // Check vendor_d_rates first
    const { data: dRates } = await supabase
      .from('vendor_d_rates').select('*')
      .eq('vendor_id', dVendorId).eq('is_current', true)
    if (dRates && dRates.length > 0) {
      const zrc = new Map<string, number>()
      for (const r of dRates) {
        const z = (r as Record<string, unknown>).zone ?? 'default'
        zrc.set(z as string, (zrc.get(z as string) ?? 0) + 1)
      }
      dPricingModel = [...zrc.values()].some((c) => c > 1) ? 'weight_bracket' : 'first_additional'
      vendorDRates = dRates as VendorDRate[]
    } else {
      // Check vendor_d_tiered_rates
      const { data: tieredRates } = await supabase
        .from('vendor_d_tiered_rates').select('*')
        .eq('vendor_id', dVendorId).is('valid_to', null)
      if (tieredRates && tieredRates.length > 0) {
        dPricingModel = 'tiered_per_kg'
        vendorDTieredRates = tieredRates as VendorDTieredRate[]
      } else {
        // Check vendor_d_lookup_rates
        const { data: lookupRates } = await supabase
          .from('vendor_d_lookup_rates').select('*')
          .eq('vendor_id', dVendorId).is('valid_to', null)
        if (lookupRates && lookupRates.length > 0) {
          dPricingModel = 'lookup_table'
          vendorDLookupRates = lookupRates as VendorDLookupRate[]
          // Also load area → country mapping
          const { data: areaCountries } = await supabase
            .from('vendor_d_lookup_area_countries').select('*')
            .eq('vendor_id', dVendorId)
          vendorDLookupAreaCountries = (areaCountries ?? []) as VendorDLookupAreaCountry[]
        }
        // else: falls through to zone_based (default)
      }
    }
  }

  // Load zone-based D data if needed
  if (dPricingModel === 'zone_based' && dVendorId && !dIsSimple) {
    const [lmRes, zdRes, cpRes] = await Promise.all([
      // Override PostgREST's default 1000-row limit — US vendor alone has 1344 rows
      // across GOFO/UNI/USPS; without this, USPS heavy-weight rows get cut off and
      // lookups at 15+ kg return 0.
      supabase.from('last_mile_rates').select('*').eq('vendor_id', dVendorId).limit(10000),
      supabase.from('computed_distributions').select('zone_distribution').order('computed_at', { ascending: false }).limit(1),
      supabase.from('carrier_proportions').select('*').eq('is_current', true),
    ])
    lastMileRates = lmRes.data ?? []
    zoneDistribution = zdRes.data?.[0]?.zone_distribution
    carrierProportions = scenario.d_carrier_proportions ?? (() => {
      const props = cpRes.data?.[0]
      if (!props) return [{ carrier: 'GOFO', pct: 0.4 }, { carrier: 'USPS', pct: 0.5 }, { carrier: 'OSM', pct: 0.1 }]
      return [
        { carrier: 'GOFO', pct: props.gofo_pct ?? 0 },
        { carrier: 'OSM', pct: props.osm_pct ?? 0 },
        { carrier: 'USPS', pct: props.usps_pct ?? 0 },
        { carrier: 'UNI', pct: props.uniuni_pct ?? 0 },
      ].filter((c: { pct: number }) => c.pct > 0)
    })()
  }

  // Load tier distribution for first_additional / weight_bracket models
  let tierDistribution: Record<string, number> | undefined
  if ((dPricingModel === 'first_additional' || dPricingModel === 'weight_bracket') && scenario.country_code) {
    const { data: aggRows } = await supabase.rpc('zone_tier_distribution', {
      p_country: scenario.country_code,
    })
    if (aggRows && aggRows.length > 0) {
      const total = aggRows.reduce((s: number, r: { cnt: number }) => s + r.cnt, 0)
      tierDistribution = {}
      for (const r of aggRows) {
        tierDistribution[r.zone] = r.cnt / total
      }
    }
  }

  // ── Resolve gateway proportions from country gateways ──────────────────────
  // For BC-combined / BCD-combined modes, b_gateway_mode / b_single_gateway are
  // leftover from B-segment config and are NOT meaningful — always resolve from
  // the country's gateways table. For segmented mode, only resolve when no
  // explicit gateway is set.
  const isMultiLeg = pricingMode === 'multi_b' || pricingMode === 'multi_b_b2c'
  const isCombinedMode = pricingMode === 'bc_combined' || pricingMode === 'bcd_combined'
  const hasExplicitGateways = !isCombinedMode && !isMultiLeg && (
    (scenario.b_gateway_mode === 'single' && !!scenario.b_single_gateway) ||
    (scenario.b_manual_proportions && Object.keys(scenario.b_manual_proportions).length > 0)
  )

  // For multi-leg, B1 gateway is typically transit (e.g. HKG), set explicitly.
  // B2 gateway is destination (e.g. LAX/JFK), resolved from scenario b2_* fields or country gateways.
  let b2GatewayProportions: Record<string, number> = {}

  if (isMultiLeg) {
    // Resolve B2 gateways
    const hasB2Explicit =
      (scenario.b2_gateway_mode === 'single' && !!scenario.b2_single_gateway) ||
      (scenario.b2_manual_proportions && Object.keys(scenario.b2_manual_proportions).length > 0)

    if (hasB2Explicit) {
      if (scenario.b2_gateway_mode === 'single' && scenario.b2_single_gateway) {
        b2GatewayProportions = { [scenario.b2_single_gateway]: 1.0 }
      } else if (scenario.b2_manual_proportions) {
        b2GatewayProportions = scenario.b2_manual_proportions
      }
    } else if (scenario.country_code) {
      // Fallback: resolve from country gateways (equal proportions)
      const { data: countryGateways } = await supabase
        .from('gateways')
        .select('code')
        .eq('country_code', scenario.country_code)
        .eq('is_active', true)
        .order('code')
      if (countryGateways && countryGateways.length > 0) {
        const pct = 1.0 / countryGateways.length
        for (const gw of countryGateways) b2GatewayProportions[gw.code] = pct
      }
    }
  }

  if (!hasExplicitGateways && !isMultiLeg && scenario.country_code) {
    const { data: countryGateways } = await supabase
      .from('gateways')
      .select('code')
      .eq('country_code', scenario.country_code)
      .eq('is_active', true)
      .order('code')
    if (countryGateways && countryGateways.length > 0) {
      const pct = 1.0 / countryGateways.length
      const resolved: Record<string, number> = {}
      for (const gw of countryGateways) resolved[gw.code] = pct
      // Inject as manual proportions so the compute engine picks them up
      scenario = {
        ...scenario,
        b_gateway_mode: countryGateways.length === 1 ? 'single' : 'manual',
        b_single_gateway: countryGateways.length === 1 ? countryGateways[0].code : undefined,
        b_manual_proportions: countryGateways.length === 1 ? undefined : resolved,
      }
    }
  }

  // Mode-specific data
  let vendorBRates: VendorBRate[] = []
  let vendorCRates: VendorCRate[] = []
  let vendorB: Vendor | null = null
  let vendorBCRate: VendorBCRate | null = null
  let vendorB2: Vendor | null = null
  let vendorB2Rates: VendorBRate[] = []
  let vendorB2CRate: VendorBCRate | null = null

  if (pricingMode === 'bcd_combined' && scenario.vendor_bcd_id) {
    // BCD combined: load from vendor_bcd_rates + area mapping
    const { data: bcdRates } = await supabase
      .from('vendor_bcd_rates').select('*')
      .eq('vendor_id', scenario.vendor_bcd_id).is('valid_to', null)
    vendorBCDRates = (bcdRates ?? []) as VendorBCDRate[]
    // Load area → country mapping (shared with D-6)
    if (vendorDLookupAreaCountries.length === 0) {
      const { data: areaCountries } = await supabase
        .from('vendor_d_lookup_area_countries').select('*')
        .eq('vendor_id', scenario.vendor_bcd_id)
      vendorDLookupAreaCountries = (areaCountries ?? []) as VendorDLookupAreaCountry[]
    }
  } else if (pricingMode === 'bc_combined' && scenario.vendor_bc_id) {
    const { data: bcRates } = await supabase
      .from('vendor_bc_rates')
      .select('*')
      .eq('vendor_id', scenario.vendor_bc_id)
      .eq('is_current', true)
      .limit(1)
    vendorBCRate = (bcRates?.[0] as VendorBCRate) ?? null
  } else if (isMultiLeg) {
    // Multi-leg: load B1 (vendor_b) + B2 (vendor_b2) + C (if multi_b)
    // B1 — always segment=B
    if (scenario.vendor_b_id) {
      const [bVendorRes, bRatesRes] = await Promise.all([
        supabase.from('vendors').select('*').eq('id', scenario.vendor_b_id).single(),
        supabase.from('vendor_b_rates').select('*').eq('vendor_id', scenario.vendor_b_id).eq('is_current', true),
      ])
      vendorB = bVendorRes.data as Vendor | null
      vendorBRates = (bRatesRes.data ?? []) as VendorBRate[]
    }
    // B2
    if (scenario.vendor_b2_id) {
      if (pricingMode === 'multi_b') {
        // multi_b: B2 is segment=B, load B rates with b2_service_name filter
        const [b2VendorRes, b2RatesRes] = await Promise.all([
          supabase.from('vendors').select('*').eq('id', scenario.vendor_b2_id).single(),
          supabase.from('vendor_b_rates').select('*').eq('vendor_id', scenario.vendor_b2_id).eq('is_current', true),
        ])
        vendorB2 = b2VendorRes.data as Vendor | null
        vendorB2Rates = (b2RatesRes.data ?? []) as VendorBRate[]
      } else {
        // multi_b_b2c: B2 is segment=BC, load BC rate
        const [b2VendorRes, b2cRatesRes] = await Promise.all([
          supabase.from('vendors').select('*').eq('id', scenario.vendor_b2_id).single(),
          supabase.from('vendor_bc_rates').select('*')
            .eq('vendor_id', scenario.vendor_b2_id).eq('is_current', true).limit(1),
        ])
        vendorB2 = b2VendorRes.data as Vendor | null
        vendorB2CRate = (b2cRatesRes.data?.[0] as VendorBCRate) ?? null
      }
    }
    // C segment: load for multi_b (independent C), skip for multi_b_b2c (included in B2C)
    if (pricingMode === 'multi_b' && scenario.vendor_c_id) {
      const { data } = await supabase
        .from('vendor_c_rates').select('*')
        .eq('vendor_id', scenario.vendor_c_id).eq('is_current', true)
      vendorCRates = (data ?? []) as VendorCRate[]
    }
  } else {
    // Segmented mode
    if (scenario.vendor_b_id) {
      const [bVendorRes, bRatesRes] = await Promise.all([
        supabase.from('vendors').select('*').eq('id', scenario.vendor_b_id).single(),
        supabase.from('vendor_b_rates').select('*').eq('vendor_id', scenario.vendor_b_id).eq('is_current', true),
      ])
      vendorB = bVendorRes.data as Vendor | null
      vendorBRates = (bRatesRes.data ?? []) as VendorBRate[]
    }
    if (scenario.vendor_c_id) {
      const { data } = await supabase
        .from('vendor_c_rates').select('*')
        .eq('vendor_id', scenario.vendor_c_id).eq('is_current', true)
      vendorCRates = (data ?? []) as VendorCRate[]
    }
  }

  return {
    scenario: { ...scenario, exchange_rates: rates },
    pricingMode,
    avgWeightKg,
    vendorBRates,
    vendorCRates,
    vendorB,
    vendorBCRate,
    vendorBCDRates,
    vendorB2,
    vendorB2Rates,
    vendorB2CRate,
    b2GatewayProportions,
    vendorD,
    vendorDRates,
    vendorDTieredRates,
    vendorDLookupRates,
    vendorDLookupAreaCountries,
    dPricingModel,
    lastMileRates,
    carrierProportions,
    zoneDistribution,
    tierDistribution,
  }
}

// ─── Compute costs at given weights using loaded data ────────────────────────

export function computeAtWeights(
  data: ScenarioComputeData,
  weights?: WeightPoint[],
): ScenarioResults {
  const bracketsToUse = weights ?? WEIGHT_BRACKETS as unknown as WeightPoint[]

  const scenarioWithDModel = {
    ...data.scenario,
    d_pricing_model: data.dPricingModel,
  }

  // Shared D segment params
  const dParams = {
    lastMileRates: data.lastMileRates as never[],
    carrierProportions: data.carrierProportions,
    zoneDistribution: data.zoneDistribution,
    tierDistribution: data.tierDistribution,
    vendorDRates: data.vendorDRates as never[],
    vendorDTieredRates: data.vendorDTieredRates,
    vendorDLookupRates: data.vendorDLookupRates,
    vendorDLookupAreaCountries: data.vendorDLookupAreaCountries,
    vendorD: data.vendorD,
  }

  if (data.pricingMode === 'multi_b') {
    return computeScenarioCostMultiB({
      scenario: scenarioWithDModel,
      vendorBRates: data.vendorBRates,
      vendorCRates: data.vendorCRates,
      vendorB: data.vendorB,
      vendorB2: data.vendorB2,
      vendorB2Rates: data.vendorB2Rates,
      b2GatewayProportions: data.b2GatewayProportions,
      ...dParams,
      avgWeightKg: data.avgWeightKg,
      weights: bracketsToUse,
    })
  }

  if (data.pricingMode === 'multi_b_b2c') {
    return computeScenarioCostMultiBB2C({
      scenario: scenarioWithDModel,
      vendorBRates: data.vendorBRates,
      vendorB: data.vendorB,
      vendorB2: data.vendorB2,
      vendorB2CRate: data.vendorB2CRate,
      b2GatewayProportions: data.b2GatewayProportions,
      ...dParams,
      avgWeightKg: data.avgWeightKg,
      weights: bracketsToUse,
    })
  }

  if (data.pricingMode === 'bc_combined' && data.vendorBCRate) {
    return computeScenarioCostBCCombined({
      scenario: scenarioWithDModel,
      vendorBCRate: data.vendorBCRate,
      ...dParams,
      avgWeightKg: data.avgWeightKg,
      weights: bracketsToUse,
    })
  }

  // bcd_combined mode and segmented mode both use computeScenarioCost
  // For bcd_combined, the BCD cost is handled via the lookup_table path in the engine
  return computeScenarioCost({
    scenario: scenarioWithDModel,
    vendorBRates: data.vendorBRates,
    vendorCRates: data.vendorCRates,
    ...dParams,
    avgWeightKg: data.avgWeightKg,
    vendorB: data.vendorB,
    weights: bracketsToUse,
  })
}
