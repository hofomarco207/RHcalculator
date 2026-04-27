'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { VolumeCurveChart } from '@/components/scenarios/VolumeCurveChart'
import { ScenarioCostVerificationTable } from '@/components/scenarios/ScenarioCostVerificationTable'
import { useT } from '@/lib/i18n'
import type { ScenarioResults, BracketCost, BracketDetail } from '@/types/scenario'
import type { VolumeCurveData } from '@/lib/calculations/volume'

interface ExtendedResults extends ScenarioResults {
  volume_curve?: VolumeCurveData
}

type PricingMode = 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c'

interface ResultsPanelProps {
  results: ExtendedResults | null
  loading: boolean
  weeklyTickets?: number
  isPreview?: boolean
  pricingMode?: PricingMode
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals)
}

// ─── Concept F: Assumptions Banner ──────────────────────────────────────────

function AssumptionsBanner({
  results,
  weeklyTickets,
}: {
  results: ExtendedResults
  weeklyTickets: number
}) {
  const t = useT()
  const assumptions = results.assumptions
  const { volume_analysis, gateway_allocation } = results

  const avgWeight = assumptions?.avg_weight_kg
  const isDefaultWeight = avgWeight === 1.2
  const bubbleRate = assumptions?.bubble_rate
  const gatewayMode = assumptions?.gateway_mode
  const exchangeRates = assumptions?.exchange_rates

  // Build tier info from mawb_breakdown
  const tierEntries = Object.entries(volume_analysis.mawb_breakdown)

  const gatewayLabel = Object.entries(gateway_allocation)
    .filter(([, p]) => p > 0)
    .map(([gw, p]) => `${gw} ${Math.round(p * 100)}%`)
    .join(', ')

  return (
    <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
      <p className="text-xs font-medium text-blue-700 mb-2">{t.resultsPanel.assumptions}</p>
      <div className="flex flex-wrap gap-2">
        <Pill label={t.resultsPanel.weeklyTickets} value={`${weeklyTickets.toLocaleString()} ${t.resultsPanel.tickets}`} />
        <Pill
          label={t.resultsPanel.avgWeight}
          value={avgWeight != null ? `${avgWeight} kg` : '—'}
          warning={isDefaultWeight}
          warningText={t.resultsPanel.defaultWeightWarning}
        />
        <Pill label={t.resultsPanel.gatewayAllocation} value={gatewayLabel || '—'} />
        {bubbleRate != null && (
          <Pill label={t.resultsPanel.bubbleRate} value={`${bubbleRate}`} />
        )}
        {tierEntries.map(([gw, info]) => (
          <Pill
            key={gw}
            label={`${gw} ${t.resultsPanel.rateTier}`}
            value={info.tier}
          />
        ))}
        {exchangeRates && (
          <>
            <Pill label="USD/HKD" value={fmt(exchangeRates.usd_hkd, 4)} />
            <Pill label="HKD/RMB" value={fmt(exchangeRates.hkd_rmb, 4)} />
          </>
        )}
        {gatewayMode && (
          <Pill
            label={t.resultsPanel.allocationMode}
            value={gatewayMode === 'optimized' ? t.resultsPanel.optimizedMode : gatewayMode === 'single' ? t.resultsPanel.singleMode : t.resultsPanel.manualMode}
          />
        )}
      </div>
    </div>
  )
}

