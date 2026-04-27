'use client'

import { useState, useMemo } from 'react'
import type { RateCardBracket, ProductType } from '@/types'
import type { BracketCost } from '@/types/scenario'
import { VERIFICATION_WEIGHTS } from '@/types'
import { getMarginColorClass } from '@/lib/utils/margin'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { invalidSegments, isCostValid, type PricingMode } from '@/lib/utils/cost-validation'
import {
  CostTooltip,
  segATooltip,
  segBTooltip,
  segCTooltip,
  segDTooltip,
  scenarioSegATooltip,
  scenarioSegBTooltip,
  scenarioSegCTooltip,
  scenarioSegDTooltip,
  scenarioSegBCTooltip,
  scenarioSegB2Tooltip,
  scenarioSegB2CTooltip,
} from './CostTooltip'

const PAGE_SIZE = 20

function findBracket(weightKg: number, brackets: RateCardBracket[]): RateCardBracket | undefined {
  return brackets.find(
    (b) => weightKg > b.weight_min_kg && weightKg <= b.weight_max_kg
  ) ?? brackets[0]
}

interface VerificationTableProps {
  brackets: RateCardBracket[]
  productType: ProductType
  scenarioCosts?: BracketCost[]
  pricingMode?: PricingMode
}

export function VerificationTable({ brackets, productType, scenarioCosts, pricingMode }: VerificationTableProps) {
  const t = useT()
  const [page, setPage] = useState(0)
  const [showAll, setShowAll] = useState(false)

  const isBCCombined = useMemo(() => {
    if (pricingMode) return pricingMode === 'bc_combined'
    if (!scenarioCosts) return false
    return scenarioCosts.some((c) => c.seg_bc != null && c.detail?.seg_bc != null)
  }, [scenarioCosts, pricingMode])

  const isBCDCombined = pricingMode === 'bcd_combined'

  const isMultiB = useMemo(() => {
    if (pricingMode) return pricingMode === 'multi_b'
    if (!scenarioCosts) return false
    return scenarioCosts.some((c) => c.detail?.seg_b2 != null)
  }, [scenarioCosts, pricingMode])

  const isMultiBB2C = useMemo(() => {
    if (pricingMode) return pricingMode === 'multi_b_b2c'
    if (!scenarioCosts) return false
    return scenarioCosts.some((c) => c.detail?.seg_b2c != null)
  }, [scenarioCosts, pricingMode])

  const isMultiLeg = isMultiB || isMultiBB2C

  const resolvedMode: PricingMode =
    pricingMode ??
    (isBCDCombined ? 'bcd_combined'
      : isMultiBB2C ? 'multi_b_b2c'
      : isMultiB ? 'multi_b'
      : isBCCombined ? 'bc_combined'
      : 'segmented')

  const rows = useMemo(() => {
    return VERIFICATION_WEIGHTS.map((w) => {
      const bracket = findBracket(w.kg, brackets)
      const freightRate = bracket?.freight_rate_hkd_per_kg ?? 0
      const regFee = bracket?.reg_fee_hkd ?? 0
      const revenue = freightRate * w.kg + regFee

      if (scenarioCosts) {
        // Try exact match first (from verification costs pre-computed at this weight)
        const exactMatch = scenarioCosts.find(
          (c) => Math.abs(c.representative_weight_kg - w.kg) < 0.001
        )

        if (exactMatch) {
          const totalCost = exactMatch.cost_hkd
          const margin = revenue > 0 ? (revenue - totalCost) / revenue : 0
          return {
            kg: w.kg,
            ozLb: w.ozLb,
            isOz: w.kg <= 0.45,
            segA: exactMatch.seg_a,
            segB: exactMatch.seg_b,
            segC: exactMatch.seg_c,
            segD: exactMatch.seg_d,
            segBC: exactMatch.seg_bc ?? 0,
            segB2: exactMatch.seg_b2 ?? 0,
            segB2C: exactMatch.seg_b2c ?? 0,
            totalCost,
            detail: exactMatch.detail ?? null,
            freightRate,
            regFee,
            revenue,
            margin,
            isScenarioBased: true,
          }
        }

        // Fallback: bracket-based interpolation (when only 6 representative costs)
        const sc = scenarioCosts.find(
          (c) => w.kg > c.weight_min_kg && w.kg <= c.weight_max_kg
        ) ?? scenarioCosts[0]
        const detail = sc?.detail
        const repW = sc?.representative_weight_kg ?? w.kg

        // A段: additive — per-kg × w × bubble + per-piece flat
        let actualSegA = 0
        if (detail) {
          const segARate = detail.seg_a.pickup_rate + (detail.seg_a.include_sorting ? detail.seg_a.sorting_rate : 0)
          const bubble = detail.seg_a.bubble_ratio ?? 1.0
          const perKg = segARate * w.kg * bubble
          const perPiece = detail.seg_a.per_piece_cost_hkd ?? 0
          actualSegA = perKg + perPiece
        }

        // B段
        let actualSegB = 0
        if (detail && detail.seg_b.gateways.length > 0) {
          for (const gw of detail.seg_b.gateways) {
            const perKgCost = gw.rate_per_kg * w.kg * gw.bubble_rate
            const bPerTicket = perKgCost + gw.mawb_amortized
            actualSegB += bPerTicket * gw.proportion
          }
        } else if (sc && repW > 0 && sc.seg_b > 0) {
          const bPerKg = sc.seg_b / repW
          actualSegB = bPerKg * w.kg
        }

        // C段
        let actualSegC = 0
        if (detail && detail.seg_c.gateways.length > 0) {
          for (const gw of detail.seg_c.gateways) {
            const scaledPerKg = repW > 0 ? (gw.per_kg_cost / repW) * w.kg : 0
            const gwTotal = gw.mawb_amortized + scaledPerKg + gw.per_hawb_cost
            actualSegC += gwTotal * gw.proportion
          }
        }

        // BC段 (combined)
        let actualSegBC = 0
        if (detail?.seg_bc) {
          const bc = detail.seg_bc
          const bcBubble = bc.bubble_ratio ?? 1.0
          const costInCurrency = bc.rate_per_kg * w.kg * bcBubble + bc.handling_fee
          actualSegBC = costInCurrency * bc.exchange_rate_to_hkd
        } else if (sc && (sc.seg_bc ?? 0) > 0 && repW > 0) {
          // Approximate: BC has per-kg + fixed handling. Scale per-kg part, keep handling
          // Since we can't separate them here, do proportional scaling
          actualSegBC = (sc.seg_bc! / repW) * w.kg
        }

        // B2段 (multi_b)
        let actualSegB2 = 0
        if (detail?.seg_b2 && detail.seg_b2.gateways.length > 0) {
          for (const gw of detail.seg_b2.gateways) {
            const perKgCost = gw.rate_per_kg * w.kg * gw.bubble_rate
            const bPerTicket = perKgCost + gw.mawb_amortized
            actualSegB2 += bPerTicket * gw.proportion
          }
        } else if (sc && repW > 0 && (sc.seg_b2 ?? 0) > 0) {
          actualSegB2 = (sc.seg_b2! / repW) * w.kg
        }

        // B2C段 (multi_b_b2c)
        let actualSegB2C = 0
        if (detail?.seg_b2c) {
          const b2c = detail.seg_b2c
          const b2cBubble = b2c.bubble_ratio ?? 1.0
          const costInCurrency = b2c.rate_per_kg * w.kg * b2cBubble + b2c.handling_fee
          actualSegB2C = costInCurrency * b2c.exchange_rate_to_hkd
        } else if (sc && repW > 0 && (sc.seg_b2c ?? 0) > 0) {
          actualSegB2C = (sc.seg_b2c! / repW) * w.kg
        }

        // D段
        let actualSegD = 0
        if (detail && detail.seg_d.gateways.length > 0) {
          // zone_based: scale by weight ratio per gateway
          for (const gw of detail.seg_d.gateways) {
            const scaleFactor = repW > 0 ? w.kg / repW : 1
            const scaledAvgUsd = gw.avg_cost_usd * scaleFactor
            const subtotalHkd = scaledAvgUsd * gw.usd_hkd
            actualSegD += subtotalHkd * gw.proportion
          }
        } else if (detail?.seg_d.pricing_detail) {
          const pd = detail.seg_d.pricing_detail
          if (pd.tiered) {
            // tiered_per_kg: rate_per_kg × actual_weight + registration_fee (fixed)
            const costInCurrency = pd.tiered.rate_per_kg * w.kg + pd.tiered.registration_fee
            actualSegD = costInCurrency * pd.tiered.exchange_rate_to_hkd
          } else if (pd.model === 'first_additional' && pd.zones && pd.zones.length > 0) {
            // first_additional: step function per zone with distribution weights
            for (const z of pd.zones) {
              const fwKg = z.first_weight_kg ?? 1
              const fwPrice = z.first_weight_price ?? 0
              const awKg = z.additional_weight_kg ?? 1
              const awPrice = z.additional_weight_price ?? 0
              let zoneCost: number
              if (w.kg <= fwKg) {
                zoneCost = fwPrice
              } else {
                const additionalUnits = Math.ceil((w.kg - fwKg) / awKg)
                zoneCost = fwPrice + additionalUnits * awPrice
              }
              const costHkd = zoneCost * z.exchange_rate_to_hkd
              const zoneWeight = z.weight ?? (1 / pd.zones.length)
              actualSegD += costHkd * zoneWeight
            }
          } else if (pd.model === 'weight_bracket' && pd.zones && pd.zones.length > 0) {
            // weight_bracket: bracket price per zone, with overflow additional pricing
            for (const z of pd.zones) {
              let zoneCost: number
              if (z.bracket_price != null) {
                if (z.matched_bracket_max != null && w.kg > z.matched_bracket_max && z.additional_weight_kg && z.additional_weight_price) {
                  const excess = w.kg - z.matched_bracket_max
                  const additionalUnits = Math.ceil(excess / z.additional_weight_kg)
                  zoneCost = z.bracket_price + additionalUnits * z.additional_weight_price
                } else {
                  zoneCost = z.bracket_price
                }
              } else {
                zoneCost = z.cost_in_currency
              }
              const costHkd = zoneCost * z.exchange_rate_to_hkd
              const zoneWeight = z.weight ?? (1 / pd.zones.length)
              actualSegD += costHkd * zoneWeight
            }
          } else if (pd.model === 'per_piece' && pd.per_piece_fee != null) {
            // per_piece: fixed fee, no weight scaling
            actualSegD = pd.per_piece_fee * (pd.exchange_rate_to_hkd ?? 1)
          } else if (pd.model === 'simple' && pd.rate_per_kg != null) {
            // simple: rate_per_kg × actual_weight
            actualSegD = pd.rate_per_kg * w.kg * (pd.exchange_rate_to_hkd ?? 1)
          } else if (sc && repW > 0 && sc.seg_d > 0) {
            // lookup_table or unknown: proportional fallback
            actualSegD = (sc.seg_d / repW) * w.kg
          }
        } else if (sc && repW > 0 && sc.seg_d > 0) {
          const dPerKg = sc.seg_d / repW
          actualSegD = dPerKg * w.kg
        }

        const totalCost = actualSegA + actualSegB + actualSegC + actualSegBC + actualSegB2 + actualSegB2C + actualSegD
        const margin = revenue > 0 ? (revenue - totalCost) / revenue : 0

        return {
          kg: w.kg,
          ozLb: w.ozLb,
          isOz: w.kg <= 0.45,
          segA: actualSegA,
          segB: actualSegB,
          segC: actualSegC,
          segD: actualSegD,
          segBC: actualSegBC,
          segB2: actualSegB2,
          segB2C: actualSegB2C,
          totalCost,
          detail: detail ?? null,
          freightRate,
          regFee,
          revenue,
          margin,
          isScenarioBased: true,
        }
      }

      // No scenario costs — return zero breakdown
      return {
        kg: w.kg,
        ozLb: w.ozLb,
        isOz: w.kg <= 0.45,
        segA: 0,
        segB: 0,
        segC: 0,
        segD: 0,
        segBC: 0,
        segB2: 0,
        segB2C: 0,
        totalCost: 0,
        detail: null,
        freightRate,
        regFee,
        revenue,
        margin: 0,
        isScenarioBased: false,
      }
    })
  }, [brackets, scenarioCosts])

  const totalPages = Math.ceil(rows.length / PAGE_SIZE)
  const displayRows = showAll ? rows : rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="space-y-3">
      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 border-b">
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                {t.verification.weight} (KG)
              </th>
              <th className="px-3 py-2.5 text-center font-medium text-muted-foreground whitespace-nowrap">
                OZ/LB
              </th>
              <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">
                {t.segments.a} {t.verification.cost}
              </th>
              {isBCDCombined ? (
                <th className="px-3 py-2.5 text-center font-medium text-teal-500 whitespace-nowrap">
                  {t.segments.bcd} {t.verification.cost}
                </th>
              ) : isBCCombined ? (
                <>
                  <th className="px-3 py-2.5 text-center font-medium text-teal-500 whitespace-nowrap">
                    {t.segments.bc} {t.verification.cost}
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">
                    {t.segments.d} {t.verification.cost}
                  </th>
                </>
              ) : isMultiB ? (
                <>
                  <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">
                    {t.segments.b1} {t.verification.cost}
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium text-sky-500 whitespace-nowrap">
                    {t.segments.b2} {t.verification.cost}
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">
                    {t.segments.c} {t.verification.cost}
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">
                    {t.segments.d} {t.verification.cost}
                  </th>
                </>
              ) : isMultiBB2C ? (
                <>
                  <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">
                    {t.segments.b1} {t.verification.cost}
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium text-teal-500 whitespace-nowrap">
                    {t.segments.b2c} {t.verification.cost}
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">
                    {t.segments.d} {t.verification.cost}
                  </th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">
                    {t.segments.b} {t.verification.cost}
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">
                    {t.segments.c} {t.verification.cost}
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">
                    {t.segments.d} {t.verification.cost}
                  </th>
                </>
              )}
              <th className="px-3 py-2.5 text-center font-medium text-amber-500 whitespace-nowrap">
                {t.common.total} {t.verification.cost}
              </th>
              <th className="px-3 py-2.5 text-center font-medium text-purple-500 whitespace-nowrap">
                {t.verification.freight}
              </th>
              <th className="px-3 py-2.5 text-center font-medium text-purple-500 whitespace-nowrap">
                {t.verification.regFee}
              </th>
              <th className="px-3 py-2.5 text-center font-medium text-emerald-500 whitespace-nowrap">
                {t.verification.revenue}
              </th>
              <th className="px-3 py-2.5 text-center font-medium text-muted-foreground whitespace-nowrap">
                {t.verification.margin}
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => {
              const costs = {
                seg_a: row.segA,
                seg_b: row.segB,
                seg_c: row.segC,
                seg_d: row.segD,
                seg_bc: row.segBC,
                seg_b2: row.segB2,
                seg_b2c: row.segB2C,
              }
              const bad = row.isScenarioBased ? new Set(invalidSegments(costs, resolvedMode)) : new Set<string>()
              const valid = row.isScenarioBased ? isCostValid(costs, resolvedMode) : true
              const flag = (k: string) => bad.has(k) ? 'text-red-500 font-semibold' : ''
              const flagUnderline = (k: string) =>
                bad.has(k)
                  ? 'cursor-help border-b border-dotted border-red-500'
                  : 'cursor-help border-b border-dotted border-muted-foreground/40'
              return (
              <tr
                key={`weight-${row.kg}`}
                className={`border-b last:border-0 hover:bg-muted/30 ${
                  idx % 2 === 1 ? 'bg-muted/10' : ''
                }`}
              >
                {/* 重量 */}
                <td className="px-3 py-1.5 font-mono text-xs font-semibold">
                  {row.kg}
                </td>

                {/* OZ/LB */}
                <td className="px-3 py-1.5 text-center text-muted-foreground font-mono text-xs">
                  {row.ozLb} {row.isOz ? 'oz' : 'lb'}
                </td>

                {/* A段 */}
                <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_a')}`}>
                  <CostTooltip
                    content={row.detail
                      ? scenarioSegATooltip(row.detail.seg_a, row.segA)
                      : segATooltip(row.kg, 0, row.segA)
                    }
                  >
                    <span className={flagUnderline('seg_a')}>
                      {row.segA.toFixed(2)}
                    </span>
                  </CostTooltip>
                </td>

                {isBCDCombined ? (
                  /* BCD 全段 — cost stored in seg_d */
                  <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_d')}`}>
                    <CostTooltip
                      content={row.detail
                        ? scenarioSegDTooltip(row.detail.seg_d, row.segD)
                        : segDTooltip([], 0, 0, row.segD)
                      }
                    >
                      <span className={flagUnderline('seg_d')}>
                        {row.segD.toFixed(2)}
                      </span>
                    </CostTooltip>
                  </td>
                ) : isBCCombined ? (
                  <>
                    {/* BC段 */}
                    <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_bc')}`}>
                      <CostTooltip
                        content={row.detail?.seg_bc
                          ? scenarioSegBCTooltip(row.detail.seg_bc, row.segBC)
                          : <><span className="text-teal-400 font-semibold">{t.segments.bcFull}</span>{'\n'}<span className="text-amber-400">= {row.segBC.toFixed(2)} HKD</span></>
                        }
                      >
                        <span className={flagUnderline('seg_bc')}>
                          {row.segBC.toFixed(2)}
                        </span>
                      </CostTooltip>
                    </td>
                    {/* D段 */}
                    <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_d')}`}>
                      <CostTooltip
                        content={row.detail
                          ? scenarioSegDTooltip(row.detail.seg_d, row.segD)
                          : segDTooltip([], 0, 0, row.segD)
                        }
                      >
                        <span className={flagUnderline('seg_d')}>
                          {row.segD.toFixed(2)}
                        </span>
                      </CostTooltip>
                    </td>
                  </>
                ) : isMultiB ? (
                  <>
                    {/* B1段 */}
                    <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_b')}`}>
                      <CostTooltip
                        content={row.detail
                          ? scenarioSegBTooltip(row.detail.seg_b, row.segB, `${t.segments.b1} ${t.segments.bDesc}`)
                          : segBTooltip(row.kg, 0, row.segB)
                        }
                      >
                        <span className={flagUnderline('seg_b')}>
                          {row.segB.toFixed(2)}
                        </span>
                      </CostTooltip>
                    </td>
                    {/* B2段 */}
                    <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_b2')}`}>
                      <CostTooltip
                        content={row.detail?.seg_b2
                          ? scenarioSegB2Tooltip(row.detail.seg_b2, row.segB2)
                          : <><span className="text-blue-400 font-semibold">{t.segments.b2} {t.segments.bDesc}</span>{'\n'}<span className="text-amber-400">= {row.segB2.toFixed(2)} HKD</span></>
                        }
                      >
                        <span className={flagUnderline('seg_b2')}>
                          {row.segB2.toFixed(2)}
                        </span>
                      </CostTooltip>
                    </td>
                    {/* C段 */}
                    <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_c')}`}>
                      <CostTooltip
                        content={row.detail
                          ? scenarioSegCTooltip(row.detail.seg_c, row.segC)
                          : segCTooltip(0, 0, 0, 0, row.segC)
                        }
                      >
                        <span className={flagUnderline('seg_c')}>
                          {row.segC.toFixed(2)}
                        </span>
                      </CostTooltip>
                    </td>
                    {/* D段 */}
                    <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_d')}`}>
                      <CostTooltip
                        content={row.detail
                          ? scenarioSegDTooltip(row.detail.seg_d, row.segD)
                          : segDTooltip([], 0, 0, row.segD)
                        }
                      >
                        <span className={flagUnderline('seg_d')}>
                          {row.segD.toFixed(2)}
                        </span>
                      </CostTooltip>
                    </td>
                  </>
                ) : isMultiBB2C ? (
                  <>
                    {/* B1段 */}
                    <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_b')}`}>
                      <CostTooltip
                        content={row.detail
                          ? scenarioSegBTooltip(row.detail.seg_b, row.segB, `${t.segments.b1} ${t.segments.bDesc}`)
                          : segBTooltip(row.kg, 0, row.segB)
                        }
                      >
                        <span className={flagUnderline('seg_b')}>
                          {row.segB.toFixed(2)}
                        </span>
                      </CostTooltip>
                    </td>
                    {/* B2C段 */}
                    <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_b2c')}`}>
                      <CostTooltip
                        content={row.detail?.seg_b2c
                          ? scenarioSegB2CTooltip(row.detail.seg_b2c, row.segB2C)
                          : <><span className="text-teal-400 font-semibold">{t.segments.b2c} {t.segments.bcDesc}</span>{'\n'}<span className="text-amber-400">= {row.segB2C.toFixed(2)} HKD</span></>
                        }
                      >
                        <span className={flagUnderline('seg_b2c')}>
                          {row.segB2C.toFixed(2)}
                        </span>
                      </CostTooltip>
                    </td>
                    {/* D段 */}
                    <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_d')}`}>
                      <CostTooltip
                        content={row.detail
                          ? scenarioSegDTooltip(row.detail.seg_d, row.segD)
                          : segDTooltip([], 0, 0, row.segD)
                        }
                      >
                        <span className={flagUnderline('seg_d')}>
                          {row.segD.toFixed(2)}
                        </span>
                      </CostTooltip>
                    </td>
                  </>
                ) : (
                  <>
                    {/* B段 */}
                    <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_b')}`}>
                      <CostTooltip
                        content={row.detail
                          ? scenarioSegBTooltip(row.detail.seg_b, row.segB)
                          : segBTooltip(row.kg, 0, row.segB)
                        }
                      >
                        <span className={flagUnderline('seg_b')}>
                          {row.segB.toFixed(2)}
                        </span>
                      </CostTooltip>
                    </td>
                    {/* C段 */}
                    <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_c')}`}>
                      <CostTooltip
                        content={row.detail
                          ? scenarioSegCTooltip(row.detail.seg_c, row.segC)
                          : segCTooltip(0, 0, 0, 0, row.segC)
                        }
                      >
                        <span className={flagUnderline('seg_c')}>
                          {row.segC.toFixed(2)}
                        </span>
                      </CostTooltip>
                    </td>
                    {/* D段 */}
                    <td className={`px-3 py-1.5 text-center font-mono text-xs ${flag('seg_d')}`}>
                      <CostTooltip
                        content={row.detail
                          ? scenarioSegDTooltip(row.detail.seg_d, row.segD)
                          : segDTooltip([], 0, 0, row.segD)
                        }
                      >
                        <span className={flagUnderline('seg_d')}>
                          {row.segD.toFixed(2)}
                        </span>
                      </CostTooltip>
                    </td>
                  </>
                )}

                {/* 總淨成本 */}
                <td className={`px-3 py-1.5 text-center font-mono text-xs font-semibold ${valid ? 'text-amber-600' : 'text-red-500'}`}>
                  {valid ? row.totalCost.toFixed(2) : '計算錯誤'}
                </td>

                {/* 定價運費 */}
                <td className="px-3 py-1.5 text-center font-mono text-xs text-purple-600">
                  {row.freightRate.toFixed(1)}
                </td>

                {/* 定價掛號 */}
                <td className="px-3 py-1.5 text-center font-mono text-xs text-purple-600">
                  {row.regFee.toFixed(0)}
                </td>

                {/* 運費 */}
                <td className="px-3 py-1.5 text-center font-mono text-xs font-semibold text-emerald-600">
                  {row.revenue.toFixed(2)}
                </td>

                {/* 毛利 */}
                <td className="px-3 py-1.5 text-center">
                  {valid ? (
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${getMarginColorClass(
                        row.margin
                      )}`}
                    >
                      {(row.margin * 100).toFixed(1)}%
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-mono text-red-500 font-semibold">
                      —
                    </span>
                  )}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {!showAll && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ← {t.common.back}
              </Button>
              <span className="text-muted-foreground">
                {page + 1} / {totalPages}（{rows.length} {t.common.records}）
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                {t.common.next} →
              </Button>
            </>
          )}
          {showAll && (
            <span className="text-muted-foreground">{t.common.all} {rows.length} {t.common.records}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowAll((v) => !v)
            setPage(0)
          }}
          className="text-blue-500"
        >
          {showAll ? t.common.close : t.common.all}
        </Button>
      </div>
    </div>
  )
}
