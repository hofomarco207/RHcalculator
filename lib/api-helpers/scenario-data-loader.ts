/**
 * Shared scenario data loader — RH fork (bc_combined only).
 */

import { createAdminClient } from '@/lib/supabase/server'
import { computeScenarioCostBCCombined } from '@/lib/calculations/scenario'
import type { Scenario, ScenarioResults } from '@/types/scenario'
import type { WeightPoint, Vendor } from '@/types'
import { DEFAULT_EXCHANGE_RATES, WEIGHT_BRACKETS } from '@/types'
import type { VendorBCRate, VendorDRate, VendorDTieredRate, VendorDLookupRate, VendorDLookupAreaCountry } from '@/types/vendor'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScenarioComputeData {
  scenario: Scenario
  pricingMode: 'bc_combined'
  avgWeightKg: number
  vendorBCRate: VendorBCRate | null
  vendorD: Vendor | null
  vendorDRates: VendorDRate[]
  vendorDTieredRates: VendorDTieredRate[]
  vendorDLookupRates: VendorDLookupRate[]
  vendorDLookupAreaCountries: VendorDLookupAreaCountry[]
  dPricingModel: 'first_additional' | 'weight_bracket' | 'simple' | 'per_piece' | 'tiered_per_kg' | 'lookup_table'
}

// ─── Load scenario from DB by ID ────────────────────────────────────────────

export async function loadScenarioById(scenarioId: string): Promise<Scenario | null> {
  const supabase = createAdminClient()
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
  const scenario = scenarioInput
  const supabase = createAdminClient()
  const baseRates = scenario.exchange_rates ?? DEFAULT_EXCHANGE_RATES
  const rates = { ...baseRates, jpy_hkd: baseRates.jpy_hkd ?? DEFAULT_EXCHANGE_RATES.jpy_hkd }

  const weeklyTickets = scenario.weekly_tickets ?? 1000
  const weeklyKg = (scenario as unknown as Record<string, unknown>).weekly_kg as number | null | undefined
  const avgWeightKg = (weeklyKg && weeklyTickets > 0) ? weeklyKg / weeklyTickets : 1.2

  // Load BC vendor rate
  let vendorBCRate: VendorBCRate | null = null
  if (scenario.vendor_bc_id) {
    const { data: bcRates } = await supabase
      .from('vendor_bc_rates')
      .select('*')
      .eq('vendor_id', scenario.vendor_bc_id)
      .eq('is_current', true)
      .limit(1)
    vendorBCRate = (bcRates?.[0] as VendorBCRate) ?? null
  }

  // Load D segment data
  let vendorD: Vendor | null = null
  let vendorDRates: VendorDRate[] = []
  let vendorDTieredRates: VendorDTieredRate[] = []
  let vendorDLookupRates: VendorDLookupRate[] = []
  let vendorDLookupAreaCountries: VendorDLookupAreaCountry[] = []
  let dPricingModel: ScenarioComputeData['dPricingModel'] = scenario.d_pricing_model ?? 'first_additional'

  // D-segment source: competitor rate card group takes priority over vendor_d_id
  const sc = scenario as unknown as Record<string, unknown>
  const dCompetitorName = sc.d_competitor_name as string | null | undefined
  const dServiceCode = sc.d_service_code as string | null | undefined

  if (dCompetitorName && dServiceCode) {
    // Use competitor rate card brackets as D-segment tiered rates
    dPricingModel = 'tiered_per_kg'
    const { data: competitorCards } = await supabase
      .from('competitor_rate_cards')
      .select('country_code, country_name_en, brackets')
      .eq('competitor_name', dCompetitorName)
      .eq('service_code', dServiceCode)
      .eq('is_current', true)

    // Convert competitor card brackets → VendorDTieredRate[] format
    vendorDTieredRates = (competitorCards ?? []).flatMap((card) => {
      const c = card as {
        country_code: string | null
        country_name_en: string
        brackets: Array<{ weight_min: number; weight_max: number; rate_per_kg: number; reg_fee: number }>
      }
      // Use country_code when available; fall back to country_name_en as identifier
      const countryId = c.country_code ?? c.country_name_en
      if (!countryId) return []
      return (c.brackets ?? []).map((b) => ({
        id: '',
        vendor_id: '',
        country_code: countryId,
        country_name: c.country_name_en,
        weight_min_kg: b.weight_min,
        weight_max_kg: b.weight_max,
        rate_per_kg: b.rate_per_kg,
        registration_fee: b.reg_fee ?? 0,
        currency: 'HKD',
        version: 1,
        is_current: true,
        source: 'competitor_card',
      })) as unknown as VendorDTieredRate[]
    })
  } else {
    const dVendorId = scenario.vendor_d_id
    if (dVendorId) {
      const { data } = await supabase.from('vendors').select('*').eq('id', dVendorId).single()
      vendorD = data as Vendor | null

      const dIsPerPiece = vendorD?.config?.per_piece === true
      const dIsSimple = vendorD?.config?.simple_rate === true

      if (dIsPerPiece) {
        dPricingModel = 'per_piece'
      } else if (dIsSimple) {
        dPricingModel = 'simple'
      } else {
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
          const { data: tieredRates } = await supabase
            .from('vendor_d_tiered_rates').select('*')
            .eq('vendor_id', dVendorId).is('valid_to', null)
          if (tieredRates && tieredRates.length > 0) {
            dPricingModel = 'tiered_per_kg'
            vendorDTieredRates = tieredRates as VendorDTieredRate[]
          } else {
            const { data: lookupRates } = await supabase
              .from('vendor_d_lookup_rates').select('*')
              .eq('vendor_id', dVendorId).is('valid_to', null)
            if (lookupRates && lookupRates.length > 0) {
              dPricingModel = 'lookup_table'
              vendorDLookupRates = lookupRates as VendorDLookupRate[]
              const { data: areaCountries } = await supabase
                .from('vendor_d_lookup_area_countries').select('*')
                .eq('vendor_id', dVendorId)
              vendorDLookupAreaCountries = (areaCountries ?? []) as VendorDLookupAreaCountry[]
            }
          }
        }
      }
    }
  }

  return {
    scenario: { ...scenario, exchange_rates: rates },
    pricingMode: 'bc_combined',
    avgWeightKg,
    vendorBCRate,
    vendorD,
    vendorDRates,
    vendorDTieredRates,
    vendorDLookupRates,
    vendorDLookupAreaCountries,
    dPricingModel,
  }
}