function Pill({
  label,
  value,
  warning,
  warningText,
}: {
  label: string
  value: string
  warning?: boolean
  warningText?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        warning
          ? 'bg-amber-100 text-amber-800 border border-amber-300'
          : 'bg-white text-blue-800 border border-blue-200'
      }`}
      title={warning ? warningText : undefined}
    >
      <span className="text-blue-500 font-normal">{label}:</span>
      <span className="font-mono">{value}</span>
      {warning && <span className="text-amber-600">&#9888;</span>}
    </span>
  )
}

// ─── Concept C: Summary Cards with Hover Tooltips ────────────────────────────

function HoverSummaryCard({
  title,
  value,
  tooltipContent,
}: {
  title: string
  value: string
  tooltipContent?: React.ReactNode
}) {
  return (
    <div className="group relative">
      <Card className="transition-shadow hover:shadow-md cursor-default">
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-sm font-semibold mt-0.5 truncate">{value}</p>
        </CardContent>
      </Card>
      {tooltipContent && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 hidden group-hover:block">
          <div className="rounded-lg bg-gray-900 text-white p-3 text-xs shadow-xl">
            {tooltipContent}
          </div>
        </div>
      )}
    </div>
  )
}

function AvgCostTooltip({ brackets }: { brackets: BracketCost[] }) {
  const t = useT()
  return (
    <div className="space-y-1">
      <p className="font-medium text-gray-300 mb-1.5">{t.resultsPanel.costPerBracket}</p>
      {brackets.map((b) => (
        <div key={b.weight_range} className="flex justify-between gap-4">
          <span className="text-gray-400">{b.weight_range}</span>
          <span className="font-mono">{fmt(b.cost_hkd)} HKD</span>
        </div>
      ))}
      <div className="border-t border-gray-700 mt-1.5 pt-1.5 flex justify-between gap-4">
        <span className="text-gray-400">{t.resultsPanel.weightedAvg}</span>
        <span className="font-mono font-semibold">
          {fmt(brackets.reduce((s, b) => s + b.cost_hkd, 0) / (brackets.length || 1))} HKD
        </span>
      </div>
    </div>
  )
}

function GatewayTooltip({
  mawbBreakdown,
  gatewayAllocation,
}: {
  mawbBreakdown: Record<string, { tickets_per_mawb: number; kg_per_mawb: number; tier: string }>
  gatewayAllocation: Record<string, number>
}) {
  const t = useT()
  const entries = Object.entries(mawbBreakdown)
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-gray-300 mb-1">{t.resultsPanel.gatewayDetail}</p>
      {entries.map(([gw, info]) => (
        <div key={gw} className="space-y-0.5">
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">{gw}</span>
            <span className="font-mono">{Math.round((gatewayAllocation[gw] || 0) * 100)}%</span>
          </div>
          <div className="ml-2 text-gray-500 space-y-0.5">
            <div className="flex justify-between gap-4">
              <span>{t.resultsPanel.perFlightKg}</span>
              <span className="font-mono">{fmt(info.kg_per_mawb, 0)} kg</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>{t.resultsPanel.perFlightTickets}</span>
              <span className="font-mono">{info.tickets_per_mawb} {t.resultsPanel.tickets}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>{t.resultsPanel.matchedTier}</span>
              <span className="font-mono">{info.tier}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TierTooltip({
  mawbBreakdown,
  weeklyTickets,
  avgWeightKg,
}: {
  mawbBreakdown: Record<string, { tickets_per_mawb: number; kg_per_mawb: number; tier: string }>
  weeklyTickets: number
  avgWeightKg?: number
}) {
  const t = useT()
  const entries = Object.entries(mawbBreakdown)
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-gray-300 mb-1">{t.resultsPanel.tierMatchLogic}</p>
      <div className="text-gray-400 space-y-0.5">
        <div>{t.resultsPanel.weeklyTickets}: <span className="font-mono text-white">{weeklyTickets.toLocaleString()}</span></div>
        {avgWeightKg != null && (
          <div>{t.resultsPanel.avgWeight}: <span className="font-mono text-white">{avgWeightKg} kg</span></div>
        )}
      </div>
      {entries.map(([gw, info]) => (
        <div key={gw} className="border-t border-gray-700 pt-1 mt-1">
          <div className="text-gray-400">{gw}:</div>
          <div className="ml-2 text-gray-500">
            {t.resultsPanel.perFlightKg} = <span className="font-mono text-white">{fmt(info.kg_per_mawb, 0)}</span>
            {' → '} {t.resultsPanel.rateTier} = <span className="font-mono text-amber-300">{info.tier}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function FixedFeeTooltip({ brackets }: { brackets: BracketCost[] }) {
  const t = useT()
  // Show B-segment fixed fee amortization from first bracket that has detail
  const sampleBracket = brackets.find((b) => b.detail?.seg_b)
  if (!sampleBracket?.detail) {
    return (
      <div className="text-gray-400">
        {t.resultsPanel.noDetailData}
      </div>
    )
  }
  const { seg_b } = sampleBracket.detail
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-gray-300 mb-1">
        {t.resultsPanel.bFixedFeeAmort} ({sampleBracket.weight_range}):
      </p>
      {seg_b.gateways.map((gw) => (
        <div key={gw.gateway} className="space-y-0.5">
          <div className="text-gray-400">{gw.gateway} ({Math.round(gw.proportion * 100)}%):</div>
          <div className="ml-2 text-gray-500">
            <div>{t.resultsPanel.fixedFeeTotal}: <span className="font-mono text-white">{fmt(gw.mawb_fixed_total)} HKD</span></div>
            <div>{t.resultsPanel.detailPerFlightTickets}: <span className="font-mono text-white">{gw.tickets_per_mawb}</span></div>
            <div>{t.resultsPanel.amortPerTicket}: <span className="font-mono text-amber-300">{fmt(gw.mawb_amortized)} HKD</span></div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Concept B: Expandable Row Detail ────────────────────────────────────────

function ExpandedDetail({ detail, repWeight, segBTotal = 0, segCTotal = 0, segDTotal = 0 }: { detail: BracketDetail; repWeight: number; segBTotal?: number; segCTotal?: number; segDTotal?: number }) {
  const t = useT()
  const hasBC = !!detail.seg_bc && !detail.seg_b2 && !detail.seg_b2c
  const hasB2 = !!detail.seg_b2
  const hasB2C = !!detail.seg_b2c

  // Helper for B-segment gateway detail (reused for B1 and B2)
  function BSegmentDetail({ gateways, label, colorBorder, colorBg, colorTitle, colorAccent }: {
    gateways: BracketDetail['seg_b']['gateways']
    label: string
    colorBorder: string
    colorBg: string
    colorTitle: string
    colorAccent: string
  }) {
    return (
      <div className={`rounded-lg border-2 ${colorBorder} ${colorBg} p-3`}>
        <p className={`text-xs font-semibold ${colorTitle} mb-2`}>{label}</p>
        <div className="space-y-2 text-xs">
          {gateways.length > 0 ? (
            gateways.map((gw) => (
              <div key={gw.gateway} className="space-y-1">
                <p className={`font-medium ${colorAccent}`}>
                  {gw.gateway} ({Math.round(gw.proportion * 100)}%) — {gw.tier_label}
                </p>
                <DetailRow label={t.resultsPanel.detailRate} value={`${fmt(gw.rate_per_kg)} HKD/kg`} />
                <DetailRow label={t.resultsPanel.detailBubbleRate} value={`${gw.bubble_rate}`} />
                <DetailRow label={t.resultsPanel.detailFreight} value={`${fmt(gw.freight_cost)} HKD`} />
                <DetailRow label={t.resultsPanel.detailMawbFixed} value={`${fmt(gw.mawb_fixed_total)} HKD`} />
                <DetailRow label={t.resultsPanel.detailPerFlightTickets} value={`${gw.tickets_per_mawb}`} />
                <DetailRow label={t.resultsPanel.detailAmortPerTicket} value={`${fmt(gw.mawb_amortized)} HKD`} />
                <div className={`border-t ${colorBorder} pt-1`}>
                  <DetailRow label={t.resultsPanel.detailSubtotal} value={`${fmt(gw.subtotal)} HKD`} bold />
                </div>
              </div>
            ))
          ) : (
            <div className="space-y-1">
              <DetailRow label={t.resultsPanel.detailMode} value={t.resultsPanel.detailSimpleRate} />
              <DetailRow label={t.resultsPanel.detailWeight} value={`${fmt(repWeight, 3)} kg`} />
              <div className={`border-t ${colorBorder} pt-1 mt-1`}>
                <DetailRow label={t.resultsPanel.detailSubtotal} value={`${fmt(segBTotal)} HKD`} bold />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Determine grid columns
  const gridCols = hasBC ? 'sm:grid-cols-2'
    : hasB2 ? 'sm:grid-cols-2 lg:grid-cols-5'
    : hasB2C ? 'sm:grid-cols-2 lg:grid-cols-4'
    : 'sm:grid-cols-2 lg:grid-cols-4'

  return (
    <div className={`grid grid-cols-1 ${gridCols} gap-3 p-3`}>
      {/* A段 — additive: per-kg × weight × bubble + per-piece flat */}
      <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-3">
        <p className="text-xs font-semibold text-blue-700 mb-2">{t.resultsPanel.segAPickup}</p>
        <div className="space-y-1 text-xs">
          {(detail.seg_a.pickup_rate > 0 || detail.seg_a.sorting_rate > 0) && (
            <>
              <DetailRow label={t.resultsPanel.detailPickupRate} value={`${fmt(detail.seg_a.pickup_rate)} HKD/kg`} />
              {detail.seg_a.include_sorting && (
                <DetailRow label={t.resultsPanel.detailSortingRate} value={`${fmt(detail.seg_a.sorting_rate)} HKD/kg`} />
              )}
              <DetailRow label={t.resultsPanel.detailRepWeight} value={`${fmt(detail.seg_a.weight_kg, 3)} kg`} />
              {(detail.seg_a.bubble_ratio ?? 1) !== 1 && (
                <DetailRow label="拋率" value={fmt(detail.seg_a.bubble_ratio ?? 1, 3)} />
              )}
            </>
          )}
          {(detail.seg_a.per_piece_fee ?? 0) > 0 && (
            <>
              <DetailRow label={t.resultsPanel.detailPerPieceFee} value={`${detail.seg_a.per_piece_fee} ${detail.seg_a.per_piece_currency ?? 'HKD'}`} />
              {(detail.seg_a.per_piece_currency ?? 'HKD') !== 'HKD' && (
                <DetailRow label={t.resultsPanel.detailExRate} value={fmt(detail.seg_a.exchange_rate ?? 1, 4)} />
              )}
            </>
          )}
          <div className="border-t border-blue-200 pt-1 mt-1">
            <DetailRow
              label={t.resultsPanel.detailSubtotal}
              value={`${fmt(detail.seg_a.cost_hkd ?? 0)} HKD`}
              bold
            />
          </div>
        </div>
      </div>

      {hasBC ? (
        /* BC 空運+清關 */
        <div className="rounded-lg border-2 border-teal-200 bg-teal-50 p-3">
          <p className="text-xs font-semibold text-teal-700 mb-2">{t.resultsPanel.segBCAirCustoms}</p>
          <div className="space-y-1 text-xs">
            <DetailRow label={t.resultsPanel.detailRatePerKg} value={`${fmt(detail.seg_bc!.rate_per_kg)} ${detail.seg_bc!.currency}`} />
            {detail.seg_bc!.handling_fee > 0 && (
              <DetailRow label={t.resultsPanel.detailHandlingFee} value={`${fmt(detail.seg_bc!.handling_fee)} ${detail.seg_bc!.currency}`} />
            )}
            <DetailRow label={t.resultsPanel.detailWeight} value={`${fmt(detail.seg_bc!.weight_kg, 3)} kg`} />
            <DetailRow label={t.resultsPanel.detailOrigCurrCost} value={`${fmt(detail.seg_bc!.cost_in_currency)} ${detail.seg_bc!.currency}`} />
            {detail.seg_bc!.currency !== 'HKD' && (
              <DetailRow label={t.resultsPanel.detailExRateToHkd} value={`${fmt(detail.seg_bc!.exchange_rate_to_hkd, 4)}`} />
            )}
            <div className="border-t border-teal-200 pt-1 mt-1">
              <DetailRow
                label={t.resultsPanel.detailSubtotal}
                value={`${fmt(detail.seg_bc!.cost_in_currency * detail.seg_bc!.exchange_rate_to_hkd)} HKD`}
                bold
              />
            </div>
          </div>
        </div>
      ) : hasB2 ? (
        <>
          {/* B1段 */}
          <BSegmentDetail
            gateways={detail.seg_b.gateways}
            label={t.resultsPanel.segB1Air}
            colorBorder="border-blue-200"
            colorBg="bg-blue-50"
            colorTitle="text-blue-700"
            colorAccent="text-blue-600"
          />
          {/* B2段 */}
          <BSegmentDetail
            gateways={detail.seg_b2!.gateways}
            label={t.resultsPanel.segB2Air}
            colorBorder="border-sky-200"
            colorBg="bg-sky-50"
            colorTitle="text-sky-700"
            colorAccent="text-sky-600"
          />
          {/* C段 */}
          <div className="rounded-lg border-2 border-purple-200 bg-purple-50 p-3">
            <p className="text-xs font-semibold text-purple-700 mb-2">{t.resultsPanel.segCCustoms}</p>
            <div className="space-y-2 text-xs">
              {detail.seg_c.gateways.length > 0 ? (
                detail.seg_c.gateways.map((gw) => (
                  <div key={gw.gateway} className="space-y-1">
                    <p className="font-medium text-purple-600">
                      {gw.gateway} ({Math.round(gw.proportion * 100)}%)
                    </p>
                    <DetailRow label={t.resultsPanel.detailMawbAmort} value={`${fmt(gw.mawb_amortized)} HKD`} />
                    <DetailRow label={t.resultsPanel.detailPerKgFee} value={`${fmt(gw.per_kg_cost)} HKD`} />
                    <DetailRow label={t.resultsPanel.detailPerHawbFee} value={`${fmt(gw.per_hawb_cost)} HKD`} />
                    <div className="border-t border-purple-200 pt-1">
                      <DetailRow label={t.resultsPanel.detailSubtotal} value={`${fmt(gw.subtotal)} HKD`} bold />
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-1">
                  <p className="text-muted-foreground">{t.resultsPanel.noGatewayDetail}</p>
                  <div className="border-t border-purple-200 pt-1 mt-1">
                    <DetailRow label={t.resultsPanel.detailSubtotal} value={`${fmt(segCTotal)} HKD`} bold />
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* D段 */}
          <DSegmentPanel detail={detail} repWeight={repWeight} segDTotal={segDTotal} />
        </>
      ) : hasB2C ? (
        <>
          {/* B1段 */}
          <BSegmentDetail
            gateways={detail.seg_b.gateways}
            label={t.resultsPanel.segB1Air}
            colorBorder="border-blue-200"
            colorBg="bg-blue-50"
            colorTitle="text-blue-700"
            colorAccent="text-blue-600"
          />
          {/* B2C段 */}
          <div className="rounded-lg border-2 border-teal-200 bg-teal-50 p-3">
            <p className="text-xs font-semibold text-teal-700 mb-2">{t.resultsPanel.segB2CAirCustoms}</p>
            <div className="space-y-1 text-xs">
              {detail.seg_b2c!.vendor_name && (
                <DetailRow label={t.resultsPanel.detailVendor} value={detail.seg_b2c!.vendor_name} />
              )}
              <DetailRow label={t.resultsPanel.detailRatePerKg} value={`${fmt(detail.seg_b2c!.rate_per_kg)} ${detail.seg_b2c!.currency}`} />
              {detail.seg_b2c!.handling_fee > 0 && (
                <DetailRow label={t.resultsPanel.detailHandlingFee} value={`${fmt(detail.seg_b2c!.handling_fee)} ${detail.seg_b2c!.currency}`} />
              )}
              <DetailRow label={t.resultsPanel.detailWeight} value={`${fmt(detail.seg_b2c!.weight_kg, 3)} kg`} />
              <DetailRow label={t.resultsPanel.detailOrigCurrCost} value={`${fmt(detail.seg_b2c!.cost_in_currency)} ${detail.seg_b2c!.currency}`} />
              {detail.seg_b2c!.currency !== 'HKD' && (
                <DetailRow label={t.resultsPanel.detailExRateToHkd} value={`${fmt(detail.seg_b2c!.exchange_rate_to_hkd, 4)}`} />
              )}
              <div className="border-t border-teal-200 pt-1 mt-1">
                <DetailRow
                  label={t.resultsPanel.detailSubtotal}
                  value={`${fmt(detail.seg_b2c!.cost_in_currency * detail.seg_b2c!.exchange_rate_to_hkd)} HKD`}
                  bold
                />
              </div>
            </div>
          </div>
          {/* D段 */}
          <DSegmentPanel detail={detail} repWeight={repWeight} segDTotal={segDTotal} />
        </>
      ) : (
        <>
          {/* B段 */}
          <BSegmentDetail
            gateways={detail.seg_b.gateways}
            label={t.resultsPanel.segBAir}
            colorBorder="border-orange-200"
            colorBg="bg-orange-50"
            colorTitle="text-orange-700"
            colorAccent="text-orange-600"
          />

          {/* C段 */}
          <div className="rounded-lg border-2 border-purple-200 bg-purple-50 p-3">
            <p className="text-xs font-semibold text-purple-700 mb-2">{t.resultsPanel.segCCustoms}</p>
            <div className="space-y-2 text-xs">
              {detail.seg_c.gateways.length > 0 ? (
                detail.seg_c.gateways.map((gw) => (
                  <div key={gw.gateway} className="space-y-1">
                    <p className="font-medium text-purple-600">
                      {gw.gateway} ({Math.round(gw.proportion * 100)}%)
                    </p>
                    <DetailRow label={t.resultsPanel.detailMawbAmort} value={`${fmt(gw.mawb_amortized)} HKD`} />
                    <DetailRow label={t.resultsPanel.detailPerKgFee} value={`${fmt(gw.per_kg_cost)} HKD`} />
                    <DetailRow label={t.resultsPanel.detailPerHawbFee} value={`${fmt(gw.per_hawb_cost)} HKD`} />
                    <div className="border-t border-purple-200 pt-1">
                      <DetailRow label={t.resultsPanel.detailSubtotal} value={`${fmt(gw.subtotal)} HKD`} bold />
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-1">
                  <p className="text-muted-foreground">{t.resultsPanel.noGatewayDetail}</p>
                  <div className="border-t border-purple-200 pt-1 mt-1">
                    <DetailRow label={t.resultsPanel.detailSubtotal} value={`${fmt(segCTotal)} HKD`} bold />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* D段 */}
          <DSegmentPanel detail={detail} repWeight={repWeight} segDTotal={segDTotal} />
        </>
      )}
    </div>
  )
}

function DSegmentPanel({ detail, repWeight, segDTotal }: { detail: BracketDetail; repWeight: number; segDTotal: number }) {
  const t = useT()
  return (
    <div className="rounded-lg border-2 border-green-200 bg-green-50 p-3">
      <p className="text-xs font-semibold text-green-700 mb-2">{t.resultsPanel.segDLastMile}</p>
      <div className="space-y-2 text-xs">
        {detail.seg_d.gateways.length > 0 ? (
          detail.seg_d.gateways.map((gw) => (
            <div key={gw.gateway} className="space-y-1">
              <p className="font-medium text-green-600">
                {gw.gateway} ({Math.round(gw.proportion * 100)}%)
              </p>
              <DetailRow label={t.resultsPanel.detailWeightOz} value={`${fmt(gw.weight_oz, 1)} oz`} />
              {gw.carriers.map((c) => (
                <DetailRow
                  key={c.carrier}
                  label={`${c.carrier} (${Math.round(c.pct * 100)}%)`}
                  value={`${fmt(c.cost_usd, 3)} USD`}
                />
              ))}
              <DetailRow label={t.resultsPanel.detailWeightedAvg} value={`${fmt(gw.avg_cost_usd, 3)} USD`} />
              <DetailRow label="USD/HKD" value={`${fmt(gw.usd_hkd, 4)}`} />
              <div className="border-t border-green-200 pt-1">
                <DetailRow label={t.resultsPanel.detailSubtotal} value={`${fmt(gw.subtotal)} HKD`} bold />
              </div>
            </div>
          ))
        ) : (
          <div className="space-y-1">
            <DetailRow label={t.resultsPanel.detailMode} value={t.resultsPanel.detailFirstAdditional} />
            <DetailRow label={t.resultsPanel.detailWeight} value={`${fmt(repWeight, 3)} kg`} />
            <div className="border-t border-green-200 pt-1 mt-1">
              <DetailRow label={t.resultsPanel.detailSubtotal} value={`${fmt(segDTotal)} HKD`} bold />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className={bold ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
      <span className={`font-mono ${bold ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  )
}

