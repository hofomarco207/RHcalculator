'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { getMarginColorClass } from '@/lib/utils/margin'
import { CostTooltip } from '@/components/rate-card/CostTooltip'
import type { MarginVerificationRow, MarginVerificationTableProps, SegmentBreakdown } from '@/types/pricing-analysis'

function competitorTooltip(ratePerKg: number, weight: number, regFee: number, total: number, labels: { title: string; freight: string; regFee: string }, mul = 1, cur = 'HKD') {
  const freight = ratePerKg * weight
  return (
    <>
      <span className="text-orange-400 font-semibold">{labels.title}</span>
      {'\n'}
      {labels.freight} {(ratePerKg * mul).toFixed(2)} × {weight} kg = {(freight * mul).toFixed(2)}
      {'\n'}
      {labels.regFee} {(regFee * mul).toFixed(2)}
      {'\n'}
      <span className="text-amber-400">= {(total * mul).toFixed(2)} {cur}</span>
    </>
  )
}

function costTooltip(breakdown: SegmentBreakdown, total: number, pricingMode: string | undefined, labels: { title: string; a: string; b: string; c: string; d: string; bc: string; bcd: string; b1: string; b2: string; b2c: string }, mul = 1, cur = 'HKD') {
  const isBCDCombined = pricingMode === 'bcd_combined'
  const isBCCombined = pricingMode === 'bc_combined'
  const isMultiB = pricingMode === 'multi_b'
  const isMultiBB2C = pricingMode === 'multi_b_b2c'
  return (
    <>
      <span className="text-blue-400 font-semibold">{labels.title}</span>
      {'\n'}
      {labels.a}: {(breakdown.a * mul).toFixed(2)}
      {isBCDCombined ? (
        <>{'\n'}{labels.bcd}: {(breakdown.d * mul).toFixed(2)}</>
      ) : isBCCombined ? (
        <>{'\n'}{labels.bc}: {((breakdown.bc ?? 0) * mul).toFixed(2)}{'\n'}{labels.d}: {(breakdown.d * mul).toFixed(2)}</>
      ) : isMultiB ? (
        <>
          {'\n'}{labels.b1}: {(breakdown.b * mul).toFixed(2)}
          {'\n'}{labels.b2}: {((breakdown.b2 ?? 0) * mul).toFixed(2)}
          {'\n'}{labels.c}: {(breakdown.c * mul).toFixed(2)}
          {'\n'}{labels.d}: {(breakdown.d * mul).toFixed(2)}
        </>
      ) : isMultiBB2C ? (
        <>
          {'\n'}{labels.b1}: {(breakdown.b * mul).toFixed(2)}
          {'\n'}{labels.b2c}: {((breakdown.b2c ?? 0) * mul).toFixed(2)}
          {'\n'}{labels.d}: {(breakdown.d * mul).toFixed(2)}
        </>
      ) : (
        <>{'\n'}{labels.b}: {(breakdown.b * mul).toFixed(2)}{'\n'}{labels.c}: {(breakdown.c * mul).toFixed(2)}{'\n'}{labels.d}: {(breakdown.d * mul).toFixed(2)}</>
      )}
      {'\n'}
      <span className="text-amber-400">= {(total * mul).toFixed(2)} {cur}</span>
    </>
  )
}

export type CompareMode = 'vs_cost' | 'vs_competitor'

