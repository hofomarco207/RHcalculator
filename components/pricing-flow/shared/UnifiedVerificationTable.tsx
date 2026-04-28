'use client'

import { useState, useMemo } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useT } from '@/lib/i18n'
import { UNIFIED_WEIGHT_POINTS, DEFAULT_EXCHANGE_RATES } from '@/types'
import type { BracketCost } from '@/types/scenario'
import type { RateCardBracket } from '@/types'
import type { CompetitorBracketPrice } from '@/types/pricing-analysis'
import { getMarginColorClass } from '@/lib/utils/margin'
import { getRegFee } from '@/lib/calculations/scenario-pricing'
import { CostTooltip } from '@/components/rate-card/CostTooltip'
import { invalidSegments, isCostValid, type PricingMode as ValidationPricingMode } from '@/lib/utils/cost-validation'

// ─── Currency helpers ──────────────────────────────────────────────────────

type Currency = 'HKD' | 'RMB' | 'USD' | 'JPY'

function getCurrencyMultiplier(cur: Currency): number {
  const r = DEFAULT_EXCHANGE_RATES
  switch (cur) {
    case 'HKD': return 1
    case 'RMB': return r.hkd_rmb
    case 'USD': return 1 / r.usd_hkd
    case 'JPY': return 1 / (r.jpy_hkd ?? 0.052)
    default: return 1
  }
}

// ─── Data source types ─────────────────────────────────────────────────────

export interface ScenarioSource {
  type: 'scenario'
  id: string
  label: string
  costs: BracketCost[]
  pricingMode?: string
}

export interface RateCardSource {
  type: 'rate-card'
  id: string
  label: string
  brackets: RateCardBracket[]
}

export interface CompetitorSource {
  type: 'competitor'
  id: string
  label: string
  brackets: CompetitorBracketPrice[]
  currency: string
  fuelSurchargePct?: number
  weightStep?: number
}

export type DataSource = ScenarioSource | RateCardSource | CompetitorSource

// ─── Computed row per weight point per source ──────────────────────────────

interface CellData {
  cost: number        // total cost in HKD
  price: number       // total price/revenue in HKD (rate cards & competitors)
  freightRate: number  // per-kg freight rate
  regFee: number
  margin: number      // (price - cost) / price, or 0
  hasBreakdown: boolean
  segA?: number
  segB?: number
  segC?: number
  segD?: number
  segBC?: number
}

// ─── Helpers to compute cost at a specific weight from scenario costs ──────

