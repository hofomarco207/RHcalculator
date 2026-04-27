'use client'

import { useState, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { MarginVerificationTable } from '@/components/shared/MarginVerificationTable'
import { MarginGauge } from './MarginGauge'
import { useT } from '@/lib/i18n'
import {
  CostTooltip,
  scenarioSegATooltip,
  scenarioSegBTooltip,
  scenarioSegCTooltip,
  scenarioSegBCTooltip,
  scenarioSegDTooltip,
  scenarioSegB2Tooltip,
  scenarioSegB2CTooltip,
} from '@/components/rate-card/CostTooltip'
import { getVerdict } from '@/types/pricing-analysis'
import { getMarginColorClass } from '@/lib/utils/margin'
import { VERIFICATION_WEIGHTS } from '@/types'
import type { CompareMode } from '@/components/shared/MarginVerificationTable'
import type { CompeteBracketResult, CompetitorBracketPrice, MarginVerificationRow } from '@/types/pricing-analysis'
import type { BracketCost, BracketDetail } from '@/types/scenario'
import type { DisplayCurrency } from './CompeteTab'

interface CompeteStep4Props {
  brackets: CompeteBracketResult[]
  competitorPrices: CompetitorBracketPrice[]
  adjustmentPct: number
  scenarioId: string
  pricingMode: 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c'
  weightedMargin: number | null
  noRegFee: boolean
  weightStep: number
  displayCurrency: DisplayCurrency
  currencyMultiplier: number
  onNoRegFeeChange: (v: boolean) => void
  onFreightChange: (index: number, newFreight: number) => void
  onRegFeeChange: (index: number, newRegFee: number) => void
  onReset: (index: number) => void
  onResetAll: () => void
  overrideCount: number
  onNext: () => void
  onBack: () => void
}

interface FullVerificationRow {
  kg: number
  ozLb: number
  competitorPrice: number
  myFreight: number
  myRegFee: number
  myPrice: number
  myCost: number
  marginPct: number
  segA: number
  segB: number
  segC: number
  segD: number
  segBC: number
  segB2: number
  segB2C: number
  detail: BracketDetail | null
}

const PAGE_SIZE = 20

export function CompeteStep4({
  brackets,
  competitorPrices,
  adjustmentPct,
  scenarioId,
  pricingMode,
  weightedMargin,
  noRegFee,
  weightStep,
  displayCurrency,
  currencyMultiplier,
  onNoRegFeeChange,
  onFreightChange,
  onRegFeeChange,
  onReset,
  onResetAll,
  overrideCount,
  onNext,
  onBack,
}: CompeteStep4Props) {
  const t = useT()
  const [verificationCosts, setVerificationCosts] = useState<BracketCost[] | null>(null)
  const [loadingVerification, setLoadingVerification] = useState(false)
  const [verificationError, setVerificationError] = useState('')
  const [showVerification, setShowVerification] = useState(false)
  const [page, setPage] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [bigTableCompareMode, setBigTableCompareMode] = useState<CompareMode>('vs_cost')

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

  const displayMargin = weightedMargin ?? (brackets.length > 0
    ? brackets.reduce((s, b) => s + b.margin_pct, 0) / brackets.length
    : 0)

  // Find matching bracket for a weight
  const findBracketIndex = useCallback((weightKg: number): number => {
    for (let i = 0; i < competitorPrices.length; i++) {
      if (weightKg > competitorPrices[i].weight_min && weightKg <= competitorPrices[i].weight_max) {
        return i
      }
    }
    return competitorPrices.length - 1
  }, [competitorPrices])

  const handleGenerateVerification = useCallback(async () => {
    setLoadingVerification(true)
    setVerificationError('')
    try {
      const verificationWeightPoints = VERIFICATION_WEIGHTS.map((w, i, arr) => ({
        weight_bracket: `${w.kg}kg`,
        weight_min: i === 0 ? 0 : arr[i - 1].kg,
        weight_max: w.kg,
        representative_weight: w.kg,
        price: 0,
        rate_per_kg: 0,
        reg_fee: 0,
      }))

      const res = await fetch('/api/compete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitor_prices: verificationWeightPoints,
          price_unit: 'per_ticket',
          scenario_id: scenarioId,
          adjustment_pct: 0,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setVerificationError(err.error || t.pricingAnalysis.step4.calcFailed)
        return
      }

      const result = await res.json()
      setVerificationCosts(result.scenario_costs)
      setShowVerification(true)
      setPage(0)
    } catch {
      setVerificationError(t.pricingAnalysis.step4.networkError)
    } finally {
      setLoadingVerification(false)
    }
  }, [scenarioId])

  // Build full verification rows using bracket freight rates
  const fullVerificationRows: FullVerificationRow[] = useMemo(() => {
    if (!verificationCosts) return []
    return VERIFICATION_WEIGHTS.map((w, i) => {
      const cost = verificationCosts[i]
      if (!cost) return null

      const bracketIdx = findBracketIndex(w.kg)
      const bracket = brackets[bracketIdx]
      const cp = competitorPrices[bracketIdx]
      if (!bracket || !cp) return null

      // ECMS-style weight step rounding: ceil to nearest step
      const chargedWeight = weightStep > 0 ? Math.ceil(w.kg / weightStep) * weightStep : w.kg
      const competitorPrice = cp.rate_per_kg * chargedWeight + cp.reg_fee
      // Use same freight rate as the bracket
      const myFreight = bracket.my_freight_rate * w.kg
      const myRegFee = noRegFee ? 0 : bracket.my_reg_fee
      const myPrice = myFreight + myRegFee
      const myCost = cost.cost_hkd
      const marginPct = myPrice > 0 ? (myPrice - myCost) / myPrice : -Infinity

      return {
        kg: w.kg,
        ozLb: w.ozLb,
        competitorPrice: Math.round(competitorPrice * 100) / 100,
        myFreight: Math.round(myFreight * 100) / 100,
        myRegFee: Math.round(myRegFee * 100) / 100,
        myPrice: Math.round(myPrice * 100) / 100,
        myCost: Math.round(myCost * 100) / 100,
        marginPct,
        segA: cost.seg_a,
        segB: cost.seg_b,
        segC: cost.seg_c,
        segD: cost.seg_d,
        segBC: cost.seg_bc ?? 0,
        segB2: cost.seg_b2 ?? 0,
        segB2C: cost.seg_b2c ?? 0,
        detail: cost.detail ?? null,
      }
    }).filter((r): r is FullVerificationRow => r !== null)
  }, [verificationCosts, brackets, competitorPrices, findBracketIndex, noRegFee, weightStep])

  const mul = currencyMultiplier
  const cur = displayCurrency || 'HKD'
  const isBCDCombined = pricingMode === 'bcd_combined'
  const isBCCombined = pricingMode === 'bc_combined'
  const isMultiB = pricingMode === 'multi_b'
  const isMultiBB2C = pricingMode === 'multi_b_b2c'
  const totalPages = Math.ceil(fullVerificationRows.length / PAGE_SIZE)
  const displayVerificationRows = showAll
    ? fullVerificationRows
    : fullVerificationRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Summary + controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 flex justify-center">
            <MarginGauge margin={displayMargin} verdict={getVerdict(displayMargin)} label={t.pricingAnalysis.step4.liveMargin} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex flex-col items-center justify-center">
            <div className="text-2xl font-bold text-foreground">{overrideCount}</div>
            <div className="text-xs text-muted-foreground">{t.pricingAnalysis.step4.overrideBrackets}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex flex-col items-center justify-center">
            {overrideCount > 0 && (
              <Button variant="outline" size="sm" className="text-xs" onClick={onResetAll}>
                {t.pricingAnalysis.step4.resetAll}
              </Button>
            )}
            <div className="text-xs text-muted-foreground mt-1">{t.pricingAnalysis.step4.editHint}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex flex-col items-center justify-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={noRegFee}
                onChange={(e) => onNoRegFeeChange(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-xs">{t.pricingAnalysis.step4.noRegFee}</span>
            </label>
            {noRegFee && (
              <span className="text-xs text-muted-foreground mt-1">{t.pricingAnalysis.step4.noRegFeeHint}</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Editable bracket table */}
      <MarginVerificationTable
        rows={rows}
        mode="compete"
        editable
        onFreightChange={onFreightChange}
        onRegFeeChange={onRegFeeChange}
        onReset={onReset}
        weightedMargin={weightedMargin}
        pricingMode={pricingMode}
        displayCurrency={displayCurrency}
        currencyMultiplier={currencyMultiplier}
      />

      {/* Big verification table toggle */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={handleGenerateVerification} disabled={loadingVerification}>
          {loadingVerification && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {showVerification ? t.pricingAnalysis.step4.regenerateBigTable : t.pricingAnalysis.step4.generateBigTable}
        </Button>
        {showVerification && (
          <Button variant="ghost" size="sm" onClick={() => setShowVerification(false)} className="text-xs">
            {t.pricingAnalysis.step4.collapse}
          </Button>
        )}
        {verificationError && <span className="text-xs text-red-500">{verificationError}</span>}
      </div>

      {/* Full 80+ weight verification table */}
      {showVerification && fullVerificationRows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{t.pricingAnalysis.step4.bigTableTitle}（{fullVerificationRows.length} {t.pricingAnalysis.step4.weightPoints}）</h3>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">{t.pricingAnalysis.step3.compareLabel}:</span>
              <button
                onClick={() => setBigTableCompareMode('vs_cost')}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  bigTableCompareMode === 'vs_cost'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-input hover:bg-accent'
                }`}
              >
                {t.pricingAnalysis.step3.vsCost}
              </button>
              <button
                onClick={() => setBigTableCompareMode('vs_competitor')}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  bigTableCompareMode === 'vs_competitor'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-input hover:bg-accent'
                }`}
              >
                {t.pricingAnalysis.step3.vsCompetitor}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/60 border-b">
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{t.common.weight}</th>
                  <th className="px-3 py-2.5 text-center font-medium text-muted-foreground whitespace-nowrap">OZ/LB</th>
                  <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">{t.segments.a}</th>
                  {isBCDCombined ? (
                    <th className="px-3 py-2.5 text-center font-medium text-teal-500 whitespace-nowrap">{t.segments.bcd}</th>
                  ) : isBCCombined ? (
                    <>
                      <th className="px-3 py-2.5 text-center font-medium text-teal-500 whitespace-nowrap">{t.segments.bc}</th>
                      <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">{t.segments.d}</th>
                    </>
                  ) : isMultiB ? (
                    <>
                      <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">{t.segments.b1}</th>
                      <th className="px-3 py-2.5 text-center font-medium text-sky-500 whitespace-nowrap">{t.segments.b2}</th>
                      <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">{t.segments.c}</th>
                      <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">{t.segments.d}</th>
                    </>
                  ) : isMultiBB2C ? (
                    <>
                      <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">{t.segments.b1}</th>
                      <th className="px-3 py-2.5 text-center font-medium text-teal-500 whitespace-nowrap">{t.segments.b2c}</th>
                      <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">{t.segments.d}</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">{t.segments.b}</th>
                      <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">{t.segments.c}</th>
                      <th className="px-3 py-2.5 text-center font-medium text-blue-500 whitespace-nowrap">{t.segments.d}</th>
                    </>
                  )}
                  <th className="px-3 py-2.5 text-center font-medium text-amber-500 whitespace-nowrap">{t.pricingAnalysis.step4.totalCost}</th>
                  <th className="px-3 py-2.5 text-center font-medium text-orange-500 whitespace-nowrap">{t.pricingAnalysis.step4.competitorShort}</th>
                  <th className="px-3 py-2.5 text-center font-medium text-purple-500 whitespace-nowrap">{t.verification.freight}</th>
                  <th className="px-3 py-2.5 text-center font-medium text-purple-500 whitespace-nowrap">{t.verification.regFee}</th>
                  <th className="px-3 py-2.5 text-center font-medium text-emerald-500 whitespace-nowrap">{t.pricingAnalysis.step4.myQuote}</th>
                  <th className="px-3 py-2.5 text-center font-medium text-muted-foreground whitespace-nowrap">
                    {bigTableCompareMode === 'vs_competitor' ? t.pricingAnalysis.step3.deltaPct : t.common.margin}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayVerificationRows.map((row, idx) => (
                  <tr
                    key={`vw-${row.kg}`}
                    className={`border-b last:border-0 hover:bg-muted/30 ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}
                  >
                    <td className="px-3 py-1.5 font-mono text-xs font-semibold">{row.kg}</td>
                    <td className="px-3 py-1.5 text-center text-muted-foreground font-mono text-xs">
                      {row.ozLb} {row.kg <= 0.45 ? 'oz' : 'lb'}
                    </td>
                    {/* A段 */}
                    <td className="px-3 py-1.5 text-center font-mono text-xs">
                      <CostTooltip content={row.detail
                        ? scenarioSegATooltip(row.detail.seg_a, row.segA, mul, cur)
                        : <><span className="text-blue-400 font-semibold">{t.segments.aFull}</span>{'\n'}<span className="text-amber-400">= {(row.segA * mul).toFixed(2)} {cur}</span></>
                      }>
                        <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segA * mul).toFixed(2)}</span>
                      </CostTooltip>
                    </td>
                    {isBCDCombined ? (
                      /* {t.segments.bcdFull} — cost in segD */
                      <td className="px-3 py-1.5 text-center font-mono text-xs">
                        <CostTooltip content={row.detail
                          ? scenarioSegDTooltip(row.detail.seg_d, row.segD, mul, cur)
                          : <><span className="text-teal-400 font-semibold">{t.segments.bcdFull}</span>{'\n'}<span className="text-amber-400">= {(row.segD * mul).toFixed(2)} {cur}</span></>
                        }>
                          <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segD * mul).toFixed(2)}</span>
                        </CostTooltip>
                      </td>
                    ) : isBCCombined ? (
                      <>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">
                          <CostTooltip content={row.detail?.seg_bc
                            ? scenarioSegBCTooltip(row.detail.seg_bc, row.segBC, mul, cur)
                            : <><span className="text-teal-400 font-semibold">{t.segments.bcFull}</span>{'\n'}<span className="text-amber-400">= {(row.segBC * mul).toFixed(2)} {cur}</span></>
                          }>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segBC * mul).toFixed(2)}</span>
                          </CostTooltip>
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">
                          <CostTooltip content={row.detail
                            ? scenarioSegDTooltip(row.detail.seg_d, row.segD, mul, cur)
                            : <><span className="text-blue-400 font-semibold">{t.segments.dFull}</span>{'\n'}<span className="text-amber-400">= {(row.segD * mul).toFixed(2)} {cur}</span></>
                          }>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segD * mul).toFixed(2)}</span>
                          </CostTooltip>
                        </td>
                      </>
                    ) : isMultiB ? (
                      <>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">
                          <CostTooltip content={row.detail
                            ? scenarioSegBTooltip(row.detail.seg_b, row.segB, `${t.segments.b1} ${t.segments.bDesc}`, mul, cur)
                            : <><span className="text-blue-400 font-semibold">{t.segments.b1} {t.segments.bDesc}</span>{'\n'}<span className="text-amber-400">= {(row.segB * mul).toFixed(2)} {cur}</span></>
                          }>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segB * mul).toFixed(2)}</span>
                          </CostTooltip>
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">
                          <CostTooltip content={row.detail?.seg_b2
                            ? scenarioSegB2Tooltip(row.detail.seg_b2, row.segB2, mul, cur)
                            : <><span className="text-blue-400 font-semibold">{t.segments.b2} {t.segments.bDesc}</span>{'\n'}<span className="text-amber-400">= {(row.segB2 * mul).toFixed(2)} {cur}</span></>
                          }>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segB2 * mul).toFixed(2)}</span>
                          </CostTooltip>
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">
                          <CostTooltip content={row.detail
                            ? scenarioSegCTooltip(row.detail.seg_c, row.segC, mul, cur)
                            : <><span className="text-blue-400 font-semibold">{t.segments.cFull}</span>{'\n'}<span className="text-amber-400">= {(row.segC * mul).toFixed(2)} {cur}</span></>
                          }>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segC * mul).toFixed(2)}</span>
                          </CostTooltip>
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">
                          <CostTooltip content={row.detail
                            ? scenarioSegDTooltip(row.detail.seg_d, row.segD, mul, cur)
                            : <><span className="text-blue-400 font-semibold">{t.segments.dFull}</span>{'\n'}<span className="text-amber-400">= {(row.segD * mul).toFixed(2)} {cur}</span></>
                          }>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segD * mul).toFixed(2)}</span>
                          </CostTooltip>
                        </td>
                      </>
                    ) : isMultiBB2C ? (
                      <>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">
                          <CostTooltip content={row.detail
                            ? scenarioSegBTooltip(row.detail.seg_b, row.segB, `${t.segments.b1} ${t.segments.bDesc}`, mul, cur)
                            : <><span className="text-blue-400 font-semibold">{t.segments.b1} {t.segments.bDesc}</span>{'\n'}<span className="text-amber-400">= {(row.segB * mul).toFixed(2)} {cur}</span></>
                          }>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segB * mul).toFixed(2)}</span>
                          </CostTooltip>
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">
                          <CostTooltip content={row.detail?.seg_b2c
                            ? scenarioSegB2CTooltip(row.detail.seg_b2c, row.segB2C, mul, cur)
                            : <><span className="text-teal-400 font-semibold">{t.segments.b2c} {t.segments.bcDesc}</span>{'\n'}<span className="text-amber-400">= {(row.segB2C * mul).toFixed(2)} {cur}</span></>
                          }>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segB2C * mul).toFixed(2)}</span>
                          </CostTooltip>
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">
                          <CostTooltip content={row.detail
                            ? scenarioSegDTooltip(row.detail.seg_d, row.segD, mul, cur)
                            : <><span className="text-blue-400 font-semibold">{t.segments.dFull}</span>{'\n'}<span className="text-amber-400">= {(row.segD * mul).toFixed(2)} {cur}</span></>
                          }>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segD * mul).toFixed(2)}</span>
                          </CostTooltip>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">
                          <CostTooltip content={row.detail
                            ? scenarioSegBTooltip(row.detail.seg_b, row.segB, undefined, mul, cur)
                            : <><span className="text-blue-400 font-semibold">{t.segments.bFull}</span>{'\n'}<span className="text-amber-400">= {(row.segB * mul).toFixed(2)} {cur}</span></>
                          }>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segB * mul).toFixed(2)}</span>
                          </CostTooltip>
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">
                          <CostTooltip content={row.detail
                            ? scenarioSegCTooltip(row.detail.seg_c, row.segC, mul, cur)
                            : <><span className="text-blue-400 font-semibold">{t.segments.cFull}</span>{'\n'}<span className="text-amber-400">= {(row.segC * mul).toFixed(2)} {cur}</span></>
                          }>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segC * mul).toFixed(2)}</span>
                          </CostTooltip>
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">
                          <CostTooltip content={row.detail
                            ? scenarioSegDTooltip(row.detail.seg_d, row.segD, mul, cur)
                            : <><span className="text-blue-400 font-semibold">{t.segments.dFull}</span>{'\n'}<span className="text-amber-400">= {(row.segD * mul).toFixed(2)} {cur}</span></>
                          }>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/40">{(row.segD * mul).toFixed(2)}</span>
                          </CostTooltip>
                        </td>
                      </>
                    )}
                    <td className="px-3 py-1.5 text-center font-mono text-xs font-semibold text-amber-600">
                      {(row.myCost * mul).toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-center font-mono text-xs text-orange-600">
                      {(row.competitorPrice * mul).toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-center font-mono text-xs text-purple-600">
                      {(row.myFreight * mul).toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-center font-mono text-xs text-purple-600">
                      {(row.myRegFee * mul).toFixed(0)}
                    </td>
                    <td className="px-3 py-1.5 text-center font-mono text-xs font-semibold text-emerald-600">
                      {(row.myPrice * mul).toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {bigTableCompareMode === 'vs_competitor' ? (() => {
                        const deltaPct = row.competitorPrice > 0 ? (row.myPrice - row.competitorPrice) / row.competitorPrice : 0
                        return (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${
                            deltaPct <= -0.05 ? 'text-green-700 bg-green-50'
                            : deltaPct < 0 ? 'text-green-600 bg-green-50'
                            : deltaPct <= 0.05 ? 'text-red-500 bg-red-50'
                            : 'text-red-700 bg-red-50'
                          }`}>
                            {deltaPct >= 0 ? '+' : ''}{(deltaPct * 100).toFixed(1)}%
                          </span>
                        )
                      })() : (
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${getMarginColorClass(row.marginPct)}`}>
                          {(row.marginPct * 100).toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {!showAll && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                    ← {t.pricingAnalysis.step4.prevPage}
                  </Button>
                  <span className="text-muted-foreground">
                    {page + 1} / {totalPages} ({fullVerificationRows.length} {t.pricingAnalysis.step4.totalRecords})
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                    {t.pricingAnalysis.step4.nextPage} →
                  </Button>
                </>
              )}
              {showAll && <span className="text-muted-foreground">{t.pricingAnalysis.step4.showAll} {fullVerificationRows.length} {t.pricingAnalysis.step4.totalRecords}</span>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setShowAll((v) => !v); setPage(0) }} className="text-blue-500">
              {showAll ? t.pricingAnalysis.step4.collapse : t.pricingAnalysis.step4.showAll}
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>{t.common.back}</Button>
        <Button onClick={onNext}>{t.pricingAnalysis.step4.nextStepSave}</Button>
      </div>
    </div>
  )
}
