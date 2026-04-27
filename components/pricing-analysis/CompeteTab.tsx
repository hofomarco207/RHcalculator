'use client'

import { useState, useCallback, useMemo } from 'react'
import { useT } from '@/lib/i18n'
import { DEFAULT_EXCHANGE_RATES } from '@/types'
import { CompeteStep1 } from './CompeteStep1'
import { CompeteStep2 } from './CompeteStep2'
import type { Step2Result } from './CompeteStep2'
import { CompeteStep3 } from './CompeteStep3'
import { CompeteStep4 } from './CompeteStep4'
import { CompeteStep5 } from './CompeteStep5'
import { getVerdict } from '@/types/pricing-analysis'
import type { RateCardBracket } from '@/types'
import type { CompeteBracketResult, CompeteResult, CompetitorBracketPrice } from '@/types/pricing-analysis'

function round2(n: number) { return Math.round(n * 100) / 100 }

export type DisplayCurrency = 'HKD' | 'RMB' | 'USD' | 'JPY'

/** HKD → target currency multiplier */
function getHkdMultiplier(cur: DisplayCurrency): number {
  const r = DEFAULT_EXCHANGE_RATES
  switch (cur) {
    case 'HKD': return 1
    case 'RMB': return r.hkd_rmb
    case 'USD': return 1 / r.usd_hkd
    case 'JPY': return 1 / (r.jpy_hkd ?? 0.052)
  }
}

