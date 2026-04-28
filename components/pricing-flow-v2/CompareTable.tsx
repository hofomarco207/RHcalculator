'use client'

import { useState } from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { SlotDef, BracketRow, CellValue, DraftCard } from '@/types/pricing-flow'
import type { CompetitorGroup, GlobalRateCard } from '@/types/pricing-flow'
import {
  getCellValue, compareTwo, fmtTwd, fmtPct,
  marginColorClass, diffColorClass,
} from './utils'

interface Props {
  slots: SlotDef[]
  activeSlots: SlotDef[]
  groups: CompetitorGroup[]
  ownCards: GlobalRateCard[]
  country: string
  rows: BracketRow[]
  scenarioCosts: Record<string, Record<string, number | null | undefined>>
  twdPerHkd: number
  draftCard?: DraftCard | null
}

export function CompareTable({
  activeSlots, groups, ownCards, country, rows, scenarioCosts, twdPerHkd, draftCard,
}: Props) {
  // Keys of the two columns selected for comparison (max 2, FIFO sliding window)
  const [compareKeys, setCompareKeys] = useState<string[]>([])

  function toggleCompareKey(key: string) {
    setCompareKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      if (prev.length >= 2) return [prev[1], key]  // drop oldest, add new
      return [...prev, key]
    })
  }

  if (!country || rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        請選擇目的國以顯示比對表
      </p>
    )
  }

  // Build column definitions
  const cols = activeSlots.map((s) => ({
    slot: s,
    isDraft: false,
  }))
  if (draftCard) {
    cols.push({
      slot: {
        key: 'draft' as SlotDef['key'],
        source: 'generated' as const,
        refId: '__draft__',
        label: draftCard.product_name || '新價卡',
      },
      isDraft: true,
    })
  }

  const showComparison = cols.length >= 2
  const twoSelected = compareKeys.length === 2

  return (
    <div className="overflow-auto">
      {!twoSelected && cols.length >= 2 && (
        <p className="text-xs text-muted-foreground mb-2">
          點擊欄位標題選取兩欄進行比對
        </p>
      )}
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className="w-20 sticky left-0 bg-background z-10">重量</TableHead>
            {cols.map(({ slot, isDraft }) => {
              const selected = compareKeys.includes(slot.key)
              return (
                <TableHead
                  key={slot.key}
                  className={`text-center min-w-28 cursor-pointer select-none transition-colors
                    ${selected
                      ? 'bg-primary/8 outline outline-2 outline-primary/50 outline-offset-[-2px]'
                      : 'hover:bg-muted/40'
                    }`}
                  onClick={() => toggleCompareKey(slot.key)}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-medium truncate max-w-[140px]">{slot.label}</span>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={isDraft ? 'default' : slot.source === 'scenario' ? 'secondary' : 'outline'}
                        className="text-[9px] px-1"
                      >
                        {isDraft ? '新價卡' : slot.source === 'competitor' ? '競對' : slot.source === 'generated' ? '現行卡' : '成本'}
                      </Badge>
                      {selected && (
                        <span className="text-[9px] font-bold text-primary">
                          {compareKeys.indexOf(slot.key) === 0 ? 'A' : 'B'}
                        </span>
                      )}
                    </div>
                  </div>
                </TableHead>
              )
            })}
            {showComparison && (
              <TableHead className="text-center min-w-24">
                {twoSelected ? 'A vs B' : '比較'}
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const cells = cols.map(({ slot, isDraft }) => {
              if (isDraft && draftCard) {
                return getDraftCellValue(draftCard, country, row.representative_weight)
              }
              const scenCostHkd = slot.source === 'scenario'
                ? (scenarioCosts[slot.key]?.[row.label] ?? null)
                : undefined
              return getCellValue(slot, groups, ownCards, country, row.representative_weight, scenCostHkd, twdPerHkd)
            })

            const compMetrics = twoSelected
              ? computeSelectedComparison(cells, cols.map((c) => c.slot), compareKeys)
              : []

            return (
              <TableRow key={row.label}>
                <TableCell className="font-mono sticky left-0 bg-background z-10 font-medium">
                  {row.label}
                </TableCell>
                {cells.map((cell, i) => (
                  <TableCell key={cols[i].slot.key} className="text-center">
                    <CellDisplay cell={cell} />
                  </TableCell>
                ))}
                {showComparison && (
                  <TableCell className="text-center">
                    {twoSelected
                      ? <ComparisonDisplay metrics={compMetrics} />
                      : <span className="text-muted-foreground/40 text-[10px]">—</span>
                    }
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ─── Cell display ─────────────────────────────────────────────────────────────

function CellDisplay({ cell }: { cell: CellValue }) {
  if (cell.value_twd == null) {
    return <span className="text-muted-foreground italic">無提供</span>
  }
  return (
    <span className={`font-mono ${cell.is_cost ? 'text-blue-600' : ''}`}>
      {fmtTwd(cell.value_twd)}
    </span>
  )
}

// ─── Comparison display ───────────────────────────────────────────────────────

interface CompMetricItem {
  label: string
  pct: number
  colorClass: string
}

function ComparisonDisplay({ metrics }: { metrics: CompMetricItem[] }) {
  if (metrics.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-col gap-0.5">
      {metrics.map((m, i) => (
        <span key={i} className={`font-mono text-[10px] ${m.colorClass}`}>{m.label}</span>
      ))}
    </div>
  )
}

// ─── User-selected column comparison ─────────────────────────────────────────

function computeSelectedComparison(
  cells: CellValue[],
  colSlots: SlotDef[],
  compareKeys: string[],
): CompMetricItem[] {
  if (compareKeys.length < 2) return []
  const ai = colSlots.findIndex((s) => s.key === compareKeys[0])
  const bi = colSlots.findIndex((s) => s.key === compareKeys[1])
  if (ai < 0 || bi < 0) return []
  const metric = compareTwo(cells[ai], cells[bi])
  if (!metric) return []
  const colorClass = metric.type === 'margin'
    ? marginColorClass(metric.pct)
    : diffColorClass(-metric.pct)
  return [{ label: metric.label, pct: metric.pct, colorClass }]
}

// ─── Draft card cell ──────────────────────────────────────────────────────────

function getDraftCellValue(draft: DraftCard, country: string, repWeight: number): CellValue {
  const cb = draft.country_brackets.find((c) => c.country_code === country)
  if (!cb) return { value_twd: null, is_cost: false }
  const b = cb.brackets.find(
    (b) => repWeight > b.weight_min && repWeight <= b.weight_max,
  ) ?? cb.brackets[cb.brackets.length - 1]
  if (!b) return { value_twd: null, is_cost: false }
  return { value_twd: b.rate_per_kg * repWeight + b.reg_fee, is_cost: false }
}