// ─── Compute costs at given weights using loaded data ────────────────────────

export function computeAtWeights(
  data: ScenarioComputeData,
  weights?: WeightPoint[],
  countryCode?: string,
): ScenarioResults {
  if (!data.vendorBCRate) {
    throw new Error('BC vendor rate is required for bc_combined mode')
  }

  return computeScenarioCostBCCombined({
    scenario: { ...data.scenario, d_pricing_model: data.dPricingModel },
    vendorBCRate: data.vendorBCRate,
    countryCode,
    tierDistribution: undefined,
    vendorDRates: data.vendorDRates,
    vendorDTieredRates: data.vendorDTieredRates,
    vendorDLookupRates: data.vendorDLookupRates,
    vendorDLookupAreaCountries: data.vendorDLookupAreaCountries,
    vendorD: data.vendorD,
    avgWeightKg: data.avgWeightKg,
    weights: weights ?? WEIGHT_BRACKETS as unknown as WeightPoint[],
  })
}

/**
 * Convert a country's D-segment tiered rate brackets into representative weight points.
 * Falls back to WEIGHT_BRACKETS if no tiered rates exist for the country.
 */
export function getCountryWeightPoints(
  tieredRates: VendorDTieredRate[],
  countryCode: string,
): WeightPoint[] {
  const rates = tieredRates
    .filter((r) => r.country_code === countryCode)
    .sort((a, b) => a.weight_min_kg - b.weight_min_kg)

  if (rates.length === 0) return WEIGHT_BRACKETS as unknown as WeightPoint[]

  return rates.map((r) => {
    const capMax = Math.min(r.weight_max_kg, r.weight_min_kg + 5)
    const representative =
      r.weight_min_kg === 0
        ? Math.min(0.1, r.weight_max_kg / 2)
        : (r.weight_min_kg + capMax) / 2
    return {
      range: `${r.weight_min_kg}-${r.weight_max_kg}kg`,
      min: r.weight_min_kg,
      max: r.weight_max_kg,
      representative,
    }
  })
}
