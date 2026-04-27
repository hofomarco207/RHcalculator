'use client'

import { useState, useCallback } from 'react'
import type { RateCardBracket } from '@/types'
import { updateBracketMargin } from '@/lib/calculations/scenario-pricing'
import { getMarginColorClass } from '@/lib/utils/margin'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { useT } from '@/lib/i18n'
import { CostTooltip } from './CostTooltip'

interface RateCardTableProps {
  brackets: RateCardBracket[]
  onBracketsChange?: (brackets: RateCardBracket[]) => void
}

type EditField = 'freight' | 'reg' | 'margin'

export function RateCardTable({ brackets, onBracketsChange }: RateCardTableProps) {
  const t = useT()
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  function editKey(idx: number, field: EditField) {
    return `${idx}-${field}`
  }

  const handleChange = useCallback((idx: number, field: EditField, value: string) => {
    setEditValues((prev) => ({ ...prev, [editKey(idx, field)]: value }))
  }, [])

  const handleBlur = useCallback(
    (idx: number, field: EditField) => {
      const key = editKey(idx, field)
      const raw = editValues[key]
      if (raw === undefined || !onBracketsChange) return

      const parsed = parseFloat(raw)
      if (isNaN(parsed)) {
        setEditValues((prev) => { const n = { ...prev }; delete n[key]; return n })
        return
      }

      if (field === 'margin') {
        // Desired margin → compute freight rate
        const b = brackets[idx]
        const desiredMargin = parsed / 100
        const targetRevenue = desiredMargin < 1 ? b.cost_hkd / (1 - desiredMargin) : b.cost_hkd * 2
        const newFreight = Math.ceil(Math.max(0, (targetRevenue - b.reg_fee_hkd) / b.representative_weight_kg))
        const updated = brackets.map((bracket, i) =>
          i === idx ? updateBracketMargin(bracket, newFreight) : bracket
        )
        onBracketsChange(updated)
      } else {
        if (parsed < 0) {
          setEditValues((prev) => { const n = { ...prev }; delete n[key]; return n })
          return
        }
        const updated = brackets.map((bracket, i) => {
          if (i !== idx) return bracket
          return field === 'freight'
            ? updateBracketMargin(bracket, parsed)
            : updateBracketMargin(bracket, bracket.freight_rate_hkd_per_kg, parsed)
        })
        onBracketsChange(updated)
      }
      setEditValues((prev) => { const n = { ...prev }; delete n[key]; return n })
    },
    [editValues, brackets, onBracketsChange]
  )

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">{t.common.weight}</TableHead>
            <TableHead className="text-center whitespace-nowrap">{t.common.weight} (KG)</TableHead>
            <TableHead className="text-center whitespace-nowrap">{t.verification.cost} (HKD)</TableHead>
            <TableHead className="text-center whitespace-nowrap">{t.verification.freight} (HKD/KG)</TableHead>
            <TableHead className="text-center whitespace-nowrap">{t.verification.regFee} (HKD)</TableHead>
            <TableHead className="text-center whitespace-nowrap">{t.verification.revenue} (HKD)</TableHead>
            <TableHead className="text-center whitespace-nowrap">{t.verification.margin}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {brackets.map((b, idx) => {
            const freightVal = editValues[editKey(idx, 'freight')] ?? b.freight_rate_hkd_per_kg.toFixed(2)
            const regVal = editValues[editKey(idx, 'reg')] ?? b.reg_fee_hkd.toFixed(0)
            const marginVal = editValues[editKey(idx, 'margin')] ?? (b.actual_margin * 100).toFixed(1)

            return (
              <TableRow key={b.weight_range}>
                <TableCell className="font-medium whitespace-nowrap">
                  {b.weight_range}
                  {b.is_manually_adjusted && (
                    <span className="ml-1.5 text-xs text-amber-600">✎</span>
                  )}
                </TableCell>
                <TableCell className="text-center font-mono">{b.representative_weight_kg}</TableCell>
                <TableCell className="text-center font-mono">
                  <CostTooltip
                    content={
                      <>
                        <span className="text-blue-400 font-semibold">成本 @ {b.representative_weight_kg}kg</span>
                        {'\n'}
                        由所選成本方案計算得出
                        {'\n'}
                        <span className="text-amber-400">= {b.cost_hkd.toFixed(2)} HKD</span>
                      </>
                    }
                  >
                    <span className="cursor-help">{b.cost_hkd.toFixed(2)}</span>
                  </CostTooltip>
                </TableCell>
                <TableCell className="text-center">
                  <Input
                    type="number"
                    className="h-7 w-24 text-center text-sm font-mono ml-auto"
                    value={freightVal}
                    onChange={(e) => handleChange(idx, 'freight', e.target.value)}
                    onBlur={() => handleBlur(idx, 'freight')}
                    step="1"
                    min="0"
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Input
                    type="number"
                    className="h-7 w-20 text-center text-sm font-mono ml-auto"
                    value={regVal}
                    onChange={(e) => handleChange(idx, 'reg', e.target.value)}
                    onBlur={() => handleBlur(idx, 'reg')}
                    step="1"
                    min="0"
                  />
                </TableCell>
                <TableCell className="text-center font-mono">
                  <CostTooltip
                    content={
                      <>
                        <span className="text-blue-400 font-semibold">營收 @ {b.representative_weight_kg}kg</span>
                        {'\n'}
                        運費 {b.freight_rate_hkd_per_kg.toFixed(2)} × {b.representative_weight_kg} = {(b.freight_rate_hkd_per_kg * b.representative_weight_kg).toFixed(2)}
                        {'\n'}
                        + 掛號費 {b.reg_fee_hkd.toFixed(2)}
                        {'\n'}
                        <span className="text-amber-400">= {Math.ceil(b.revenue_hkd)} HKD</span>
                        {b.cost_hkd > 0 && (
                          <>
                            {'\n'}
                            毛利 {(b.actual_margin * 100).toFixed(1)}% (成本 {b.cost_hkd.toFixed(2)})
                          </>
                        )}
                      </>
                    }
                  >
                    <span className="cursor-help">{Math.ceil(b.revenue_hkd)}</span>
                  </CostTooltip>
                </TableCell>
                <TableCell className="text-center">
                  <Input
                    type="number"
                    className={`h-7 w-20 text-center text-sm font-mono ml-auto ${getMarginColorClass(b.actual_margin)}`}
                    value={marginVal}
                    onChange={(e) => handleChange(idx, 'margin', e.target.value)}
                    onBlur={() => handleBlur(idx, 'margin')}
                    step="0.5"
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
