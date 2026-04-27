'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useCountry } from '@/lib/context/country-context'
import { useT } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { generateRateCardFromScenario, getRegFee } from '@/lib/calculations/scenario-pricing'
import { exportRateCardToExcel } from '@/lib/excel/exporter'
import type { ExportCurrency } from '@/lib/excel/exporter'
import { getMarginColorClass } from '@/lib/utils/margin'
import { RateCardTable } from '@/components/rate-card/RateCardTable'
import { BracketEditor } from '@/components/rate-card/BracketEditor'
import { VerificationTable } from '@/components/rate-card/VerificationTable'
import type { RateCardBracket, WeightPoint } from '@/types'
import { WEIGHT_BRACKETS, VERIFICATION_WEIGHT_POINTS, DEFAULT_EXCHANGE_RATES } from '@/types'
import type { BracketCost, Scenario } from '@/types/scenario'
import type { CompetitorBracketPrice } from '@/types/pricing-analysis'

// ─── Pipeline State ──────────────────────────────────────────────────────────

type PricingMode = 'compete' | 'markup'

interface PipelineState {
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7
  scenarioId: string | null
  scenario: Scenario | null
  scenarioCosts: BracketCost[] | null
  pricingMode: PricingMode | null
  competitorCardId: string | null
  targetMargin: number
  priceDiffPct: number
  noRegFee: boolean
  customBrackets: WeightPoint[]
  brackets: RateCardBracket[]
}

const initialState: PipelineState = {
  step: 1,
  scenarioId: null,
  scenario: null,
  scenarioCosts: null,
  pricingMode: null,
  competitorCardId: null,
  targetMargin: 20,
  priceDiffPct: 0,
  noRegFee: false,
  customBrackets: [...WEIGHT_BRACKETS],
  brackets: [],
}

// ─── Competitor card type ────────────────────────────────────────────────────

