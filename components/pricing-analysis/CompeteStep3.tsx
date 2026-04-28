'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MarginVerificationTable } from '@/components/shared/MarginVerificationTable'
import { MarginGauge } from './MarginGauge'
import { useT } from '@/lib/i18n'
import { getVerdict } from '@/types/pricing-analysis'
import type { CompeteBracketResult } from '@/types/pricing-analysis'
import type { MarginVerificationRow } from '@/types/pricing-analysis'
import type { DisplayCurrency } from './CompeteTab'

interface CompeteStep3Props {
  brackets: CompeteBracketResult[]
  weightedMargin: number | null
  pricingMode: 'segmented' | 'bc_combined' | 'bcd_combined'
  displayCurrency: DisplayCurrency
  currencyMultiplier: number
  onNext: () => void
  onBack: () => void
}

export function CompeteStep3({ brackets, weightedMargin, pricingMode, displayCurrency, currencyMultiplier, onNext, onBack }: CompeteStep3Props) {
  const t = useT()
  const rows: MarginVerificationRow[] = brackets.map((b) => ({
    weight_bracket: b.weight_bracket,
    representative_weight: b.representative_weight,
    competitor_price: b.competitor_price,
    competitor_rate_per_kg: b.competitor_rate_per_kg,
    competitor_reg_fee: b.competitor_reg_fee,
    my_price: b.my_price,
    my_freight: b.my_freight,
    my_reg_fee: b.my_reg_fee,
    my_cost: b.my_cost,
    margin_amount: b.margin_amount,
    margin_pct: b.margin_pct,
    is_manual_override: b.is_manual_override,
    segment_breakdown: b.segment_breakdown,
  }))

  const avgMargin =
    brackets.length > 0
      ? brackets.reduce((s, b) => s + b.margin_pct, 0) / brackets.length
      : 0

  const displayMargin = weightedMargin ?? avgMargin

  const profitable = brackets.filter((b) => b.verdict === 'profitable').length
  const marginal = brackets.filter((b) => b.verdict === 'marginal').length
  const loss = brackets.filter((b) => b.verdict === 'loss').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 flex justify-center">
            <MarginGauge
              margin={displayMargin}
              verdict={getVerdict(displayMargin)}
              label={weightedMargin != null ? t.pricingAnalysis.compete.avgMargin : t.pricingAnalysis.compete.avgMargin}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-green-600">{profitable}</div>
            <div className="text-xs text-muted-foreground">{t.pricingAnalysis.compete.profitableBrackets}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-yellow-600">{marginal}</div>
            <div className="text-xs text-muted-foreground">{t.pricingAnalysis.compete.marginalBrackets}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-red-600">{loss}</div>
            <div className="text-xs text-muted-foreground">{t.pricingAnalysis.compete.lossBrackets}</div>
          </CardContent>
        </Card>
      </div>

      <MarginVerificationTable
        rows={rows}
        mode="compete"
        editable={false}
        weightedMargin={weightedMargin}
        pricingMode={pricingMode}
        displayCurrency={displayCurrency}
        currencyMultiplier={currencyMultiplier}
      />

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          {t.common.back}
        </Button>
        <Button onClick={onNext}>
          {t.common.next}
        </Button>
      </div>
    </div>
  )
}