export function MarginVerificationTable({
  rows,
  editable = false,
  onFreightChange,
  onRegFeeChange,
  onReset,
  weightedMargin,
  pricingMode,
  displayCurrency,
  currencyMultiplier = 1,
}: MarginVerificationTableProps) {
  const t = useT()
  const [compareMode, setCompareMode] = useState<CompareMode>('vs_cost')
  const mul = currencyMultiplier
  const curLabel = displayCurrency && displayCurrency !== 'HKD' ? ` (${displayCurrency})` : ''

  // Compute average delta vs competitor
  const avgDeltaPct = rows.length > 0
    ? rows.reduce((s, r) => {
        if (!r.competitor_price || r.competitor_price === 0) return s
        return s + (r.my_price - r.competitor_price) / r.competitor_price
      }, 0) / rows.filter(r => r.competitor_price && r.competitor_price > 0).length
    : 0

  return (
    <div className="space-y-3">
      {/* Compare mode toggle */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">{t.pricingAnalysis.step3.compareLabel}:</span>
        <button
          onClick={() => setCompareMode('vs_cost')}
          className={`px-2 py-0.5 text-xs rounded border transition-colors ${
            compareMode === 'vs_cost'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-input hover:bg-accent'
          }`}
        >
          {t.pricingAnalysis.step3.vsCost}
        </button>
        <button
          onClick={() => setCompareMode('vs_competitor')}
          className={`px-2 py-0.5 text-xs rounded border transition-colors ${
            compareMode === 'vs_competitor'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-input hover:bg-accent'
          }`}
        >
          {t.pricingAnalysis.step3.vsCompetitor}
        </button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">{t.verification.weight}{curLabel}</TableHead>
            <TableHead className="text-xs text-center">{t.pricingAnalysis.compete.competitorPrice}{curLabel}</TableHead>
            <TableHead className="text-xs text-center">
              {t.verification.freight}{editable ? ' ✏️' : ''}{curLabel}
            </TableHead>
            <TableHead className="text-xs text-center">
              {t.verification.regFee}{editable ? ' ✏️' : ''}{curLabel}
            </TableHead>
            <TableHead className="text-xs text-center">{t.verification.price}{curLabel}</TableHead>
            <TableHead className="text-xs text-center">{t.verification.cost}{curLabel}</TableHead>
            <TableHead className="text-xs text-center">
              {compareMode === 'vs_competitor' ? t.pricingAnalysis.step3.deltaDollar : t.verification.marginAmount}
            </TableHead>
            <TableHead className="text-xs text-center">
              {compareMode === 'vs_competitor' ? t.pricingAnalysis.step3.deltaPct : t.verification.margin}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <MarginRow
              key={row.weight_bracket}
              row={row}
              index={i}
              editable={editable}
              onFreightChange={onFreightChange}
              onRegFeeChange={onRegFeeChange}
              onReset={onReset}
              pricingMode={pricingMode}
              compareMode={compareMode}
              mul={mul}
              cur={displayCurrency || 'HKD'}
            />
          ))}
        </TableBody>
        <tfoot>
          <tr className="border-t font-medium">
            <td className="py-2 px-4 text-xs" colSpan={6}>{t.common.total}</td>
            <td className="py-2 px-4 text-xs text-center" />
            <td className="py-2 px-4 text-center">
              {compareMode === 'vs_competitor' ? (
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${getDeltaColorClass(avgDeltaPct)}`}>
                  {avgDeltaPct >= 0 ? '+' : ''}{(avgDeltaPct * 100).toFixed(1)}%
                </span>
              ) : weightedMargin != null ? (
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${getMarginColorClass(weightedMargin)}`}>
                  {(weightedMargin * 100).toFixed(1)}%
                </span>
              ) : null}
            </td>
          </tr>
        </tfoot>
      </Table>
    </div>
  )
}

/** Color class for delta vs competitor: negative (cheaper) = green, positive (more expensive) = red */
function getDeltaColorClass(delta: number): string {
  if (delta <= -0.05) return 'text-green-700 bg-green-50'
  if (delta < 0) return 'text-green-600 bg-green-50'
  if (delta === 0) return 'text-gray-600 bg-gray-50'
  if (delta <= 0.05) return 'text-red-500 bg-red-50'
  return 'text-red-700 bg-red-50'
}

