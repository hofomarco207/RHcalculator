'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CompeteStep2Margin } from './CompeteStep2Margin'
import type { CompetitorBracketPrice } from '@/types/pricing-analysis'
import type { RateCardBracket } from '@/types'
import type { BracketCost } from '@/types/scenario'

export type Step2Mode = 'follow' | 'margin'

export type Step2Result =
  | { mode: 'follow'; adjustmentPct: number }
  | { mode: 'margin'; generatedBrackets: RateCardBracket[]; noRegFee: boolean }

interface CompeteStep2Props {
  competitorPrices: CompetitorBracketPrice[]
  scenarioCosts: BracketCost[]
  onNext: (result: Step2Result) => void
  onBack: () => void
}

export function CompeteStep2({ competitorPrices, scenarioCosts, onNext, onBack }: CompeteStep2Props) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<Step2Mode>('follow')

  // ── Tab A: Follow mode state ──
  const [adjustPctStr, setAdjustPctStr] = useState('0')
  const adjustPct = parseFloat(adjustPctStr) || 0
  const adjustDecimal = -adjustPct / 100 // UI: "便宜3%" → internal: -0.03

  // Preview with middle bracket
  const previewBracket = competitorPrices[Math.floor(competitorPrices.length / 2)]

  const cRate = previewBracket?.rate_per_kg ?? 0
  const cRegFee = previewBracket?.reg_fee ?? 0
  const repW = previewBracket?.representative_weight ?? 0

  const myRate = cRate * (1 + adjustDecimal)
  const myFreight = myRate * repW
  const myTotal = myFreight + cRegFee
  const cTotal = cRate * repW + cRegFee

  const handleFollowNext = () => {
    onNext({ mode: 'follow', adjustmentPct: adjustDecimal })
  }

  const handleMarginGenerate = (brackets: RateCardBracket[], noRegFee: boolean) => {
    onNext({ mode: 'margin', generatedBrackets: brackets, noRegFee })
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Step2Mode)}>
        <TabsList className="w-full">
          <TabsTrigger value="follow" className="flex-1">
            {t.pricingAnalysis.step2.followTab}
          </TabsTrigger>
          <TabsTrigger value="margin" className="flex-1">
            {t.pricingAnalysis.step2.marginTab}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab A: Follow competitor pricing ── */}
        <TabsContent value="follow">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-1.5 max-w-sm">
                <Label className="text-sm font-medium">{t.pricingAnalysis.step2.title}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.5"
                    value={adjustPctStr}
                    onChange={(e) => setAdjustPctStr(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.pricingAnalysis.step2.helperText}
                </p>
              </div>

              {previewBracket && (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">
                    {t.pricingAnalysis.step2.preview} ({previewBracket.weight_bracket}, {repW} kg)
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <span className="text-muted-foreground">{t.pricingAnalysis.step2.competitorRate}</span>
                    <span className="font-mono">{cRate.toFixed(2)} HKD/kg</span>
                    <span className="text-muted-foreground">{t.pricingAnalysis.step2.myRate}</span>
                    <span className="font-mono">
                      {myRate.toFixed(2)} HKD/kg
                      {adjustPct !== 0 && (
                        <span className={`ml-2 text-xs ${adjustPct > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          ({adjustPct > 0 ? '-' : '+'}{Math.abs(adjustPct)}%)
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">{t.pricingAnalysis.step2.myFreight}</span>
                    <span className="font-mono">{myRate.toFixed(2)} × {repW} = {myFreight.toFixed(2)}</span>
                    <span className="text-muted-foreground">{t.verification.regFee}</span>
                    <span className="font-mono">{cRegFee.toFixed(2)} {t.pricingAnalysis.step2.regFeeUnchanged}</span>
                    <span className="text-muted-foreground font-medium">{t.pricingAnalysis.step2.myPrice}</span>
                    <span className="font-mono font-medium">{myTotal.toFixed(2)} HKD</span>
                    <span className="text-muted-foreground">{t.pricingAnalysis.step2.competitorPrice}</span>
                    <span className="font-mono">{cTotal.toFixed(2)} HKD</span>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={onBack}>
                  {t.common.back}
                </Button>
                <Button onClick={handleFollowNext}>
                  {t.pricingAnalysis.step2.applyAndView}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab B: Margin-based pricing ── */}
        <TabsContent value="margin">
          <CompeteStep2Margin
            scenarioCosts={scenarioCosts}
            onGenerate={handleMarginGenerate}
            onBack={onBack}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
