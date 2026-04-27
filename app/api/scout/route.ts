import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_EXCHANGE_RATES } from '@/types'
import type { Vendor, ExchangeRates } from '@/types'
import type { VendorBRate, VendorCRate, VendorBCRate, VendorDRate } from '@/types/vendor'
import type { ScoutInput } from '@/types/pricing-analysis'
import { resolveBCost, resolveCCost, computeFirstAdditionalCost, computeWeightBracketCost } from '@/lib/calculations/scenario'
import { scoutFeasibleCombinations } from '@/lib/calculations/scout'
import type { SegmentCostEntry, ScoutData } from '@/lib/calculations/scout'

export async function POST(request: NextRequest) {
  try {
    const body: ScoutInput = await request.json()
    const { price, price_unit, representative_weight, country_code, min_margin, pricing_mode: requestedMode } = body

    if (!price || !representative_weight || !country_code) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
    }

    const supabase = await createClient()

    // Load exchange rates
    const { data: exRatesRow } = await supabase
      .from('exchange_rates')
      .select('*')
      .eq('is_current', true)
      .limit(1)
      .single()
    const rates: ExchangeRates = exRatesRow ?? DEFAULT_EXCHANGE_RATES

    // Load country to determine pricing mode
    const { data: countryRow } = await supabase
      .from('countries')
      .select('pricing_mode')
      .eq('code', country_code)
      .single()
    const pricingMode = requestedMode ?? countryRow?.pricing_mode ?? 'segmented'

    // Load ALL active vendors for this country (+ GLB for A segment)
    const { data: allVendors } = await supabase
      .from('vendors')
      .select('*')
      .eq('is_active', true)
      .or(`country_code.eq.${country_code},country_code.eq.GLB`)
    const vendors = (allVendors ?? []) as Vendor[]

    const vendorsA = vendors.filter((v) => v.segment === 'A')
    const vendorsB = vendors.filter((v) => v.segment === 'B' && v.country_code === country_code)
    const vendorsC = vendors.filter((v) => v.segment === 'C' && v.country_code === country_code)
    const vendorsD = vendors.filter((v) => v.segment === 'D' && v.country_code === country_code)
    const vendorsBC = vendors.filter((v) => v.segment === 'BC' && v.country_code === country_code)

    const vendorIds = vendors.map((v) => v.id)

    // Bulk load all rates needed
    const [bRatesRes, cRatesRes, bcRatesRes, dRatesRes] = await Promise.all([
      supabase.from('vendor_b_rates').select('*').in('vendor_id', vendorIds).eq('is_current', true),
      supabase.from('vendor_c_rates').select('*').in('vendor_id', vendorIds).eq('is_current', true),
      supabase.from('vendor_bc_rates').select('*').in('vendor_id', vendorIds).eq('is_current', true),
      supabase.from('vendor_d_rates').select('*').in('vendor_id', vendorIds).eq('is_current', true),
    ])

    const allBRates = (bRatesRes.data ?? []) as VendorBRate[]
    const allCRates = (cRatesRes.data ?? []) as VendorCRate[]
    const allBCRates = (bcRatesRes.data ?? []) as VendorBCRate[]
    const allDRates = (dRatesRes.data ?? []) as VendorDRate[]

    const w = representative_weight

    // ─── Compute A segment costs ────────────────────────────────────
    // A segment: load a-rates for each vendor
    const aEntries: SegmentCostEntry[] = []
    for (const v of vendorsA) {
      const { data: aRatesData } = await supabase
        .from('vendor_a_rates')
        .select('*')
        .eq('vendor_id', v.id)
        .eq('is_current', true)
        .limit(1)
      const aRate = aRatesData?.[0]
      if (!aRate) continue
      const pickupRate = aRate.pickup_hkd_per_kg ?? 0
      const sortingRate = aRate.include_sorting ? (aRate.sorting_hkd_per_kg ?? 0) : 0
      aEntries.push({
        vendor: { id: v.id, name: v.name },
        cost: (pickupRate + sortingRate) * w,
      })
    }
    // If no A vendors found, add a zero-cost placeholder
    if (aEntries.length === 0) {
      aEntries.push({ vendor: { id: '', name: '無A段' }, cost: 0 })
    }

    // ─── Compute B segment costs ────────────────────────────────────
    const bEntries: SegmentCostEntry[] = []
    for (const v of vendorsB) {
      const vRates = allBRates.filter((r) => r.vendor_id === v.id)
      if (v.config?.simple_rate) {
        const ratePerKg = (v.config.rate_per_kg as number) ?? 0
        const currency = (v.config.rate_currency as string) ?? 'USD'
        let rateHkd = ratePerKg
        if (currency === 'USD') rateHkd = ratePerKg * rates.usd_hkd
        else if (currency === 'RMB') rateHkd = ratePerKg / rates.hkd_rmb
        bEntries.push({
          vendor: { id: v.id, name: v.name },
          cost: rateHkd * w,
        })
      } else if (vRates.length > 0) {
        // Use first available gateway, estimate with 1000kg/MAWB, bubble 1.1
        const gateways = [...new Set(vRates.map((r) => r.gateway_code))]
        let totalCost = 0
        let gwCount = 0
        for (const gw of gateways) {
          const bCost = resolveBCost(vRates, gw, 1000, rates)
          if (!bCost) continue
          const freight = bCost.rate_per_kg_hkd * w * 1.1
          // Estimate MAWB amortization: assume 200 tickets/MAWB
          const mawbAmortized = bCost.mawb_fixed_hkd / 200
          totalCost += freight + mawbAmortized
          gwCount++
        }
        if (gwCount > 0) {
          bEntries.push({
            vendor: { id: v.id, name: v.name },
            cost: totalCost / gwCount,
          })
        }
      }
    }

    // ─── Compute C segment costs ────────────────────────────────────
    const cEntries: SegmentCostEntry[] = []
    for (const v of vendorsC) {
      const vRates = allCRates.filter((r) => r.vendor_id === v.id)
      if (vRates.length === 0) continue
      // Estimate: use first gateway or no gateway, 200 tickets/MAWB
      const cCost = resolveCCost(vRates, w, '', 200, rates)
      cEntries.push({
        vendor: { id: v.id, name: v.name },
        cost: cCost.per_ticket_hkd,
      })
    }

    // ─── Compute BC segment costs ───────────────────────────────────
    const bcEntries: SegmentCostEntry[] = []
    for (const v of vendorsBC) {
      const vRate = allBCRates.find((r) => r.vendor_id === v.id)
      if (!vRate) continue
      let rateHkd = vRate.rate_per_kg
      let handlingHkd = vRate.handling_fee_per_unit
      if (vRate.currency === 'USD') {
        rateHkd *= rates.usd_hkd
        handlingHkd *= rates.usd_hkd
      } else if (vRate.currency === 'RMB') {
        rateHkd /= rates.hkd_rmb
        handlingHkd /= rates.hkd_rmb
      }
      bcEntries.push({
        vendor: { id: v.id, name: v.name },
        cost: rateHkd * w + handlingHkd,
      })
    }

    // ─── Compute D segment costs ────────────────────────────────────
    const dEntries: SegmentCostEntry[] = []
    for (const v of vendorsD) {
      const dIsSimple = v.config?.simple_rate === true
      if (dIsSimple) {
        const ratePerKg = (v.config?.rate_per_kg as number) ?? 0
        const currency = (v.config?.rate_currency as string) ?? 'USD'
        let rateHkd = ratePerKg
        if (currency === 'USD') rateHkd = ratePerKg * rates.usd_hkd
        else if (currency === 'RMB') rateHkd = ratePerKg / rates.hkd_rmb
        dEntries.push({
          vendor: { id: v.id, name: v.name },
          cost: rateHkd * w,
        })
        continue
      }

      const vDRates = allDRates.filter((r) => r.vendor_id === v.id)
      if (vDRates.length > 0) {
        // Auto-detect model
        const zrc = new Map<string, number>()
        for (const r of vDRates) {
          const z = r.zone ?? 'default'
          zrc.set(z, (zrc.get(z) ?? 0) + 1)
        }
        const isWeightBracket = [...zrc.values()].some((c) => c > 1)

        if (isWeightBracket) {
          const { costHkd } = computeWeightBracketCost(w, vDRates, rates)
          dEntries.push({ vendor: { id: v.id, name: v.name }, cost: costHkd })
        } else {
          const { costHkd } = computeFirstAdditionalCost(w, vDRates, rates)
          dEntries.push({ vendor: { id: v.id, name: v.name }, cost: costHkd })
        }
        continue
      }

      // Zone-based: skip for scout (too complex, needs carrier proportions + last mile rates)
      // Could add in future with bulk load of last_mile_rates
    }

    const scoutData: ScoutData = {
      pricingMode: pricingMode as 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c',
      aEntries,
      bEntries,
      cEntries,
      bcEntries,
      dEntries,
      // multi_b: B2 uses same B vendor pool; multi_b_b2c: B2C uses BC vendor pool
      ...(pricingMode === 'multi_b' && { b2Entries: bEntries }),
      ...(pricingMode === 'multi_b_b2c' && { b2cEntries: bcEntries }),
    }

    const result = scoutFeasibleCombinations(
      scoutData,
      price,
      price_unit,
      representative_weight,
      min_margin ?? 0.15,
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('Scout error:', error)
    return NextResponse.json({ error: '搜索失敗' }, { status: 500 })
  }
}