export function CompeteTab() {
  const t = useT()
  const stepLabels = t.pricingAnalysis.compete.steps
  const [step, setStep] = useState(0)
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('HKD')
  const currencyMultiplier = getHkdMultiplier(displayCurrency)

  // Step 0 → Step 1 data (set when user proceeds from CompeteStep1)
  const [competitorPrices, setCompetitorPrices] = useState<CompetitorBracketPrice[]>([])
  const [scenarioId, setScenarioId] = useState('')
  const [competitorName, setCompetitorName] = useState('')
  const [initialResult, setInitialResult] = useState<CompeteResult | null>(null)
  const [weightStep, setWeightStep] = useState(0)

  // Step 1 data — adjustment applies to freight rate ONLY
  const [adjustmentPct, setAdjustmentPct] = useState(0)

  // Step 2 mode: 'follow' (adjustmentPct-based) or 'margin' (generated brackets)
  const [step2Mode, setStep2Mode] = useState<'follow' | 'margin'>('follow')
  const [generatedBrackets, setGeneratedBrackets] = useState<RateCardBracket[] | null>(null)

  // Step 3 overrides: freight amount and reg_fee per bracket
  const [freightOverrides, setFreightOverrides] = useState<Map<number, number>>(new Map())
  const [regFeeOverrides, setRegFeeOverrides] = useState<Map<number, number>>(new Map())
  const [noRegFee, setNoRegFee] = useState(false)

  // Derive adjusted brackets: supports both follow mode and margin mode
  const adjustedBrackets: CompeteBracketResult[] = useMemo(() => {
    if (!initialResult) return []
    return initialResult.brackets.map((b, i) => {
      const cp = competitorPrices[i]
      if (!cp) return b as CompeteBracketResult

      const freightOv = freightOverrides.get(i)
      let myFreightRate: number
      let myFreight: number
      let baseRegFee: number

      if (step2Mode === 'margin' && generatedBrackets?.[i]) {
        // ── Margin mode: use generated bracket values as base ──
        const gen = generatedBrackets[i]
        baseRegFee = gen.reg_fee_hkd
        if (freightOv !== undefined) {
          myFreight = freightOv
          myFreightRate = cp.representative_weight > 0 ? freightOv / cp.representative_weight : 0
        } else {
          myFreightRate = gen.freight_rate_hkd_per_kg
          myFreight = myFreightRate * gen.representative_weight_kg
        }
      } else {
        // ── Follow mode: adjust competitor freight by percentage ──
        const competitorFreight = cp.price - cp.reg_fee
        baseRegFee = cp.reg_fee
        if (freightOv !== undefined) {
          myFreight = freightOv
          myFreightRate = cp.representative_weight > 0 ? freightOv / cp.representative_weight : 0
        } else {
          myFreight = competitorFreight * (1 + adjustmentPct)
          myFreightRate = cp.representative_weight > 0 ? myFreight / cp.representative_weight : 0
        }
      }

      // Reg fee: use base (competitor or generated), override, or 0 if noRegFee
      let myRegFee: number
      if (noRegFee) {
        myRegFee = 0
      } else {
        myRegFee = regFeeOverrides.get(i) ?? baseRegFee
      }

      const myPrice = myFreight + myRegFee
      const myCost = b.my_cost
      const marginAmount = myPrice - myCost
      const marginPct = myPrice > 0 ? marginAmount / myPrice : -Infinity

      return {
        weight_bracket: b.weight_bracket,
        representative_weight: b.representative_weight,
        competitor_price: cp.price,
        competitor_rate_per_kg: cp.rate_per_kg,
        competitor_reg_fee: cp.reg_fee,
        my_price: round2(myPrice),
        my_freight_rate: round2(myFreightRate),
        my_freight: round2(myFreight),
        my_reg_fee: round2(myRegFee),
        is_manual_override: freightOv !== undefined || regFeeOverrides.has(i),
        my_cost: round2(myCost),
        margin_amount: round2(marginAmount),
        margin_pct: marginPct,
        verdict: getVerdict(marginPct),
        segment_breakdown: b.segment_breakdown,
      }
    })
  }, [initialResult, competitorPrices, adjustmentPct, step2Mode, generatedBrackets, freightOverrides, regFeeOverrides, noRegFee])

  const weightedMargin = useMemo(() => {
    if (adjustedBrackets.length === 0) return null
    return adjustedBrackets.reduce((s, b) => s + b.margin_pct, 0) / adjustedBrackets.length
  }, [adjustedBrackets])

  // Step 0 → proceed: CompeteStep1 passes selected scenario data
  const handleStep0Proceed = useCallback((data: {
    competitorPrices: CompetitorBracketPrice[]
    scenarioId: string
    competitorName: string
    initialResult: CompeteResult
    weightStep: number
  }) => {
    setCompetitorPrices(data.competitorPrices)
    setScenarioId(data.scenarioId)
    setCompetitorName(data.competitorName)
    setInitialResult(data.initialResult)
    setWeightStep(data.weightStep)
    setAdjustmentPct(0)
    setStep2Mode('follow')
    setGeneratedBrackets(null)
    setFreightOverrides(new Map())
    setRegFeeOverrides(new Map())
    setNoRegFee(false)
    setStep(1)
  }, [])

  const handleStep1Next = useCallback((result: Step2Result) => {
    setFreightOverrides(new Map())
    setRegFeeOverrides(new Map())
    if (result.mode === 'follow') {
      setStep2Mode('follow')
      setAdjustmentPct(result.adjustmentPct)
      setGeneratedBrackets(null)
      setNoRegFee(false)
    } else {
      setStep2Mode('margin')
      setGeneratedBrackets(result.generatedBrackets)
      setAdjustmentPct(0)
      setNoRegFee(result.noRegFee)
    }
    setStep(2)
  }, [])

  const handleFreightChange = useCallback((index: number, newFreight: number) => {
    setFreightOverrides((prev) => new Map(prev).set(index, newFreight))
  }, [])

  const handleRegFeeChange = useCallback((index: number, newRegFee: number) => {
    setRegFeeOverrides((prev) => new Map(prev).set(index, newRegFee))
  }, [])

  const handleReset = useCallback((index: number) => {
    setFreightOverrides((prev) => { const m = new Map(prev); m.delete(index); return m })
    setRegFeeOverrides((prev) => { const m = new Map(prev); m.delete(index); return m })
  }, [])

  const handleResetAll = useCallback(() => {
    setFreightOverrides(new Map())
    setRegFeeOverrides(new Map())
  }, [])

  const overrideCount = freightOverrides.size + regFeeOverrides.size

  function goToStep(s: number) {
    if (s < 1) {
      setInitialResult(null)
      setAdjustmentPct(0)
      setStep2Mode('follow')
      setGeneratedBrackets(null)
      setFreightOverrides(new Map())
      setRegFeeOverrides(new Map())
      setNoRegFee(false)
    }
    setStep(s)
  }

  return (
    <div className="space-y-4">
      {/* Stepper bar + currency toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs">
          {stepLabels.map((label, i) => (
            <div key={label} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground mx-1">→</span>}
              <span
                className={`px-2 py-1 rounded ${
                  i === step
                    ? 'bg-primary text-primary-foreground font-medium'
                    : i < step
                    ? 'bg-muted text-foreground cursor-pointer hover:bg-muted/80'
                    : 'text-muted-foreground'
                }`}
                onClick={() => i < step && goToStep(i)}
              >
                {i + 1}. {label}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">{t.currencyDisplay.label}:</span>
          {(['HKD', 'RMB', 'USD', 'JPY'] as DisplayCurrency[]).map((cur) => (
            <button
              key={cur}
              onClick={() => setDisplayCurrency(cur)}
              className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                displayCurrency === cur
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-input hover:bg-accent'
              }`}
            >
              {cur}
            </button>
          ))}
        </div>
      </div>

      {step === 0 && (
        <CompeteStep1
          onProceed={handleStep0Proceed}
          displayCurrency={displayCurrency}
          currencyMultiplier={currencyMultiplier}
        />
      )}

      {step === 1 && initialResult && (
        <CompeteStep2
          competitorPrices={competitorPrices}
          scenarioCosts={initialResult.scenario_costs}
          onNext={handleStep1Next}
          onBack={() => goToStep(0)}
        />
      )}

      {step === 2 && initialResult && (
        <CompeteStep3
          brackets={adjustedBrackets}
          weightedMargin={weightedMargin}
          pricingMode={initialResult.pricing_mode}
          displayCurrency={displayCurrency}
          currencyMultiplier={currencyMultiplier}
          onNext={() => setStep(3)}
          onBack={() => goToStep(1)}
        />
      )}

      {step === 3 && initialResult && (
        <CompeteStep4
          brackets={adjustedBrackets}
          competitorPrices={competitorPrices}
          adjustmentPct={adjustmentPct}
          scenarioId={scenarioId}
          pricingMode={initialResult.pricing_mode}
          weightedMargin={weightedMargin}
          noRegFee={noRegFee}
          weightStep={weightStep}
          displayCurrency={displayCurrency}
          currencyMultiplier={currencyMultiplier}
          onNoRegFeeChange={setNoRegFee}
          onFreightChange={handleFreightChange}
          onRegFeeChange={handleRegFeeChange}
          onReset={handleReset}
          onResetAll={handleResetAll}
          overrideCount={overrideCount}
          onNext={() => setStep(4)}
          onBack={() => goToStep(2)}
        />
      )}

      {step === 4 && (
        <CompeteStep5
          brackets={adjustedBrackets}
          competitorPrices={competitorPrices}
          adjustmentPct={adjustmentPct}
          step2Mode={step2Mode}
          scenarioId={scenarioId}
          competitorName={competitorName}
          noRegFee={noRegFee}
          displayCurrency={displayCurrency}
          currencyMultiplier={currencyMultiplier}
          onBack={() => goToStep(3)}
        />
      )}
    </div>
  )
}