// ─── Stacked Bar with Enhanced Hover ─────────────────────────────────────────

function SegmentBar({
  bracket,
}: {
  bracket: BracketCost
}) {
  const t = useT()
  const total = bracket.cost_hkd || 1
  const isBCCombined = bracket.seg_bc != null && (bracket.seg_b2 ?? 0) === 0 && (bracket.seg_b2c ?? 0) === 0
  const isMultiB_ = (bracket.seg_b2 ?? 0) > 0
  const isMultiBB2C_ = (bracket.seg_b2c ?? 0) > 0
  const segments = isBCCombined
    ? [
        { key: 'a', label: t.resultsPanel.segAPickup, value: bracket.seg_a, color: 'bg-blue-400', pct: (bracket.seg_a / total) * 100 },
        { key: 'bc', label: t.resultsPanel.segBCAirCustoms, value: bracket.seg_bc!, color: 'bg-teal-400', pct: ((bracket.seg_bc ?? 0) / total) * 100 },
      ]
    : isMultiB_
    ? [
        { key: 'a', label: t.resultsPanel.segAPickup, value: bracket.seg_a, color: 'bg-blue-400', pct: (bracket.seg_a / total) * 100 },
        { key: 'b1', label: t.resultsPanel.segB1Air, value: bracket.seg_b, color: 'bg-blue-600', pct: (bracket.seg_b / total) * 100 },
        { key: 'b2', label: t.resultsPanel.segB2Air, value: bracket.seg_b2!, color: 'bg-sky-400', pct: ((bracket.seg_b2 ?? 0) / total) * 100 },
        { key: 'c', label: t.resultsPanel.segCCustoms, value: bracket.seg_c, color: 'bg-purple-400', pct: (bracket.seg_c / total) * 100 },
        { key: 'd', label: t.resultsPanel.segDLastMile, value: bracket.seg_d, color: 'bg-green-400', pct: (bracket.seg_d / total) * 100 },
      ]
    : isMultiBB2C_
    ? [
        { key: 'a', label: t.resultsPanel.segAPickup, value: bracket.seg_a, color: 'bg-blue-400', pct: (bracket.seg_a / total) * 100 },
        { key: 'b1', label: t.resultsPanel.segB1Air, value: bracket.seg_b, color: 'bg-blue-600', pct: (bracket.seg_b / total) * 100 },
        { key: 'b2c', label: t.resultsPanel.segB2CAirCustoms, value: bracket.seg_b2c!, color: 'bg-teal-400', pct: ((bracket.seg_b2c ?? 0) / total) * 100 },
        { key: 'd', label: t.resultsPanel.segDLastMile, value: bracket.seg_d, color: 'bg-green-400', pct: (bracket.seg_d / total) * 100 },
      ]
    : [
        { key: 'a', label: t.resultsPanel.segAPickup, value: bracket.seg_a, color: 'bg-blue-400', pct: (bracket.seg_a / total) * 100 },
        { key: 'b', label: t.resultsPanel.segBAir, value: bracket.seg_b, color: 'bg-orange-400', pct: (bracket.seg_b / total) * 100 },
        { key: 'c', label: t.resultsPanel.segCCustoms, value: bracket.seg_c, color: 'bg-purple-400', pct: (bracket.seg_c / total) * 100 },
        { key: 'd', label: t.resultsPanel.segDLastMile, value: bracket.seg_d, color: 'bg-green-400', pct: (bracket.seg_d / total) * 100 },
      ]

  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{bracket.weight_range}</p>
      <div className="flex h-5 rounded-md overflow-hidden text-[10px] leading-5 text-white font-medium">
        {segments.map(
          (seg) =>
            seg.pct > 0 && (
              <div
                key={seg.key}
                className={`${seg.color} relative group/seg`}
                style={{ width: `${seg.pct}%` }}
              >
                {seg.pct > 8 ? seg.key.toUpperCase() : ''}
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover/seg:block z-50">
                  <div className="rounded bg-gray-900 text-white px-2 py-1 text-xs whitespace-nowrap shadow-lg">
                    <span className="font-medium">{seg.label}</span>
                    <span className="ml-2 font-mono">{fmt(seg.value)} HKD</span>
                    <span className="ml-1 text-gray-400">({fmt(seg.pct, 1)}%)</span>
                  </div>
                </div>
              </div>
            )
        )}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ResultsPanel({ results, loading, weeklyTickets = 7000, isPreview, pricingMode }: ResultsPanelProps) {
  const t = useT()
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [displayMode, setDisplayMode] = useState<'per_ticket' | 'per_kg'>('per_ticket')
  const isBCCombined = pricingMode === 'bc_combined'
    || (!pricingMode && (results?.cost_per_bracket?.some((b) => b.seg_bc != null) ?? false))
  const isBCDCombined = pricingMode === 'bcd_combined'
  const isMultiB = pricingMode === 'multi_b'
    || (!pricingMode && (results?.cost_per_bracket?.some((b) => b.detail?.seg_b2 != null) ?? false))
  const isMultiBB2C = pricingMode === 'multi_b_b2c'
    || (!pricingMode && (results?.cost_per_bracket?.some((b) => b.detail?.seg_b2c != null) ?? false))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground animate-pulse">{t.resultsPanel.computing}</p>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">{t.resultsPanel.selectVendorPreview}</p>
      </div>
    )
  }

  const { gateway_allocation, cost_per_bracket, avg_cost_per_ticket, volume_analysis } = results

  function toggleRow(weightRange: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(weightRange)) {
        next.delete(weightRange)
      } else {
        next.add(weightRange)
      }
      return next
    })
  }

  function getCostValue(raw: number, repWeight: number): number {
    if (displayMode === 'per_kg') {
      return repWeight > 0 ? raw / repWeight : 0
    }
    return raw
  }

  const mawbLabel = Object.entries(volume_analysis.mawb_breakdown)
    .map(([gw, info]) => `${gw}: ${info.kg_per_mawb}kg/${info.tier}`)
    .join(' | ')

  return (
    <div className="space-y-4">
      {/* Preview indicator */}
      {isPreview && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2">
          <span className="text-xs font-medium text-amber-700">{t.resultsPanel.livePreview}</span>
          <span className="text-xs text-amber-600">{t.resultsPanel.notSavedHint}</span>
        </div>
      )}

      {/* Concept F: Assumptions Banner */}
      <AssumptionsBanner results={results} weeklyTickets={weeklyTickets} />

      {/* Cost Verification Table (24 weight points) */}
      {(results as ExtendedResults & { verification_costs?: BracketCost[] }).verification_costs && (
        <Card>
          <CardContent className="pt-4">
            <ScenarioCostVerificationTable costs={(results as ExtendedResults & { verification_costs?: BracketCost[] }).verification_costs!} pricingMode={pricingMode} />
          </CardContent>
        </Card>
      )}

      {/* Legacy: 各重量區間成本明細 — hidden, kept for reference */}
      {false && <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{t.resultsPanel.costBreakdown}</CardTitle>
            <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-0.5">
              <Button
                variant={displayMode === 'per_ticket' ? 'default' : 'ghost'}
                size="xs"
                onClick={() => setDisplayMode('per_ticket')}
              >
                {t.resultsPanel.perTicketUnit}
              </Button>
              <Button
                variant={displayMode === 'per_kg' ? 'default' : 'ghost'}
                size="xs"
                onClick={() => setDisplayMode('per_kg')}
              >
                {t.resultsPanel.perKgUnit}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs w-8"></TableHead>
                  <TableHead className="text-xs">{t.resultsPanel.weightRange}</TableHead>
                  {displayMode === 'per_kg' && (
                    <TableHead className="text-xs text-center text-muted-foreground">{t.resultsPanel.repWeight}</TableHead>
                  )}
                  <TableHead className="text-xs text-center">
                    {t.resultsPanel.segAPickup}
                  </TableHead>
                  {isBCDCombined ? (
                    <TableHead className="text-xs text-center">
                      {t.segments.bcdFull}
                    </TableHead>
                  ) : isBCCombined ? (
                    <>
                      <TableHead className="text-xs text-center">
                        {t.resultsPanel.segBCAirCustoms}
                      </TableHead>
                      <TableHead className="text-xs text-center">
                        {t.resultsPanel.segDLastMile}
                      </TableHead>
                    </>
                  ) : isMultiB ? (
                    <>
                      <TableHead className="text-xs text-center">
                        {t.resultsPanel.segB1Air}
                      </TableHead>
                      <TableHead className="text-xs text-center">
                        {t.resultsPanel.segB2Air}
                      </TableHead>
                      <TableHead className="text-xs text-center">
                        {t.resultsPanel.segCCustoms}
                      </TableHead>
                      <TableHead className="text-xs text-center">
                        {t.resultsPanel.segDLastMile}
                      </TableHead>
                    </>
                  ) : isMultiBB2C ? (
                    <>
                      <TableHead className="text-xs text-center">
                        {t.resultsPanel.segB1Air}
                      </TableHead>
                      <TableHead className="text-xs text-center">
                        {t.resultsPanel.segB2CAirCustoms}
                      </TableHead>
                      <TableHead className="text-xs text-center">
                        {t.resultsPanel.segDLastMile}
                      </TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="text-xs text-center">
                        {t.resultsPanel.segBAir}
                      </TableHead>
                      <TableHead className="text-xs text-center">
                        {t.resultsPanel.segCCustoms}
                      </TableHead>
                      <TableHead className="text-xs text-center">
                        {t.resultsPanel.segDLastMile}
                      </TableHead>
                    </>
                  )}
                  <TableHead className="text-xs text-center font-semibold">
                    {displayMode === 'per_kg' ? t.resultsPanel.totalPerKg : t.resultsPanel.totalCostLabel}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cost_per_bracket.map((b) => {
                  const isExpanded = expandedRows.has(b.weight_range)
                  const hasDetail = !!b.detail
                  const rw = b.representative_weight_kg

                  return (
                    <TableRow
                      key={b.weight_range}
                      className="group/row"
                    >
                      <TableCell colSpan={
                        isBCDCombined ? (displayMode === 'per_kg' ? 6 : 5)
                        : isBCCombined ? (displayMode === 'per_kg' ? 7 : 6)
                        : isMultiB ? (displayMode === 'per_kg' ? 9 : 8)
                        : isMultiBB2C ? (displayMode === 'per_kg' ? 8 : 7)
                        : (displayMode === 'per_kg' ? 8 : 7)
                      } className="p-0">
                        {/* Main row */}
                        <div
                          className={`flex items-center ${hasDetail ? 'cursor-pointer hover:bg-muted/30' : ''}`}
                          onClick={() => hasDetail && toggleRow(b.weight_range)}
                        >
                          <div className="w-8 flex items-center justify-center text-xs text-muted-foreground px-2 py-2">
                            {hasDetail ? (isExpanded ? '▼' : '▶') : ''}
                          </div>
                          <div className="flex-1 grid items-center py-2 pr-3" style={{
                            gridTemplateColumns: isBCDCombined
                              ? (displayMode === 'per_kg' ? '1fr 0.7fr repeat(2, 1fr) 1fr' : '1fr repeat(2, 1fr) 1fr')
                              : isBCCombined
                              ? (displayMode === 'per_kg' ? '1fr 0.7fr repeat(3, 1fr) 1fr' : '1fr repeat(3, 1fr) 1fr')
                              : isMultiB
                              ? (displayMode === 'per_kg' ? '1fr 0.7fr repeat(5, 1fr) 1fr' : '1fr repeat(5, 1fr) 1fr')
                              : isMultiBB2C
                              ? (displayMode === 'per_kg' ? '1fr 0.7fr repeat(3, 1fr) 1fr' : '1fr repeat(3, 1fr) 1fr')
                              : (displayMode === 'per_kg' ? '1fr 0.7fr repeat(4, 1fr) 1fr' : '1fr repeat(4, 1fr) 1fr'),
                          }}>
                            <span className="text-xs font-medium">{b.weight_range}</span>
                            {displayMode === 'per_kg' && (
                              <span className="text-xs text-center text-muted-foreground font-mono">
                                {fmt(rw, 3)} kg
                              </span>
                            )}
                            <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_a, rw))}</span>
                            {isBCDCombined ? (
                              <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_d, rw))}</span>
                            ) : isBCCombined ? (
                              <>
                                <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_bc ?? 0, rw))}</span>
                                <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_d, rw))}</span>
                              </>
                            ) : isMultiB ? (
                              <>
                                <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_b, rw))}</span>
                                <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_b2 ?? 0, rw))}</span>
                                <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_c, rw))}</span>
                                <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_d, rw))}</span>
                              </>
                            ) : isMultiBB2C ? (
                              <>
                                <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_b, rw))}</span>
                                <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_b2c ?? 0, rw))}</span>
                                <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_d, rw))}</span>
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_b, rw))}</span>
                                <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_c, rw))}</span>
                                <span className="text-xs text-center font-mono">{fmt(getCostValue(b.seg_d, rw))}</span>
                              </>
                            )}
                            <span className="text-xs text-center font-mono font-semibold">
                              {fmt(getCostValue(b.cost_hkd, rw))}
                            </span>
                          </div>
                        </div>

                        {/* Expanded detail panel */}
                        {isExpanded && b.detail && (
                          <div className="border-t bg-muted/20">
                            <ExpandedDetail detail={b.detail} repWeight={rw} segBTotal={getCostValue(b.seg_b, rw)} segCTotal={getCostValue(b.seg_c, rw)} segDTotal={getCostValue(b.seg_d, rw)} />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {cost_per_bracket.some((b) => b.detail) && (
            <p className="text-xs text-muted-foreground mt-2">
              &#9432; {t.resultsPanel.expandHint}
            </p>
          )}
        </CardContent>
      </Card>}

      {/* Volume Curve Chart — replacing segment proportion bar */}
      {false && <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t.resultsPanel.costStructure}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {cost_per_bracket.map((b) => (
              <SegmentBar key={b.weight_range} bracket={b} />
            ))}
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-blue-400" /> {t.resultsPanel.segAPickup}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-orange-400" /> {t.resultsPanel.segBAir}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-purple-400" /> {t.resultsPanel.segCCustoms}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-400" /> {t.resultsPanel.segDLastMile}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>}

      {/* Volume Curve Chart — kept as-is */}
      {results.volume_curve && (
        <VolumeCurveChart data={results.volume_curve} currentTickets={weeklyTickets} />
      )}

      {/* Volume Analysis Tier Breakpoints — kept as-is */}
      {volume_analysis.tier_breakpoints.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t.resultsPanel.ticketTierAnalysis}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {volume_analysis.tier_breakpoints.map((bp, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs font-mono">
                    {bp.min_weekly_tickets.toLocaleString()}+ {t.resultsPanel.tickets}/wk
                  </Badge>
                  <span className="text-xs text-muted-foreground">{bp.tier_label}</span>
                  <span className="text-xs font-mono ml-auto">
                    {t.resultsPanel.bcVariation}: {fmt(bp.cost_at_tier)} HKD/{t.resultsPanel.tickets}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