export function computeScenarioCostAtWeight(
  weightKg: number,
  costs: BracketCost[],
): { cost: number; segA: number; segB: number; segC: number; segD: number; segBC: number } {
  // Try exact match first
  const exact = costs.find(c => Math.abs(c.representative_weight_kg - weightKg) < 0.001)
  if (exact) {
    return {
      cost: exact.cost_hkd,
      segA: exact.seg_a,
      segB: exact.seg_b,
      segC: exact.seg_c,
      segD: exact.seg_d,
      segBC: exact.seg_bc ?? 0,
    }
  }

  // Fallback: find matching bracket and interpolate
  const sc = costs.find(c => weightKg > c.weight_min_kg && weightKg <= c.weight_max_kg) ?? costs[0]
  if (!sc) return { cost: 0, segA: 0, segB: 0, segC: 0, segD: 0, segBC: 0 }

  const detail = sc.detail
  const repW = sc.representative_weight_kg

  // A段: additive — per-kg portion scales with weight × bubble; per-piece portion is flat
  let segA = 0
  if (detail) {
    const rate = detail.seg_a.pickup_rate + (detail.seg_a.include_sorting ? detail.seg_a.sorting_rate : 0)
    const bubble = detail.seg_a.bubble_ratio ?? 1.0
    const perKg = rate * weightKg * bubble
    const perPiece = detail.seg_a.per_piece_cost_hkd ?? 0
    segA = perKg + perPiece
  } else if (repW > 0) {
    segA = (sc.seg_a / repW) * weightKg
  }

  // B段
  let segB = 0
  if (detail && detail.seg_b.gateways.length > 0) {
    for (const gw of detail.seg_b.gateways) {
      segB += (gw.rate_per_kg * weightKg * gw.bubble_rate + gw.mawb_amortized) * gw.proportion
    }
  } else if (repW > 0) {
    segB = (sc.seg_b / repW) * weightKg
  }

  // C段
  let segC = 0
  if (detail && detail.seg_c.gateways.length > 0) {
    for (const gw of detail.seg_c.gateways) {
      const scaledPerKg = repW > 0 ? (gw.per_kg_cost / repW) * weightKg : 0
      segC += (gw.mawb_amortized + scaledPerKg + gw.per_hawb_cost) * gw.proportion
    }
  }

  // BC段
  let segBC = 0
  if (detail?.seg_bc) {
    const bc = detail.seg_bc
    segBC = bc.rate_per_kg * weightKg * (1 + (bc.fuel_surcharge_pct ?? 0) / 100) * bc.exchange_rate_to_hkd
  } else if ((sc.seg_bc ?? 0) > 0 && repW > 0) {
    segBC = (sc.seg_bc! / repW) * weightKg
  }

  // D段
  let segD = 0
  if (detail && detail.seg_d.gateways.length > 0) {
    for (const gw of detail.seg_d.gateways) {
      const scale = repW > 0 ? weightKg / repW : 1
      segD += gw.avg_cost_usd * scale * gw.usd_hkd * gw.proportion
    }
  } else if (detail?.seg_d.pricing_detail) {
    const pd = detail.seg_d.pricing_detail
    if (pd.tiered) {
      segD = (pd.tiered.rate_per_kg * weightKg + pd.tiered.registration_fee) * pd.tiered.exchange_rate_to_hkd
    } else if (pd.model === 'first_additional' && pd.zones?.length) {
      for (const z of pd.zones) {
        const fwKg = z.first_weight_kg ?? 1
        const fwPrice = z.first_weight_price ?? 0
        const awKg = z.additional_weight_kg ?? 1
        const awPrice = z.additional_weight_price ?? 0
        const zoneCost = weightKg <= fwKg ? fwPrice : fwPrice + Math.ceil((weightKg - fwKg) / awKg) * awPrice
        segD += zoneCost * z.exchange_rate_to_hkd * (z.weight ?? (1 / pd.zones!.length))
      }
    } else if (pd.model === 'weight_bracket' && pd.zones?.length) {
      for (const z of pd.zones) {
        let zoneCost: number
        if (z.bracket_price != null) {
          if (z.matched_bracket_max != null && weightKg > z.matched_bracket_max && z.additional_weight_kg && z.additional_weight_price) {
            zoneCost = z.bracket_price + Math.ceil((weightKg - z.matched_bracket_max) / z.additional_weight_kg) * z.additional_weight_price
          } else {
            zoneCost = z.bracket_price
          }
        } else {
          zoneCost = z.cost_in_currency
        }
        segD += zoneCost * z.exchange_rate_to_hkd * (z.weight ?? (1 / pd.zones!.length))
      }
    } else if (pd.model === 'per_piece' && pd.per_piece_fee != null) {
      segD = pd.per_piece_fee * (pd.exchange_rate_to_hkd ?? 1)
    } else if (pd.model === 'simple' && pd.rate_per_kg != null) {
      segD = pd.rate_per_kg * weightKg * (pd.exchange_rate_to_hkd ?? 1)
    } else if (repW > 0) {
      segD = (sc.seg_d / repW) * weightKg
    }
  } else if (repW > 0 && sc.seg_d > 0) {
    segD = (sc.seg_d / repW) * weightKg
  }

  const cost = segA + segB + segC + segD + segBC
  return { cost, segA, segB, segC, segD, segBC }
}

