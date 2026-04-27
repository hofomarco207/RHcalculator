'use client'

import { useState, useMemo, useCallback } from 'react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getRegFee } from '@/lib/calculations/scenario-pricing'
import { getMarginColorClass } from '@/lib/utils/margin'
import type { RateCardBracket } from '@/types'
import type { BracketCost } from '@/types/scenario'

interface CompeteStep2MarginProps {
  scenarioCosts: BracketCost[]
  onGenerate: (brackets: RateCardBracket[], noRegFee: boolean) => void
  onBack: () => void
}

export function CompeteStep2Margin({ scenarioCosts, onGenerate, onBack }: CompeteStep2MarginProps) {
  const t = useT()
  const [globalMargin, setGlobalMargin] = useState(20)
  const [noRegFee, setNoRegFee] = useState(false)
  const [perBracketMargins, setPerBracketMargins] = useState<Map<number, number>>(new Map())
  const [showPerBracket, setShowPerBracket] = useState(false)

  const applyGlobalToAll = useCallback(() => {
    setPerBracketMargins(new Map())
  }, [])

  const handlePerBracketChange = useCallback((index: number, value: string) => {
    const num = parseFloat(value)
    setPerBracketMargins(prev => {
      const m = new Map(prev)
      if (isNaN(num) || value === '') {
        m.delete(index)
      } else {
        m.set(index, num)
      }
      return m
    })
  }, [])

  // Preview generated brackets
  const previewBrackets: RateCardBracket[] = useMemo(() => {
    return scenarioCosts.map((sc, i) => {
      const targetMarginPct = perBracketMargins.get(i) ?? globalMargin
      const targetMargin = targetMarginPct / 100
      const cost = sc.cost_hkd
      const regFee = noRegFee ? 0 : getRegFee(sc.representative_weight_kg)
      const revenue = targetMargin < 1 ? cost / (1 - targetMargin) : cost * 2
      const freightRate = Math.max(0, (revenue - regFee) / sc.representative_weight_kg)
      const actualRevenue = freightRate * sc.representative_weight_kg + regFee
      const actualMargin = actualRevenue > 0 ? (actualRevenue - cost) / actualRevenue : 0

      return {
        weight_range: sc.weight_range,
        weight_min_kg: sc.weight_min_kg,
        weight_max_kg: sc.weight_max_kg,
        representative_weight_kg: sc.representative_weight_kg,
        cost_hkd: cost,
        freight_rate_hkd_per_kg: Math.round(freightRate * 100) / 100,
        reg_fee_hkd: regFee,
        revenue_hkd: actualRevenue,
        actual_margin: actualMargin,
        is_manually_adjusted: perBracketMargins.has(i),
      }
    })
  }, [scenarioCosts, globalMargin, perBracketMargins, noRegFee])

  // Summary stats
  const avgMargin = useMemo(() => {
    if (previewBrackets.length === 0) return 0
    return previewBrackets.reduce((s, b) => s + b.actual_margin, 0) / previewBrackets.length
  }, [previewBrackets])

  // Sample middle bracket for quick preview
  const midIdx = Math.floor(previewBrackets.length / 2)
  const midBracket = previewBrackets[midIdx]

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Global margin input */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t.pricingAnalysis.step2.targetMargin}</Label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="1"
                  min={0}
                  max={99}
                  value={globalMargin}
                  onChange={(e) => setGlobalMargin(parseFloat(e.target.value) || 0)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              {showPerBracket && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={applyGlobalToAll}>
                  {t.pricingAnalysis.step2.applyToAll}
                </Button>
              )}
            </div>
          </div>

          {/* No reg fee toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="margin-no-regfee"
              checked={noRegFee}
              onCheckedChange={(v) => setNoRegFee(v === true)}
            />
            <label htmlFor="margin-no-regfee" className="text-sm cursor-pointer">
              {t.pricingAnalysis.step4.noRegFee}
            </label>
            <span className="text-xs text-muted-foreground">
              {t.pricingAnalysis.step4.noRegFeeHint}
            </span>
          </div>

          {/* Per-bracket toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="per-bracket-toggle"
              checked={showPerBracket}
              onCheckedChange={(v) => {
                setShowPerBracket(v === true)
                if (!v) setPerBracketMargins(new Map())
              }}
            />
            <label htmlFor="per-bracket-toggle" className="text-sm cursor-pointer">
              {t.pricingAnalysis.step2.perBracketMargin}
            </label>
          </div>

          {/* Per-bracket margin table */}
          {showPerBracket && (
            <div className="border rounded-lg overflow-auto max-h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-28">{t.verification.weight}</TableHead>
                    <TableHead className="text-xs w-20">{t.pricingAnalysis.step2.targetMargin} %</TableHead>
                    <TableHead className="text-xs">{t.pricingAnalysis.compete.myCost}</TableHead>
                    <TableHead className="text-xs">{t.pricingAnalysis.step2.revenue}</TableHead>
                    <TableHead className="text-xs">{t.pricingAnalysis.step2.actualMargin}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewBrackets.map((b, i) => {
                    const isCustom = perBracketMargins.has(i)
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs py-1">
                          {b.representative_weight_kg} kg
                        </TableCell>
                        <TableCell className="py-1">
                          <Input
                            type="number"
                            step="1"
                            min={0}
                            max={99}
                            value={isCustom ? perBracketMargins.get(i) : ''}
                            placeholder={String(globalMargin)}
                            onChange={(e) => handlePerBracketChange(i, e.target.value)}
                            className="h-7 w-16 text-xs font-mono"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs py-1">
                          {b.cost_hkd.toFixed(2)}
                        </TableCell>
                        <TableCell className="font-mono text-xs py-1">
                          {b.revenue_hkd.toFixed(2)}
                        </TableCell>
                        <TableCell className={`font-mono text-xs py-1 ${getMarginColorClass(b.actual_margin)}`}>
                          {(b.actual_margin * 100).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Quick preview */}
          {midBracket && !showPerBracket && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">
                {t.pricingAnalysis.step2.preview} ({midBracket.weight_range}, {midBracket.representative_weight_kg} kg)
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <span className="text-muted-foreground">{t.pricingAnalysis.compete.myCost}</span>
                <span className="font-mono">{midBracket.cost_hkd.toFixed(2)} HKD</span>
                <span className="text-muted-foreground">{t.verification.ratePerKg}</span>
                <span className="font-mono">{midBracket.freight_rate_hkd_per_kg.toFixed(2)} HKD/kg</span>
                <span className="text-muted-foreground">{t.verification.regFee}</span>
                <span className="font-mono">{midBracket.reg_fee_hkd.toFixed(2)} HKD</span>
                <span className="text-muted-foreground font-medium">{t.pricingAnalysis.step2.revenue}</span>
                <span className="font-mono font-medium">{midBracket.revenue_hkd.toFixed(2)} HKD</span>
                <span className="text-muted-foreground">{t.common.margin}</span>
                <span className={`font-mono font-medium ${getMarginColorClass(midBracket.actual_margin)}`}>
                  {(midBracket.actual_margin * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )}

          {/* Average margin */}
          <div className="text-sm">
            <span className="text-muted-foreground">{t.pricingAnalysis.step2.avgMargin}: </span>
            <span className={`font-mono font-medium ${getMarginColorClass(avgMargin)}`}>
              {(avgMargin * 100).toFixed(1)}%
            </span>
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={onBack}>
              {t.common.back}
            </Button>
            <Button onClick={() => onGenerate(previewBrackets, noRegFee)}>
              {t.pricingAnalysis.step2.generateAndCalc}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
