'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCountry } from '@/lib/context/country-context'
import { useT } from '@/lib/i18n'
import { MarginGauge } from './MarginGauge'
import { getVerdict } from '@/types/pricing-analysis'
import type { CompeteBracketResult, CompetitorBracketPrice } from '@/types/pricing-analysis'
import { exportCompeteRateCard } from '@/lib/excel/compete-exporter'
import type { DisplayCurrency } from './CompeteTab'

interface CompeteStep5Props {
  brackets: CompeteBracketResult[]
  competitorPrices: CompetitorBracketPrice[]
  adjustmentPct: number
  step2Mode: 'follow' | 'margin'
  scenarioId: string
  competitorName: string
  noRegFee: boolean
  displayCurrency: DisplayCurrency
  currencyMultiplier: number
  onBack: () => void
}

export function CompeteStep5({
  brackets,
  competitorPrices,
  adjustmentPct,
  step2Mode,
  scenarioId,
  competitorName,
  noRegFee,
  displayCurrency,
  currencyMultiplier,
  onBack,
}: CompeteStep5Props) {
  const { country } = useCountry()
  const t = useT()
  const mul = currencyMultiplier
  const [cardName, setCardName] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  const overrideCount = brackets.filter((b) => b.is_manual_override).length
  const avgMargin = brackets.length > 0
    ? brackets.reduce((s, b) => s + b.margin_pct, 0) / brackets.length
    : 0

  const profitableCount = brackets.filter((b) => b.verdict === 'profitable').length
  const lossCount = brackets.filter((b) => b.verdict === 'loss').length

  async function handleSave() {
    if (!cardName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/compete/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cardName.trim(),
          scenario_id: scenarioId,
          country_code: country,
          competitor_name: competitorName || undefined,
          adjustment_pct: adjustmentPct,
          brackets,
          competitor_prices: competitorPrices,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || t.pricingAnalysis.step5.saveFailed)
        return
      }
      const data = await res.json()
      setSavedId(data.id)
      toast.success(t.pricingAnalysis.step5.cardSaved)
    } catch {
      toast.error(t.pricingAnalysis.step4.networkError)
    } finally {
      setSaving(false)
    }
  }

  function handleExport() {
    exportCompeteRateCard({
      name: cardName || 'Compete Rate Card',
      country,
      brackets,
      priceUnit: 'per_ticket',
    })
    toast.success(t.pricingAnalysis.step5.excelDownloaded)
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="text-sm font-medium">{t.pricingAnalysis.step5.summary}</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <MarginGauge margin={avgMargin} verdict={getVerdict(avgMargin)} label={t.pricingAnalysis.compete.avgMargin} />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.pricingAnalysis.step5.benchmark}</span>
                <span className="font-mono text-xs">{competitorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.pricingAnalysis.step5.adjustment}</span>
                <span className="font-mono">
                  {step2Mode === 'margin'
                    ? t.pricingAnalysis.step2.marginTab
                    : adjustmentPct === 0
                      ? t.pricingAnalysis.step5.matchPrice
                      : `${(adjustmentPct * -100).toFixed(1)}%`
                  }
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.pricingAnalysis.step5.manualOverrides}</span>
                <span className="font-mono">{overrideCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.pricingAnalysis.step5.regFeeUsage}</span>
                <span>{noRegFee ? t.pricingAnalysis.step5.regFeeOff : t.pricingAnalysis.step5.regFeeOn}</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.pricingAnalysis.step5.profitableBrackets}</span>
                <span className="font-mono text-green-600">{profitableCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.pricingAnalysis.step5.lossBrackets}</span>
                <span className="font-mono text-red-600">{lossCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.pricingAnalysis.step5.totalBrackets}</span>
                <span className="font-mono">{brackets.length}</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{t.common.weight}</span>
                <span>{t.verification.freight} + {t.verification.regFee} = {t.verification.price} ({displayCurrency})</span>
              </div>
              {brackets.map((b) => (
                <div key={b.weight_bracket} className="flex justify-between">
                  <span className="text-muted-foreground text-xs">{b.weight_bracket}</span>
                  <span className="font-mono text-xs">
                    {(b.my_freight * currencyMultiplier).toFixed(2)} + {(b.my_reg_fee * currencyMultiplier).toFixed(0)} = {(b.my_price * currencyMultiplier).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save form */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="space-y-1.5 max-w-sm">
            <Label className="text-xs">{t.pricingAnalysis.step5.rateCardName}</Label>
            <Input
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder={`${country} ${competitorName} ${step2Mode === 'margin' ? t.pricingAnalysis.step2.marginTab : adjustmentPct === 0 ? '' : `${(adjustmentPct * -100).toFixed(0)}%`}`}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving || !cardName.trim() || !!savedId}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {savedId ? t.pricingAnalysis.step5.saved : t.pricingAnalysis.step5.saveAsMyCard}
            </Button>
            <Button variant="outline" onClick={handleExport}>
              {t.pricingAnalysis.step5.exportClientExcel}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          {t.pricingAnalysis.step5.backToAdjust}
        </Button>
      </div>
    </div>
  )
}