function computeCellFromSource(source: DataSource, weightKg: number): CellData {
  if (source.type === 'scenario') {
    const r = computeScenarioCostAtWeight(weightKg, source.costs)
    return {
      cost: r.cost,
      price: r.cost, // scenario = cost only, no pricing
      freightRate: 0,
      regFee: 0,
      margin: 0,
      hasBreakdown: true,
      segA: r.segA,
      segB: r.segB,
      segC: r.segC,
      segD: r.segD,
      segBC: r.segBC,
    }
  }

  if (source.type === 'rate-card') {
    const bracket = source.brackets.find(b => weightKg > b.weight_min_kg && weightKg <= b.weight_max_kg) ?? source.brackets[0]
    if (!bracket) return { cost: 0, price: 0, freightRate: 0, regFee: 0, margin: 0, hasBreakdown: false }
    const price = bracket.freight_rate_hkd_per_kg * weightKg + bracket.reg_fee_hkd
    return {
      cost: bracket.cost_hkd,
      price,
      freightRate: bracket.freight_rate_hkd_per_kg,
      regFee: bracket.reg_fee_hkd,
      margin: price > 0 ? (price - bracket.cost_hkd) / price : 0,
      hasBreakdown: false,
    }
  }

  // Competitor
  const bp = source.brackets.find(b => weightKg > b.weight_min && weightKg <= b.weight_max) ?? source.brackets[0]
  if (!bp) return { cost: 0, price: 0, freightRate: 0, regFee: 0, margin: 0, hasBreakdown: false }
  // Competitor price in source currency
  const ws = source.weightStep ?? 0
  const chargedWeight = ws > 0 ? Math.ceil(weightKg / ws) * ws : weightKg
  const fsc = source.fuelSurchargePct ?? 0
  let priceInCurrency = bp.rate_per_kg * chargedWeight + bp.reg_fee
  if (fsc > 0) {
    priceInCurrency = bp.rate_per_kg * chargedWeight * (1 + fsc / 100) + bp.reg_fee
  }
  // Convert to HKD
  const currencyToHkdRate = (() => {
    const r = DEFAULT_EXCHANGE_RATES
    switch (source.currency) {
      case 'HKD': return 1
      case 'JPY': return r.jpy_hkd ?? 0.052
      case 'USD': return r.usd_hkd
      case 'RMB': return 1 / r.hkd_rmb
      default: return 1
    }
  })()
  const priceHkd = priceInCurrency * currencyToHkdRate
  return {
    cost: priceHkd, // for competitors, "cost" = their price (no cost breakdown)
    price: priceHkd,
    freightRate: bp.rate_per_kg * currencyToHkdRate,
    regFee: bp.reg_fee * currencyToHkdRate,
    margin: 0, // no margin for competitors
    hasBreakdown: false,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Is a source a "price" source (rate card or competitor) vs a "cost" source (scenario) */
function isPriceSource(src: DataSource): boolean {
  return src.type === 'rate-card' || src.type === 'competitor'
}

/** Build tooltip content describing how a cell value was computed. */
function buildCellTooltip(
  src: DataSource,
  cell: CellData,
  weightKg: number,
  mul: number,
  cur: Currency,
): React.ReactNode {
  const fmt = (v: number) => (v * mul).toFixed(2)
  if (src.type === 'scenario') {
    const pm = (src as ScenarioSource).pricingMode ?? 'segmented'
    const rows: Array<[string, number]> = []
    if (pm === 'bcd_combined') {
      rows.push(['A 攬收', cell.segA ?? 0])
      rows.push(['BCD 包干', cell.segD ?? 0])
    } else if (pm === 'bc_combined') {
      rows.push(['A 攬收', cell.segA ?? 0])
      rows.push(['BC 空運+清關', cell.segBC ?? 0])
      rows.push(['D 尾程', cell.segD ?? 0])
    } else {
      rows.push(['A 攬收', cell.segA ?? 0])
      rows.push(['B 空運', cell.segB ?? 0])
      rows.push(['C 清關', cell.segC ?? 0])
      rows.push(['D 尾程', cell.segD ?? 0])
    }
    return (
      <>
        <span className="text-blue-400 font-semibold">{src.label} @ {weightKg}kg</span>
        {rows.filter(([, v]) => v > 0).map(([label, v]) => (
          <span key={label}>
            {'\n'}
            {label}: {fmt(v)}
          </span>
        ))}
        {'\n'}──────────
        {'\n'}
        <span className="text-amber-400">合計 = {fmt(cell.cost)} {cur}</span>
      </>
    )
  }
  if (src.type === 'rate-card') {
    const freightPart = cell.freightRate * weightKg
    return (
      <>
        <span className="text-blue-400 font-semibold">{src.label} @ {weightKg}kg</span>
        {'\n'}
        運費 {cell.freightRate.toFixed(2)} × {weightKg} = {freightPart.toFixed(2)} HKD
        {'\n'}
        掛號費 {cell.regFee.toFixed(2)} HKD
        {'\n'}──────────
        {'\n'}
        <span className="text-amber-400">報價 = {fmt(cell.price)} {cur}</span>
        {cell.cost > 0 && (
          <>
            {'\n'}
            成本 {fmt(cell.cost)} · 毛利 {(cell.margin * 100).toFixed(1)}%
          </>
        )}
      </>
    )
  }
  // competitor
  const comp = src as CompetitorSource
  const ws = comp.weightStep ?? 0
  const chargedW = ws > 0 ? Math.ceil(weightKg / ws) * ws : weightKg
  const fsc = comp.fuelSurchargePct ?? 0
  return (
    <>
      <span className="text-blue-400 font-semibold">{src.label} @ {weightKg}kg</span>
      {ws > 0 && (
        <>
          {'\n'}
          計重階 {ws}kg → 收費 {chargedW}kg
        </>
      )}
      {'\n'}
      運費 {cell.freightRate.toFixed(2)} × {chargedW}
      {fsc > 0 && <> × {(1 + fsc / 100).toFixed(2)} (燃油 +{fsc}%)</>}
      {'\n'}
      + 掛號費 {cell.regFee.toFixed(2)}
      {comp.currency !== 'HKD' && (
        <>
          {'\n'}
          (原始 {comp.currency} → HKD)
        </>
      )}
      {'\n'}──────────
      {'\n'}
      <span className="text-amber-400">報價 = {fmt(cell.price)} {cur}</span>
    </>
  )
}

const SOURCE_COLORS = ['text-blue-500', 'text-orange-500', 'text-purple-500', 'text-teal-500'] as const

// ─── Props ─────────────────────────────────────────────────────────────────

interface UnifiedVerificationTableProps {
  /** Up to 4 data sources to compare side-by-side */
  sources: DataSource[]
  /** Show cost breakdown columns for scenarios (default false for cleaner view) */
  showBreakdown?: boolean
  /** Whether to highlight the cheapest source per row */
  highlightCheapest?: boolean
  /** Column to use for cheapest comparison: 'cost' for scenarios, 'price' for cards */
  compareBy?: 'cost' | 'price'
  /** Always-on margin column: click headers to switch which price/cost pair calculates margin */
  enableMarginCompare?: boolean
}

export function UnifiedVerificationTable({
  sources,
  showBreakdown = false,
  highlightCheapest = true,
  compareBy = 'cost',
  enableMarginCompare = false,
}: UnifiedVerificationTableProps) {
  const t = useT()
  const [currency, setCurrency] = useState<Currency>('HKD')
  const mul = getCurrencyMultiplier(currency)

  const weights = useMemo(() => UNIFIED_WEIGHT_POINTS.map(wp => wp.representative), [])

  // Compute all cells: rows[weightIdx][sourceIdx]
  const grid = useMemo(() => {
    return weights.map(w =>
      sources.map(src => computeCellFromSource(src, w))
    )
  }, [weights, sources])

  // ── Margin compare: always-on pair selection ──
  // Separate indices for the "price" source and "cost" source used for the margin column.
  // Defaults: first price source (card/competitor) and first cost source (scenario).
  const defaultPriceIdx = useMemo(() => sources.findIndex(s => isPriceSource(s)), [sources])
  const defaultCostIdx = useMemo(() => sources.findIndex(s => s.type === 'scenario'), [sources])

  const [marginPriceIdx, setMarginPriceIdx] = useState<number>(-1)
  const [marginCostIdx, setMarginCostIdx] = useState<number>(-1)

  // Effective indices (use defaults if user hasn't explicitly selected)
  const effPriceIdx = marginPriceIdx >= 0 && marginPriceIdx < sources.length ? marginPriceIdx : defaultPriceIdx
  const effCostIdx = marginCostIdx >= 0 && marginCostIdx < sources.length ? marginCostIdx : defaultCostIdx
  const hasMarginPair = enableMarginCompare && effPriceIdx >= 0 && effCostIdx >= 0 && effPriceIdx !== effCostIdx

  // Click handler: clicking a price source sets it as the margin price source,
  // clicking a cost source sets it as the margin cost source.
  function handleHeaderClick(srcIdx: number) {
    if (!enableMarginCompare) return
    const src = sources[srcIdx]
    if (isPriceSource(src)) {
      setMarginPriceIdx(srcIdx)
    } else {
      // scenario = cost source
      setMarginCostIdx(srcIdx)
    }
  }

  // Compute margin per row
  const marginValues = useMemo(() => {
    if (!hasMarginPair) return []
    return grid.map(row => {
      const price = row[effPriceIdx].price
      const cost = row[effCostIdx].cost
      if (price <= 0) return 0
      return (price - cost) / price
    })
  }, [grid, hasMarginPair, effPriceIdx, effCostIdx])

  const avgMargin = useMemo(() => {
    if (marginValues.length === 0) return 0
    return marginValues.reduce((s, m) => s + m, 0) / marginValues.length
  }, [marginValues])

  // Find cheapest per row
  const cheapestIdx = useMemo(() => {
    if (!highlightCheapest || sources.length < 2) return weights.map(() => -1)
    return grid.map(row => {
      let minVal = Infinity
      let minIdx = -1
      row.forEach((cell, i) => {
        const val = compareBy === 'cost' ? cell.cost : cell.price
        if (val > 0 && val < minVal) {
          minVal = val
          minIdx = i
        }
      })
      return minIdx
    })
  }, [grid, highlightCheapest, compareBy, sources.length])

  const fmt = (v: number) => (v * mul).toFixed(2)

  function getSourceColor(idx: number) {
    return SOURCE_COLORS[idx % SOURCE_COLORS.length]
  }

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {hasMarginPair && (
            <>
              <span className="text-xs text-muted-foreground">
                毛利計算：
                <button
                  type="button"
                  className={`ml-1 font-medium ${getSourceColor(effPriceIdx)} hover:underline`}
                  onClick={() => {/* already selected, clicking header switches */}}
                >
                  {sources[effPriceIdx].label}
                </button>
                <span className="mx-1">vs</span>
                <button
                  type="button"
                  className={`font-medium ${getSourceColor(effCostIdx)} hover:underline`}
                  onClick={() => {/* already selected, clicking header switches */}}
                >
                  {sources[effCostIdx].label}
                </button>
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-mono ${getMarginColorClass(avgMargin)}`}>
                平均毛利 {(avgMargin * 100).toFixed(1)}%
              </span>
            </>
          )}
          {enableMarginCompare && !hasMarginPair && (
            <span className="text-xs text-muted-foreground">
              需要至少一個價卡和一個成本方案才能計算毛利
            </span>
          )}
        </div>
        <Select value={currency} onValueChange={v => setCurrency(v as Currency)}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="HKD">HKD</SelectItem>
            <SelectItem value="RMB">RMB</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="JPY">JPY</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm data-table">
          <thead>
            <tr className="bg-muted/60 border-b">
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-muted/60 z-10">
                {t.verification.weight} (KG)
              </th>
              {sources.map((src, i) => {
                const isActivePrice = enableMarginCompare && i === effPriceIdx
                const isActiveCost = enableMarginCompare && i === effCostIdx
                const isActive = isActivePrice || isActiveCost
                return (
                  <th
                    key={src.id}
                    className={`px-3 py-2.5 text-center font-medium whitespace-nowrap ${getSourceColor(i)} ${
                      enableMarginCompare ? 'cursor-pointer select-none' : ''
                    }`}
                    colSpan={showBreakdown && src.type === 'scenario' ? 2 : 1}
                    onClick={() => handleHeaderClick(i)}
                  >
                    {enableMarginCompare && (
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle transition-all ${
                          isActive ? 'bg-[#FF6B00] shadow-[0_0_4px_rgba(255,107,0,0.5)]' : 'bg-transparent border border-current opacity-40'
                        }`}
                      />
                    )}
                    {src.label}
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                      {src.type === 'scenario' ? '(成本)' : `(${currency})`}
                    </span>
                  </th>
                )
              })}
              {hasMarginPair && (
                <th className="px-3 py-2.5 text-center font-medium whitespace-nowrap text-emerald-600 border-l border-border">
                  毛利率
                </th>
              )}
            </tr>
            {/* Sub-header for breakdown */}
            {showBreakdown && sources.some(s => s.type === 'scenario') && (
              <tr className="bg-muted/40 border-b text-[10px]">
                <th className="sticky left-0 bg-muted/40 z-10" />
                {sources.map((src) => {
                  if (src.type === 'scenario') {
                    return (
                      <th key={`${src.id}-cost`} className="px-2 py-1 text-center text-muted-foreground" colSpan={2}>
                        {t.verification.cost} | {t.common.total}
                      </th>
                    )
                  }
                  return (
                    <th key={`${src.id}-price`} className="px-2 py-1 text-center text-muted-foreground">
                      {src.type === 'competitor' ? '報價' : t.verification.revenue}
                    </th>
                  )
                })}
                {hasMarginPair && <th className="border-l border-border" />}
              </tr>
            )}
          </thead>
          <tbody>
            {weights.map((w, rowIdx) => (
              <tr
                key={w}
                className={`border-b last:border-0 hover:bg-muted/30 ${
                  rowIdx % 2 === 1 ? 'bg-muted/10' : ''
                }`}
              >
                <td className="px-3 py-1.5 font-mono text-xs font-semibold sticky left-0 bg-inherit z-10">
                  {w}
                </td>
                {sources.map((src, colIdx) => {
                  const cell = grid[rowIdx][colIdx]
                  const isCheapest = cheapestIdx[rowIdx] === colIdx
                  const isInMarginPair = hasMarginPair && (colIdx === effPriceIdx || colIdx === effCostIdx)
                  const bgClass = isCheapest
                    ? 'bg-green-50 dark:bg-green-950/30'
                    : isInMarginPair
                      ? 'bg-amber-50/40 dark:bg-amber-950/10'
                      : ''

                  const tooltipContent = buildCellTooltip(src, cell, w, mul, currency)

                  if (showBreakdown && src.type === 'scenario') {
                    const pm = ((src as ScenarioSource).pricingMode ?? 'segmented') as ValidationPricingMode
                    const costs = {
                      seg_a: cell.segA,
                      seg_b: cell.segB,
                      seg_c: cell.segC,
                      seg_d: cell.segD,
                      seg_bc: cell.segBC,
                    }
                    const bad = new Set(invalidSegments(costs, pm))
                    const valid = isCostValid(costs, pm)
                    const seg = (k: ValidationPricingMode extends string ? string : never, label: string, val: number) => (
                      <span className={bad.has(k as never) ? 'text-red-500 font-semibold' : ''}>
                        {label}:{fmt(val)}
                      </span>
                    )
                    const breakdownNode = pm === 'bcd_combined'
                      ? <>{seg('seg_a', 'A', cell.segA!)} {seg('seg_d', 'BCD', cell.segD!)}</>
                      : pm === 'bc_combined'
                        ? <>{seg('seg_a', 'A', cell.segA!)} {seg('seg_bc', 'BC', cell.segBC!)} {seg('seg_d', 'D', cell.segD!)}</>
                        : <>{seg('seg_a', 'A', cell.segA!)} {seg('seg_b', 'B', cell.segB!)} {seg('seg_c', 'C', cell.segC!)} {seg('seg_d', 'D', cell.segD!)}</>
                    return (
                      <>
                        <td key={`${src.id}-${w}-bd`} className={`px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground ${bgClass}`}>
                          <CostTooltip content={tooltipContent}>
                            <span className="cursor-help space-x-1">{breakdownNode}</span>
                          </CostTooltip>
                        </td>
                        <td key={`${src.id}-${w}-total`} className={`px-3 py-1.5 text-center font-mono text-xs font-semibold ${bgClass}`}>
                          <CostTooltip content={tooltipContent}>
                            <span className="cursor-help">
                              {valid ? fmt(cell.cost) : <span className="text-red-500">計算錯誤</span>}
                            </span>
                          </CostTooltip>
                        </td>
                      </>
                    )
                  }

                  // Single column: show cost for scenarios, price for cards/competitors
                  const displayValue = src.type === 'scenario' ? cell.cost : cell.price
                  // For scenarios in single-column view, flag invalid total in red
                  let scenarioValid = true
                  if (src.type === 'scenario') {
                    const pm = ((src as ScenarioSource).pricingMode ?? 'segmented') as ValidationPricingMode
                    scenarioValid = isCostValid(
                      {
                        seg_a: cell.segA,
                        seg_b: cell.segB,
                        seg_c: cell.segC,
                        seg_d: cell.segD,
                        seg_bc: cell.segBC,
                      },
                      pm,
                    )
                  }
                  return (
                    <td
                      key={`${src.id}-${w}`}
                      className={`px-3 py-1.5 text-center font-mono text-xs ${bgClass} ${
                        isCheapest ? 'font-semibold text-green-700 dark:text-green-400' : ''
                      }`}
                    >
                      <CostTooltip content={tooltipContent}>
                        <span className="cursor-help">
                          {scenarioValid ? fmt(displayValue) : <span className="text-red-500 font-semibold">計算錯誤</span>}
                        </span>
                      </CostTooltip>
                    </td>
                  )
                })}
                {/* Margin column — always visible when pair exists */}
                {hasMarginPair && (
                  <td className="px-3 py-1.5 text-center font-mono text-xs font-semibold border-l border-border">
                    <span className={getMarginColorClass(marginValues[rowIdx])}>
                      {(marginValues[rowIdx] * 100).toFixed(1)}%
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      {highlightCheapest && sources.length >= 2 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-green-50 border border-green-200" />
            {compareBy === 'cost' ? '最低成本' : '最低價格'}
          </span>
          {enableMarginCompare && hasMarginPair && (
            <span>點擊欄位名稱可切換毛利計算對象</span>
          )}
        </div>
      )}
    </div>
  )
}