function MarginRow({
  row,
  index,
  editable,
  onFreightChange,
  onRegFeeChange,
  onReset,
  pricingMode,
  compareMode,
  mul = 1,
  cur = 'HKD',
}: {
  row: MarginVerificationRow
  index: number
  editable: boolean
  onFreightChange?: (index: number, newFreight: number) => void
  onRegFeeChange?: (index: number, newRegFee: number) => void
  onReset?: (index: number) => void
  pricingMode?: string
  compareMode: CompareMode
  mul?: number
  cur?: string
}) {
  const t = useT()
  const [editingField, setEditingField] = useState<'freight' | 'regfee' | null>(null)
  const [draft, setDraft] = useState('')

  function startEdit(field: 'freight' | 'regfee') {
    if (!editable) return
    setDraft(field === 'freight' ? row.my_freight.toFixed(2) : row.my_reg_fee.toFixed(2))
    setEditingField(field)
  }

  function commitEdit() {
    const val = parseFloat(draft)
    if (!isNaN(val) && val >= 0) {
      if (editingField === 'freight' && onFreightChange) {
        onFreightChange(index, val)
      } else if (editingField === 'regfee' && onRegFeeChange) {
        onRegFeeChange(index, val)
      }
    }
    setEditingField(null)
  }

  const marginColor = getMarginColorClass(row.margin_pct)
  const isOverride = row.is_manual_override

  const compLabels = { title: t.tooltips.competitorPrice, freight: t.tooltips.freight, regFee: t.tooltips.regFee }
  const costLabels = { title: t.tooltips.costDetail, a: t.segments.a, b: t.segments.b, c: t.segments.c, d: t.segments.d, bc: t.segments.bc, bcd: t.segments.bcd, b1: t.segments.b1, b2: t.segments.b2, b2c: t.segments.b2c }

  // Competitor price tooltip
  const competitorCell = row.competitor_price != null && row.competitor_rate_per_kg != null ? (
    <CostTooltip content={competitorTooltip(row.competitor_rate_per_kg, row.representative_weight, row.competitor_reg_fee ?? 0, row.competitor_price, compLabels, mul, cur)}>
      <span className="cursor-help border-b border-dotted border-muted-foreground/40">
        {(row.competitor_price * mul).toFixed(2)}
      </span>
    </CostTooltip>
  ) : (
    <span>{row.competitor_price != null ? (row.competitor_price * mul).toFixed(2) : '-'}</span>
  )

  // Cost tooltip
  const costCell = row.segment_breakdown ? (
    <CostTooltip content={costTooltip(row.segment_breakdown, row.my_cost, pricingMode, costLabels, mul, cur)}>
      <span className="cursor-help border-b border-dotted border-muted-foreground/40">
        {(row.my_cost * mul).toFixed(2)}
      </span>
    </CostTooltip>
  ) : (
    <span>{(row.my_cost * mul).toFixed(2)}</span>
  )

  function renderEditableCell(field: 'freight' | 'regfee', value: number) {
    if (editable && editingField === field) {
      return (
        <Input
          type="number"
          step="0.01"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setEditingField(null)
          }}
          onBlur={commitEdit}
          className="h-6 w-20 text-xs text-center"
          autoFocus
        />
      )
    }
    return (
      <span
        className={editable ? 'cursor-pointer hover:underline' : ''}
        onClick={() => startEdit(field)}
      >
        {(value * mul).toFixed(2)}
      </span>
    )
  }

  return (
    <TableRow>
      <TableCell className="text-xs font-medium py-1.5">{row.weight_bracket}</TableCell>
      <TableCell className="text-xs text-center font-mono py-1.5">
        {competitorCell}
      </TableCell>
      <TableCell className={`text-xs text-center font-mono py-1.5 ${isOverride ? 'bg-yellow-50' : ''}`}>
        {renderEditableCell('freight', row.my_freight)}
      </TableCell>
      <TableCell className={`text-xs text-center font-mono py-1.5 ${isOverride ? 'bg-yellow-50' : ''}`}>
        {renderEditableCell('regfee', row.my_reg_fee)}
      </TableCell>
      <TableCell className="text-xs text-center font-mono py-1.5 font-medium">
        {(row.my_price * mul).toFixed(2)}
        {isOverride && editable && onReset && (
          <Button
            variant="ghost"
            size="sm"
            className="h-4 text-[10px] text-muted-foreground ml-1 px-1"
            onClick={() => onReset(index)}
          >
            {t.common.reset}
          </Button>
        )}
      </TableCell>
      <TableCell className="text-xs text-center font-mono py-1.5">
        {costCell}
      </TableCell>
      {compareMode === 'vs_competitor' ? (() => {
        const cp = row.competitor_price ?? 0
        const deltaDollar = row.my_price - cp
        const deltaPct = cp > 0 ? deltaDollar / cp : 0
        const deltaColor = getDeltaColorClass(deltaPct)
        return (
          <>
            <TableCell className="text-xs text-center font-mono py-1.5">
              <span className={deltaPct <= 0 ? 'text-green-600' : 'text-red-500'}>
                {deltaDollar >= 0 ? '+' : ''}{(deltaDollar * mul).toFixed(2)}
              </span>
            </TableCell>
            <TableCell className="text-xs text-center py-1.5">
              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${deltaColor}`}>
                {deltaPct >= 0 ? '+' : ''}{(deltaPct * 100).toFixed(1)}%
              </span>
            </TableCell>
          </>
        )
      })() : (
        <>
          <TableCell className="text-xs text-center font-mono py-1.5">
            {(row.margin_amount * mul).toFixed(2)}
          </TableCell>
          <TableCell className="text-xs text-center py-1.5">
            <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${marginColor}`}>
              {(row.margin_pct * 100).toFixed(1)}%
            </span>
          </TableCell>
        </>
      )}
    </TableRow>
  )
}