interface CompetitorCard {
  id: string
  competitor_name: string
  service_code: string
  country_name_zh: string
  country_name_en: string
  country_code: string | null
  brackets: Array<{ weight_range: string; weight_min: number; weight_max: number; rate_per_kg: number; reg_fee: number }>
  fuel_surcharge_pct: number
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PricingPipeline() {
  const { country } = useCountry()
  const t = useT()

  const [state, setState] = useState<PipelineState>(initialState)
  const [scenarios, setScenarios] = useState<Array<{ id: string; name: string; pricing_mode?: string; results?: { cost_per_bracket: BracketCost[] } }>>([])
  const [competitorCards, setCompetitorCards] = useState<CompetitorCard[]>([])
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [cardName, setCardName] = useState('')
  const [exportCurrency, setExportCurrency] = useState<ExportCurrency>('HKD')

  // Verification table data
  const [verificationCosts, setVerificationCosts] = useState<BracketCost[] | null>(null)
  const [loadingVerification, setLoadingVerification] = useState(false)

  const stepLabels = t.pricingAnalysis.pipeline.steps as string[]

  // ── Load scenarios + competitor cards on country change ──
  useEffect(() => {
    setLoading(true)
    setState(initialState)
    setSavedId(null)
    setCardName('')

    Promise.all([
      fetch(`/api/scenarios?country=${country}`).then((r) => r.json()),
      fetch(`/api/competitor-rate-cards?country_code=${country}`).then((r) => r.json()),
    ])
      .then(([scenarioList, cards]) => {
        if (Array.isArray(scenarioList)) {
          setScenarios(scenarioList.filter((s: Scenario) => s.results?.cost_per_bracket))
        }
        if (Array.isArray(cards)) setCompetitorCards(cards)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [country])

  // ── Step navigation helpers ──
  const goTo = useCallback((step: PipelineState['step']) => {
    setState((s) => ({ ...s, step }))
  }, [])

  // ── Step 1: Load scenario costs ──
  const handleSelectScenario = useCallback(async (scenarioId: string) => {
    setComputing(true)
    try {
      const res = await fetch(`/api/scenarios/${scenarioId}`)
      const sc: Scenario = await res.json()

      // Recompute fresh costs
      const previewRes = await fetch('/api/scenarios/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sc, weights: WEIGHT_BRACKETS }),
      })

      let costs: BracketCost[] | null = null
      if (previewRes.ok) {
        const data = await previewRes.json()
        costs = data.cost_per_bracket ?? null
      }
      // Fallback to stored results
      if (!costs && sc.results?.cost_per_bracket) {
        costs = sc.results.cost_per_bracket
      }

      setState((s) => ({
        ...s,
        scenarioId,
        scenario: sc,
        scenarioCosts: costs,
        customBrackets: [...WEIGHT_BRACKETS],
      }))
      setCardName(`${sc.name} - ${t.pages.rateCard.title}`)
    } catch {
      toast.error(t.common.loadFailed)
    } finally {
      setComputing(false)
    }
  }, [t])

  // ── Step 3: Generate brackets ──
  const generateBrackets = useCallback(() => {
    if (!state.scenarioCosts) return

    if (state.pricingMode === 'markup') {
      // Cost markup mode: generate from scenario costs with target margin
      const brackets = generateRateCardFromScenario(state.scenarioCosts, state.targetMargin / 100)
      setState((s) => ({ ...s, brackets, step: 4 }))
    } else if (state.pricingMode === 'compete') {
      // Follow competitor mode: adjust competitor rates by priceDiffPct
      const card = competitorCards.find((c) => c.id === state.competitorCardId)
      if (!card) return

      const adjustDecimal = -state.priceDiffPct / 100
      const brackets: RateCardBracket[] = state.scenarioCosts.map((sc) => {
        // Find matching competitor bracket by weight
        const compBracket = card.brackets.find(
          (b) => sc.representative_weight_kg >= b.weight_min && sc.representative_weight_kg <= b.weight_max
        ) || card.brackets[card.brackets.length - 1]

        const compRate = compBracket?.rate_per_kg ?? 0
        const compRegFee = compBracket?.reg_fee ?? 0
        const myRate = compRate * (1 + adjustDecimal)
        const regFee = state.noRegFee ? 0 : compRegFee
        const revenue = myRate * sc.representative_weight_kg + regFee
        const margin = revenue > 0 ? (revenue - sc.cost_hkd) / revenue : 0

        return {
          weight_range: sc.weight_range,
          weight_min_kg: sc.weight_min_kg,
          weight_max_kg: sc.weight_max_kg,
          representative_weight_kg: sc.representative_weight_kg,
          cost_hkd: sc.cost_hkd,
          freight_rate_hkd_per_kg: Math.round(myRate * 100) / 100,
          reg_fee_hkd: regFee,
          revenue_hkd: revenue,
          actual_margin: margin,
        }
      })
      setState((s) => ({ ...s, brackets, step: 4 }))
    }
  }, [state.scenarioCosts, state.pricingMode, state.targetMargin, state.priceDiffPct, state.competitorCardId, state.noRegFee, competitorCards])

  // ── Step 3b: Recompute with custom brackets ──
  const handleCustomBracketsChange = useCallback(async (newBrackets: WeightPoint[]) => {
    setState((s) => ({ ...s, customBrackets: newBrackets }))
    if (!state.scenario || newBrackets.length === 0) return

    setComputing(true)
    try {
      const res = await fetch('/api/scenarios/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...state.scenario, weights: newBrackets }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.cost_per_bracket) {
          setState((s) => ({ ...s, scenarioCosts: data.cost_per_bracket }))
        }
      }
    } catch { /* non-fatal */ }
    finally { setComputing(false) }
  }, [state.scenario])

  // ── Step 5: Fetch verification costs ──
  const fetchVerificationCosts = useCallback(async () => {
    if (!state.scenario) return
    setLoadingVerification(true)
    setVerificationCosts(null)
    try {
      const res = await fetch('/api/scenarios/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...state.scenario, weights: VERIFICATION_WEIGHT_POINTS }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.cost_per_bracket) setVerificationCosts(data.cost_per_bracket)
      }
    } catch { /* non-fatal */ }
    finally { setLoadingVerification(false) }
  }, [state.scenario])

  // ── Step 7: Save rate card ──
  const handleSave = useCallback(async () => {
    if (!state.brackets.length || !cardName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cardName.trim(),
          product_type: 'economy',
          target_margin: state.targetMargin / 100,
          brackets: state.brackets,
          scenario_id: state.scenarioId,
          country_code: country,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSavedId(data.id)
      toast.success(t.pricingAnalysis.step5.cardSaved)
    } catch {
      toast.error(t.common.saveFailed)
    } finally {
      setSaving(false)
    }
  }, [state.brackets, state.scenarioId, state.targetMargin, cardName, country, t])

  const handleExport = useCallback(() => {
    if (!state.brackets.length) return
    const r = DEFAULT_EXCHANGE_RATES
    const mul = exportCurrency === 'HKD' ? 1
      : exportCurrency === 'RMB' ? r.hkd_rmb
      : exportCurrency === 'USD' ? 1 / r.usd_hkd
      : 1 / (r.jpy_hkd ?? 0.052)
    exportRateCardToExcel(
      { name: cardName || 'Pipeline Rate Card', product_type: 'economy', target_margin: state.targetMargin / 100, brackets: state.brackets },
      exportCurrency,
      mul,
    )
    toast.success(t.pricingAnalysis.step5.excelDownloaded)
  }, [state.brackets, state.targetMargin, cardName, exportCurrency, t])

  // ── Avg margin stat ──
  const avgMargin = useMemo(() => {
    if (state.brackets.length === 0) return 0
    return state.brackets.reduce((s, b) => s + b.actual_margin, 0) / state.brackets.length
  }, [state.brackets])

  // ── Competitor comparison data for Step 6 ──
  const comparisonData = useMemo(() => {
    if (!state.competitorCardId) return null
    const card = competitorCards.find((c) => c.id === state.competitorCardId)
    if (!card) return null
    return state.brackets.map((b) => {
      const compBracket = card.brackets.find(
        (cb) => b.representative_weight_kg >= cb.weight_min && b.representative_weight_kg <= cb.weight_max
      )
      const compPrice = compBracket ? compBracket.rate_per_kg * b.representative_weight_kg + compBracket.reg_fee : 0
      return {
        weight_range: b.weight_range,
        representative_weight_kg: b.representative_weight_kg,
        myPrice: b.revenue_hkd,
        competitorPrice: compPrice,
        diff: b.revenue_hkd - compPrice,
        diffPct: compPrice > 0 ? ((b.revenue_hkd - compPrice) / compPrice) * 100 : 0,
      }
    })
  }, [state.brackets, state.competitorCardId, competitorCards])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {stepLabels.map((label, i) => {
          const stepNum = (i + 1) as PipelineState['step']
          const isActive = state.step === stepNum
          const isDone = state.step > stepNum
          return (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && <div className={`w-4 h-px ${isDone ? 'bg-[#FF6B00]' : 'bg-gray-300'}`} />}
              <button
                onClick={() => isDone && goTo(stepNum)}
                disabled={!isDone}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[#FF6B00] text-white'
                    : isDone
                      ? 'bg-[#FF6B00]/10 text-[#FF6B00] hover:bg-[#FF6B00]/20 cursor-pointer'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive ? 'bg-white text-[#FF6B00]' : isDone ? 'bg-[#FF6B00] text-white' : 'bg-gray-300 text-white'
                }`}>
                  {isDone ? '✓' : stepNum}
                </span>
                {label}
              </button>
            </div>
          )
        })}
      </div>

      {/* ─── Step 1: Select Scenario ─── */}
      {state.step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.pricingAnalysis.pipeline.step1Title}</CardTitle>
            <p className="text-xs text-muted-foreground">{t.pricingAnalysis.pipeline.step1Desc}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> {t.common.loading}
              </div>
            ) : scenarios.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">{t.pricingAnalysis.pipeline.noScenarios}</p>
            ) : (
              <div className="space-y-3">
                <Select
                  value={state.scenarioId ?? ''}
                  onValueChange={(id) => handleSelectScenario(id)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.pages.rateCard.selectScenario} />
                  </SelectTrigger>
                  <SelectContent>
                    {scenarios.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.pricing_mode && (
                          <span className="text-muted-foreground ml-2">({t.pricingModes[`${s.pricing_mode}Short` as keyof typeof t.pricingModes] || s.pricing_mode})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {computing && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t.common.loading}
                  </div>
                )}

                {state.scenarioCosts && state.scenario && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-1">
                    <p className="text-sm font-medium text-green-800">
                      {state.scenario.name} — {state.scenarioCosts.length} {t.common.brackets}
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-xs text-green-700">
                      {state.scenarioCosts.slice(0, 3).map((sc) => (
                        <span key={sc.weight_range} className="font-mono">
                          {sc.weight_range}: {sc.cost_hkd.toFixed(2)} HKD
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {state.scenarioCosts && (
              <div className="flex justify-end">
                <Button onClick={() => goTo(2)}>
                  {t.common.next}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Step 2: Choose Pricing Mode ─── */}
      {state.step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.pricingAnalysis.pipeline.step2Title}</CardTitle>
            <p className="text-xs text-muted-foreground">{t.pricingAnalysis.pipeline.step2Desc}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Compete mode */}
              <button
                onClick={() => setState((s) => ({ ...s, pricingMode: 'compete' }))}
                className={`text-left p-4 rounded-lg border-2 transition-colors ${
                  state.pricingMode === 'compete'
                    ? 'border-[#FF6B00] bg-[#FF6B00]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium">{t.pricingAnalysis.pipeline.modeCompete}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.pricingAnalysis.pipeline.modeCompeteDesc}</p>
              </button>

              {/* Markup mode */}
              <button
                onClick={() => setState((s) => ({ ...s, pricingMode: 'markup' }))}
                className={`text-left p-4 rounded-lg border-2 transition-colors ${
                  state.pricingMode === 'markup'
                    ? 'border-[#FF6B00] bg-[#FF6B00]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium">{t.pricingAnalysis.pipeline.modeMarkup}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.pricingAnalysis.pipeline.modeMarkupDesc}</p>
              </button>
            </div>

            {/* Compete mode: select competitor card */}
            {state.pricingMode === 'compete' && (
              <div className="space-y-1.5">
                <Label className="text-sm">{t.pricingAnalysis.pipeline.selectCompetitorCard}</Label>
                {competitorCards.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.pricingAnalysis.pipeline.noCompetitorCards}</p>
                ) : (
                  <Select
                    value={state.competitorCardId ?? ''}
                    onValueChange={(id) => setState((s) => ({ ...s, competitorCardId: id }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t.pricingAnalysis.pipeline.selectCompetitorCard} />
                    </SelectTrigger>
                    <SelectContent>
                      {competitorCards.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.competitor_name} - {c.service_code} ({c.country_name_zh})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => goTo(1)}>{t.common.back}</Button>
              <Button
                onClick={() => goTo(3)}
                disabled={
                  !state.pricingMode ||
                  (state.pricingMode === 'compete' && !state.competitorCardId)
                }
              >
                {t.common.next}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 3: Generate Prices ─── */}
      {state.step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.pricingAnalysis.pipeline.step3Title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {state.pricingMode === 'compete' ? (
              /* Step 3a: Follow competitor */
              <div className="space-y-4">
                <h4 className="text-sm font-medium">{t.pricingAnalysis.pipeline.step3aTitle}</h4>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t.pricingAnalysis.step2.title}</Label>
                  <p className="text-xs text-muted-foreground">{t.pricingAnalysis.step2.helperText}</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.5"
                      value={state.priceDiffPct}
                      onChange={(e) => setState((s) => ({ ...s, priceDiffPct: parseFloat(e.target.value) || 0 }))}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pipeline-no-regfee"
                    checked={state.noRegFee}
                    onCheckedChange={(v) => setState((s) => ({ ...s, noRegFee: v === true }))}
                  />
                  <label htmlFor="pipeline-no-regfee" className="text-sm cursor-pointer">
                    {t.pricingAnalysis.step4.noRegFee}
                  </label>
                  <span className="text-xs text-muted-foreground">{t.pricingAnalysis.step4.noRegFeeHint}</span>
                </div>

                {/* Custom brackets editor */}
                <div className="border-t pt-4">
                  <BracketEditor
                    brackets={state.customBrackets}
                    onChange={handleCustomBracketsChange}
                  />
                  {computing && (
                    <p className="text-xs text-muted-foreground animate-pulse mt-1">{t.pages.rateCard.generating}</p>
                  )}
                </div>

                {/* Preview */}
                {state.scenarioCosts && (() => {
                  const mid = state.scenarioCosts[Math.floor(state.scenarioCosts.length / 2)]
                  const card = competitorCards.find((c) => c.id === state.competitorCardId)
                  const compB = card?.brackets.find((b) => mid.representative_weight_kg >= b.weight_min && mid.representative_weight_kg <= b.weight_max)
                  if (!compB) return null
                  const adjustDecimal = -state.priceDiffPct / 100
                  const myRate = compB.rate_per_kg * (1 + adjustDecimal)
                  const regFee = state.noRegFee ? 0 : compB.reg_fee
                  const myPrice = myRate * mid.representative_weight_kg + regFee
                  const compPrice = compB.rate_per_kg * mid.representative_weight_kg + compB.reg_fee
                  return (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t.pricingAnalysis.step2.preview} ({mid.weight_range})
                      </p>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                        <span className="text-muted-foreground">{t.pricingAnalysis.step2.competitorRate}</span>
                        <span className="font-mono">{compB.rate_per_kg.toFixed(1)} /kg</span>
                        <span className="text-muted-foreground">{t.pricingAnalysis.step2.myRate}</span>
                        <span className="font-mono">{myRate.toFixed(1)} /kg</span>
                        <span className="text-muted-foreground">{t.pricingAnalysis.step2.competitorPrice}</span>
                        <span className="font-mono">{compPrice.toFixed(2)} HKD</span>
                        <span className="text-muted-foreground">{t.pricingAnalysis.step2.myPrice}</span>
                        <span className="font-mono">{myPrice.toFixed(2)} HKD</span>
                        <span className="text-muted-foreground">{t.pricingAnalysis.compete.myCost}</span>
                        <span className="font-mono">{mid.cost_hkd.toFixed(2)} HKD</span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : (
              /* Step 3b: Cost markup */
              <div className="space-y-4">
                <h4 className="text-sm font-medium">{t.pricingAnalysis.pipeline.step3bTitle}</h4>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t.pricingAnalysis.step2.targetMargin}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="1"
                      min={0}
                      max={99}
                      value={state.targetMargin}
                      onChange={(e) => setState((s) => ({ ...s, targetMargin: parseFloat(e.target.value) || 0 }))}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pipeline-markup-no-regfee"
                    checked={state.noRegFee}
                    onCheckedChange={(v) => setState((s) => ({ ...s, noRegFee: v === true }))}
                  />
                  <label htmlFor="pipeline-markup-no-regfee" className="text-sm cursor-pointer">
                    {t.pricingAnalysis.step4.noRegFee}
                  </label>
                </div>

                {/* Custom brackets editor */}
                <div className="border-t pt-4">
                  <BracketEditor
                    brackets={state.customBrackets}
                    onChange={handleCustomBracketsChange}
                  />
                  {computing && (
                    <p className="text-xs text-muted-foreground animate-pulse mt-1">{t.pages.rateCard.generating}</p>
                  )}
                </div>

                {/* Quick preview */}
                {state.scenarioCosts && (() => {
                  const mid = state.scenarioCosts[Math.floor(state.scenarioCosts.length / 2)]
                  const margin = state.targetMargin / 100
                  const regFee = state.noRegFee ? 0 : getRegFee(mid.representative_weight_kg)
                  const revenue = margin < 1 ? mid.cost_hkd / (1 - margin) : mid.cost_hkd * 2
                  const freightRate = Math.max(0, (revenue - regFee) / mid.representative_weight_kg)
                  const actualRevenue = freightRate * mid.representative_weight_kg + regFee
                  const actualMargin = actualRevenue > 0 ? (actualRevenue - mid.cost_hkd) / actualRevenue : 0
                  return (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t.pricingAnalysis.step2.preview} ({mid.weight_range})
                      </p>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                        <span className="text-muted-foreground">{t.pricingAnalysis.compete.myCost}</span>
                        <span className="font-mono">{mid.cost_hkd.toFixed(2)} HKD</span>
                        <span className="text-muted-foreground">{t.verification.ratePerKg}</span>
                        <span className="font-mono">{freightRate.toFixed(2)} HKD/kg</span>
                        <span className="text-muted-foreground">{t.pricingAnalysis.step2.revenue}</span>
                        <span className="font-mono">{actualRevenue.toFixed(2)} HKD</span>
                        <span className="text-muted-foreground">{t.common.margin}</span>
                        <span className={`font-mono font-medium ${getMarginColorClass(actualMargin)}`}>
                          {(actualMargin * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => goTo(2)}>{t.common.back}</Button>
              <Button onClick={generateBrackets} disabled={!state.scenarioCosts}>
                {t.pricingAnalysis.step2.generateAndCalc}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 4: Fine-tune Brackets ─── */}
      {state.step === 4 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{t.pricingAnalysis.pipeline.step4Title}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{t.pricingAnalysis.pipeline.step4Desc}</p>
              </div>
              <Badge className={`${getMarginColorClass(avgMargin)} border`} variant="outline">
                {t.common.margin}: {(avgMargin * 100).toFixed(1)}%
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <RateCardTable
              brackets={state.brackets}
              onBracketsChange={(b) => setState((s) => ({ ...s, brackets: b }))}
            />
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => goTo(3)}>{t.common.back}</Button>
              <Button onClick={() => goTo(5)}>{t.common.next}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 5: Margin Verification ─── */}
      {state.step === 5 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{t.pricingAnalysis.pipeline.step5Title}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{t.pricingAnalysis.pipeline.step5Desc}</p>
              </div>
              <div className="flex items-center gap-2">
                {!verificationCosts && !loadingVerification && (
                  <Button size="sm" variant="outline" onClick={fetchVerificationCosts}>
                    {t.pricingAnalysis.step4.generateBigTable}
                  </Button>
                )}
                {loadingVerification && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">{t.pricingAnalysis.compete.avgMargin}</p>
                <p className={`text-lg font-bold font-mono ${getMarginColorClass(avgMargin)}`}>
                  {(avgMargin * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">{t.pricingAnalysis.step5.totalBrackets}</p>
                <p className="text-lg font-bold font-mono">{state.brackets.length}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">{t.pricingAnalysis.step5.profitableBrackets}</p>
                <p className="text-lg font-bold font-mono text-green-600">
                  {state.brackets.filter((b) => b.actual_margin >= 0.1).length}
                </p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">{t.pricingAnalysis.step5.lossBrackets}</p>
                <p className="text-lg font-bold font-mono text-red-600">
                  {state.brackets.filter((b) => b.actual_margin < 0).length}
                </p>
              </div>
            </div>

            {/* Per-bracket margin table */}
            <div className="border rounded-lg overflow-auto max-h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t.common.weight}</TableHead>
                    <TableHead className="text-xs text-center">{t.common.cost} (HKD)</TableHead>
                    <TableHead className="text-xs text-center">{t.common.revenue} (HKD)</TableHead>
                    <TableHead className="text-xs text-center">{t.common.margin}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.brackets.map((b, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono py-1">{b.weight_range}</TableCell>
                      <TableCell className="text-xs font-mono py-1 text-center">{b.cost_hkd.toFixed(2)}</TableCell>
                      <TableCell className="text-xs font-mono py-1 text-center">{b.revenue_hkd.toFixed(2)}</TableCell>
                      <TableCell className={`text-xs font-mono py-1 text-center ${getMarginColorClass(b.actual_margin)}`}>
                        {(b.actual_margin * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Verification table (big table at all weight points) */}
            {verificationCosts && (
              <div className="border-t pt-4">
                <VerificationTable
                  brackets={state.brackets}
                  productType="economy"
                  scenarioCosts={verificationCosts}
                  pricingMode={state.scenario?.pricing_mode}
                />
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => goTo(4)}>{t.common.back}</Button>
              <Button onClick={() => goTo(6)}>{t.common.next}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 6: Competitor Comparison ─── */}
      {state.step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.pricingAnalysis.pipeline.step6Title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{t.pricingAnalysis.pipeline.step6Desc}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Competitor card selector (if not already selected in Step 2) */}
            {!state.competitorCardId && competitorCards.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm">{t.pricingAnalysis.pipeline.selectCompetitorCard}</Label>
                <Select
                  value={state.competitorCardId ?? ''}
                  onValueChange={(id) => setState((s) => ({ ...s, competitorCardId: id }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.pricingAnalysis.pipeline.selectCompetitorCard} />
                  </SelectTrigger>
                  <SelectContent>
                    {competitorCards.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.competitor_name} - {c.service_code} ({c.country_name_zh})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {comparisonData ? (
              <div className="border rounded-lg overflow-auto max-h-80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t.common.weight}</TableHead>
                      <TableHead className="text-xs text-center">{t.pricingAnalysis.step2.myPrice} (HKD)</TableHead>
                      <TableHead className="text-xs text-center">{t.pricingAnalysis.compete.competitorPrice} (HKD)</TableHead>
                      <TableHead className="text-xs text-center">{t.pricingAnalysis.compete.difference}</TableHead>
                      <TableHead className="text-xs text-center">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisonData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono py-1">{row.weight_range}</TableCell>
                        <TableCell className="text-xs font-mono py-1 text-center">{row.myPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-xs font-mono py-1 text-center">{row.competitorPrice.toFixed(2)}</TableCell>
                        <TableCell className={`text-xs font-mono py-1 text-center ${row.diff < 0 ? 'text-green-600' : row.diff > 0 ? 'text-red-600' : ''}`}>
                          {row.diff > 0 ? '+' : ''}{row.diff.toFixed(2)}
                        </TableCell>
                        <TableCell className={`text-xs font-mono py-1 text-center ${row.diffPct < 0 ? 'text-green-600' : row.diffPct > 0 ? 'text-red-600' : ''}`}>
                          {row.diffPct > 0 ? '+' : ''}{row.diffPct.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : competitorCards.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">{t.pricingAnalysis.pipeline.noCompetitorForCompare}</p>
            ) : null}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => goTo(5)}>{t.common.back}</Button>
              <Button onClick={() => goTo(7)}>
                {comparisonData ? t.common.next : t.pricingAnalysis.pipeline.skipStep}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 7: Confirm & Save ─── */}
      {state.step === 7 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.pricingAnalysis.pipeline.step7Title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{t.pricingAnalysis.pipeline.step7Desc}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t.pricingAnalysis.pipeline.scenarioInfo}</p>
                <p className="text-sm font-medium truncate">{state.scenario?.name}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t.pricingAnalysis.pipeline.pricingMode}</p>
                <p className="text-sm font-medium">
                  {state.pricingMode === 'compete'
                    ? `${t.pricingAnalysis.pipeline.modeCompete} (${state.priceDiffPct}%)`
                    : `${t.pricingAnalysis.pipeline.modeMarkup} (${state.targetMargin}%)`
                  }
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t.pricingAnalysis.step5.totalBrackets}</p>
                <p className="text-sm font-bold font-mono">{state.brackets.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t.pricingAnalysis.compete.avgMargin}</p>
                <p className={`text-sm font-bold font-mono ${getMarginColorClass(avgMargin)}`}>
                  {(avgMargin * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Bracket preview */}
            <div className="border rounded-lg overflow-auto max-h-48">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t.common.weight}</TableHead>
                    <TableHead className="text-xs text-center">{t.verification.ratePerKg}</TableHead>
                    <TableHead className="text-xs text-center">{t.verification.regFee}</TableHead>
                    <TableHead className="text-xs text-center">{t.verification.price}</TableHead>
                    <TableHead className="text-xs text-center">{t.common.margin}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.brackets.map((b, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono py-1">{b.weight_range}</TableCell>
                      <TableCell className="text-xs font-mono py-1 text-center">{b.freight_rate_hkd_per_kg.toFixed(1)}</TableCell>
                      <TableCell className="text-xs font-mono py-1 text-center">{b.reg_fee_hkd.toFixed(0)}</TableCell>
                      <TableCell className="text-xs font-mono py-1 text-center">{b.revenue_hkd.toFixed(2)}</TableCell>
                      <TableCell className={`text-xs font-mono py-1 text-center ${getMarginColorClass(b.actual_margin)}`}>
                        {(b.actual_margin * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Save form */}
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-1.5 max-w-sm">
                <Label className="text-sm">{t.pricingAnalysis.step5.rateCardName}</Label>
                <Input
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder={`${country} ${state.scenario?.name ?? ''}`}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">{t.common.currency}:</Label>
                <Select value={exportCurrency} onValueChange={(v) => setExportCurrency(v as ExportCurrency)}>
                  <SelectTrigger className="w-24 h-8 text-xs">
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
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving || !cardName.trim() || !!savedId}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {savedId ? t.pricingAnalysis.step5.saved : t.pricingAnalysis.step5.saveAsMyCard}
                </Button>
                <Button variant="outline" onClick={handleExport} disabled={!state.brackets.length}>
                  {t.pricingAnalysis.step5.exportExcel}
                </Button>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => goTo(6)}>{t.common.back}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
