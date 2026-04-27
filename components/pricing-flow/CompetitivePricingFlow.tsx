'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCountry } from '@/lib/context/country-context'
import { useT } from '@/lib/i18n'
import { getMarginColorClass } from '@/lib/utils/margin'
import { FlowStepper } from './shared/FlowStepper'
import {
  UnifiedVerificationTable,
  type DataSource,
  type RateCardSource,
} from './shared/UnifiedVerificationTable'
import { RateCardTable } from '@/components/rate-card/RateCardTable'
import { BracketEditor } from '@/components/rate-card/BracketEditor'
import { UNIFIED_WEIGHT_POINTS, DEFAULT_EXCHANGE_RATES } from '@/types'
import type { RateCard, RateCardBracket, WeightPoint } from '@/types'
import type { BracketCost } from '@/types/scenario'
import type { CompetitorRateCard, CompetitorBracketPrice } from '@/types/pricing-analysis'
import { getRegFee, generateRateCardFromScenario } from '@/lib/calculations/scenario-pricing'
import { exportRateCardToExcel, type ExportCurrency } from '@/lib/excel/exporter'
import { createClient } from '@/lib/supabase/client'

interface CompetitivePricingFlowProps {
  onBack: () => void
}

type PricingStrategy = 'war' | 'markup'

const STEP_LABELS = ['選對標', '比對分析', '生成價格', '驗算', '微調 + 再比對', '確認匯出']

export function CompetitivePricingFlow({ onBack }: CompetitivePricingFlowProps) {
  const t = useT()
  const { country } = useCountry()
  const supabase = createClient()

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  // ── Step 0: Available targets ──
  const [ownCards, setOwnCards] = useState<RateCard[]>([])
  const [compCards, setCompCards] = useState<CompetitorRateCard[]>([])
  const [scenarioOptions, setScenarioOptions] = useState<{ id: string; name: string; pricing_mode?: string }[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  // Computed scenario data
  const [scenarioCosts, setScenarioCosts] = useState<Record<string, BracketCost[]>>({})
  const [scenarioModes, setScenarioModes] = useState<Record<string, string>>({})

  // ── Step 2: Pricing config ──
  const [strategy, setStrategy] = useState<PricingStrategy>('war')
  const [benchmarkKey, setBenchmarkKey] = useState<string>('')
  const [adjustPct, setAdjustPct] = useState(-3) // war pricing: -3% = cheaper by 3%
  const [targetMarginPct, setTargetMarginPct] = useState(15) // markup strategy: integer percent
  const targetMargin = targetMarginPct / 100
  const [customBrackets, setCustomBrackets] = useState<WeightPoint[]>([...UNIFIED_WEIGHT_POINTS])
  const [generatingMarkup, setGeneratingMarkup] = useState(false)

  // ── Step 3-4: Generated brackets ──
  const [brackets, setBrackets] = useState<RateCardBracket[]>([])

  // ── Step 6: Save & export ──
  const [cardName, setCardName] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [exportCurrency, setExportCurrency] = useState<ExportCurrency>('HKD')

  // ── Load all available targets ──
  useEffect(() => {
    if (!country) return
    const load = async () => {
      setLoading(true)
      const [ownRes, compRes, scRes] = await Promise.all([
        supabase
          .from('rate_cards')
          .select('*')
          .eq('country_code', country)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('competitor_rate_cards')
          .select('*')
          .eq('country_code', country)
          .is('valid_to', null)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('scenarios')
          .select('id, name, pricing_mode')
          .eq('country_code', country)
          .order('created_at', { ascending: false }),
      ])
      setOwnCards((ownRes.data ?? []) as RateCard[])
      setCompCards((compRes.data ?? []) as CompetitorRateCard[])
      setScenarioOptions(scRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [country])

  const toggleTarget = useCallback((key: string) => {
    setSelectedKeys(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key)
      if (prev.length >= 6) return prev
      // Enforce per-type limits: max 3 price sources (own/comp), max 3 cost sources (scenario)
      const isScenario = key.startsWith('scenario:')
      const scenarioCount = prev.filter(k => k.startsWith('scenario:')).length
      const priceCount = prev.filter(k => !k.startsWith('scenario:')).length
      if (isScenario && scenarioCount >= 3) return prev
      if (!isScenario && priceCount >= 3) return prev
      return [...prev, key]
    })
  }, [])

  // ── Compute scenario costs ──
  // Preview at UNIFIED_WEIGHT_POINTS so every display weight gets an exact
  // end-to-end computation. Otherwise the verification table would interpolate
  // from 6-point WEIGHT_BRACKETS, which breaks D段 weight_bracket / first_additional
  // (the bracketized/stepped formulas don't survive linear scaling between
  // representatives).
  const computeCosts = useCallback(async () => {
    const scenarioIds = selectedKeys
      .filter(k => k.startsWith('scenario:'))
      .map(k => k.split(':')[1])
      .filter(id => !scenarioCosts[id])

    if (scenarioIds.length === 0) return
    setLoading(true)
    const newCosts: Record<string, BracketCost[]> = {}
    const newModes: Record<string, string> = {}
    for (const id of scenarioIds) {
      try {
        const scRes = await fetch(`/api/scenarios/${id}`)
        if (!scRes.ok) continue
        const sc = await scRes.json()
        const prevRes = await fetch('/api/scenarios/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...sc, weights: UNIFIED_WEIGHT_POINTS }),
        })
        if (prevRes.ok) {
          const data = await prevRes.json()
          newCosts[id] = data.cost_per_bracket ?? []
          newModes[id] = data.assumptions?.pricing_mode ?? sc.pricing_mode ?? 'segmented'
        }
      } catch { /* skip */ }
    }
    setScenarioCosts(prev => ({ ...prev, ...newCosts }))
    setScenarioModes(prev => ({ ...prev, ...newModes }))
    setLoading(false)
  }, [selectedKeys, scenarioCosts])

  // ── Build data sources ──
  const sources: DataSource[] = useMemo(() => {
    const result: DataSource[] = []
    for (const key of selectedKeys) {
      const [type, id] = key.split(':')
      if (type === 'own') {
        const card = ownCards.find(c => c.id === id)
        if (!card) continue
        result.push({ type: 'rate-card', id: key, label: card.name, brackets: card.brackets })
      } else if (type === 'comp') {
        const card = compCards.find(c => c.id === id)
        if (!card) continue
        const cBrackets: CompetitorBracketPrice[] = UNIFIED_WEIGHT_POINTS.map(wp => {
          const b = card.brackets.find(br => wp.representative > br.weight_min && wp.representative <= br.weight_max) ?? card.brackets[0]
          return {
            weight_bracket: wp.range, weight_min: wp.min, weight_max: wp.max,
            representative_weight: wp.representative,
            price: b ? b.rate_per_kg * wp.representative + b.reg_fee : 0,
            rate_per_kg: b?.rate_per_kg ?? 0, reg_fee: b?.reg_fee ?? 0,
          }
        })
        result.push({
          type: 'competitor', id: key,
          label: card.vendor_label || `${card.competitor_name} — ${card.service_code}`,
          brackets: cBrackets, currency: card.currency,
          fuelSurchargePct: card.fuel_surcharge_pct, weightStep: card.weight_step,
        })
      } else if (type === 'scenario') {
        const sc = scenarioOptions.find(s => s.id === id)
        const costs = scenarioCosts[id]
        if (!costs) continue
        result.push({
          type: 'scenario', id: key,
          label: sc?.name ?? id.slice(0, 8),
          costs, pricingMode: scenarioModes[id],
        })
      }
    }
    return result
  }, [selectedKeys, ownCards, compCards, scenarioOptions, scenarioCosts, scenarioModes])

  // ── Benchmark options (cards/competitors from step 0 selection) ──
  const benchmarkOptions = useMemo(() => {
    return sources.filter(s => s.type === 'rate-card' || s.type === 'competitor')
  }, [sources])

  // ── Generate brackets from benchmark (war pricing) or scenario (markup) ──
  const generateBrackets = useCallback(async () => {
    if (strategy === 'war' && benchmarkKey) {
      const src = sources.find(s => s.id === benchmarkKey)
      if (!src) return
      const factor = 1 + adjustPct / 100
      const newBrackets: RateCardBracket[] = UNIFIED_WEIGHT_POINTS.map(wp => {
        let benchFreight = 0
        let benchReg = 0
        if (src.type === 'rate-card') {
          const b = (src as RateCardSource).brackets.find(b => wp.representative > b.weight_min_kg && wp.representative <= b.weight_max_kg)
            ?? (src as RateCardSource).brackets[0]
          benchFreight = b?.freight_rate_hkd_per_kg ?? 0
          benchReg = b?.reg_fee_hkd ?? 0
        } else if (src.type === 'competitor') {
          // Competitor: convert to HKD
          const card = compCards.find(c => src.id === `comp:${c.id}`)
          const currencyToHkd = (() => {
            const r = DEFAULT_EXCHANGE_RATES
            const cur = card?.currency ?? 'HKD'
            switch (cur) {
              case 'HKD': return 1
              case 'JPY': return r.jpy_hkd ?? 0.052
              case 'USD': return r.usd_hkd
              case 'RMB': return 1 / r.hkd_rmb
              default: return 1
            }
          })()
          const cb = card?.brackets.find(br => wp.representative > br.weight_min && wp.representative <= br.weight_max) ?? card?.brackets[0]
          benchFreight = (cb?.rate_per_kg ?? 0) * currencyToHkd
          benchReg = (cb?.reg_fee ?? 0) * currencyToHkd
        }
        // War pricing: adjust freight, keep reg fee from benchmark
        const warFreight = Math.ceil(benchFreight * factor)
        const regFee = benchReg > 0 ? Math.ceil(benchReg) : getRegFee(wp.representative)
        const revenue = warFreight * wp.representative + regFee
        return {
          weight_range: wp.range,
          weight_min_kg: wp.min,
          weight_max_kg: wp.max,
          representative_weight_kg: wp.representative,
          cost_hkd: 0, // no cost in war pricing mode
          freight_rate_hkd_per_kg: warFreight,
          reg_fee_hkd: regFee,
          revenue_hkd: revenue,
          actual_margin: 0,
          is_manually_adjusted: false,
        }
      })
      setBrackets(newBrackets)
    } else if (strategy === 'markup') {
      // Use first scenario in selection for cost-based markup
      const scenarioKey = selectedKeys.find(k => k.startsWith('scenario:'))
      if (!scenarioKey) return
      const id = scenarioKey.split(':')[1]

      setGeneratingMarkup(true)
      try {
        const scRes = await fetch(`/api/scenarios/${id}`)
        if (!scRes.ok) throw new Error('scenario fetch failed')
        const sc = await scRes.json()

        const previewRes = await fetch('/api/scenarios/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...sc, weights: customBrackets }),
        })
        let costs: BracketCost[] | null = null
        if (previewRes.ok) {
          const data = await previewRes.json()
          costs = data.cost_per_bracket ?? null
        }
        if (!costs || costs.length === 0) {
          costs = scenarioCosts[id] ?? null
        }
        if (!costs) {
          toast.error('計算成本失敗')
          return
        }
        setBrackets(generateRateCardFromScenario(costs, targetMargin))
      } catch {
        toast.error('計算成本失敗')
      } finally {
        setGeneratingMarkup(false)
      }
    }
  }, [strategy, benchmarkKey, adjustPct, targetMargin, sources, selectedKeys, scenarioCosts, compCards, customBrackets])

  // ── Avg margin ──
  const avgMargin = useMemo(() => {
    if (brackets.length === 0) return 0
    const withMargin = brackets.filter(b => b.actual_margin !== 0)
    if (withMargin.length === 0) return 0
    return withMargin.reduce((s, b) => s + b.actual_margin, 0) / withMargin.length
  }, [brackets])

  // ── Re-comparison sources (step 5): original sources + generated card ──
  const recomparisonSources: DataSource[] = useMemo(() => {
    if (brackets.length === 0) return sources
    const myCard: RateCardSource = {
      type: 'rate-card',
      id: 'generated',
      label: '我的新價卡',
      brackets,
    }
    return [myCard, ...sources]
  }, [sources, brackets])

  // ── Save ──
  const handleSave = useCallback(async () => {
    if (!brackets.length || !cardName.trim()) return
    setSaving(true)
    try {
      const scenarioKey = selectedKeys.find(k => k.startsWith('scenario:'))
      const scenarioId = scenarioKey ? scenarioKey.split(':')[1] : undefined
      const res = await fetch('/api/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cardName.trim(),
          product_type: 'economy',
          target_margin: strategy === 'war' ? 0 : targetMargin,
          brackets,
          scenario_id: scenarioId,
          country_code: country,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSavedId(data.id)
      toast.success('價卡已儲存')
    } catch {
      toast.error(t.common.saveFailed)
    } finally {
      setSaving(false)
    }
  }, [brackets, cardName, strategy, targetMargin, selectedKeys, country, t])

  // ── Export ──
  const handleExport = useCallback(() => {
    if (!brackets.length) return
    const r = DEFAULT_EXCHANGE_RATES
    const mul = exportCurrency === 'HKD' ? 1
      : exportCurrency === 'RMB' ? r.hkd_rmb
      : exportCurrency === 'USD' ? 1 / r.usd_hkd
      : 1 / (r.jpy_hkd ?? 0.052)
    exportRateCardToExcel(
      { name: cardName || 'Competitive Rate Card', product_type: 'economy', target_margin: 0, brackets },
      exportCurrency, mul,
    )
    toast.success('Excel 已下載')
  }, [brackets, cardName, exportCurrency])

  // ── Step navigation ──
  const handleStepChange = useCallback(async (newStep: number) => {
    if (newStep === 1 && step === 0) {
      await computeCosts()
    }
    setStep(newStep)
  }, [step, computeCosts])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← {t.common.back}
        </Button>
        <h2 className="text-xl font-bold">B. 競價定價</h2>
        <span className="text-sm text-muted-foreground">{country}</span>
      </div>

      <FlowStepper
        steps={STEP_LABELS}
        currentStep={step}
        onStepChange={handleStepChange}
        canProceed={
          step === 0 ? selectedKeys.length >= 2 :
          step === 1 ? sources.length >= 2 :
          step === 2 ? brackets.length > 0 :
          step === 5 ? !!savedId :
          true
        }
        finishLabel="完成"
        onFinish={onBack}
      />

      {/* ── Step 0: Select comparison targets ── */}
      {step === 0 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              選擇 2-6 個對標目標（已選 {selectedKeys.length}/6）。可混合選取：最多 3 張價卡 + 3 個成本方案
            </p>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[#FF6B00]" />
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  const priceCount = selectedKeys.filter(k => !k.startsWith('scenario:')).length
                  const scenarioCount = selectedKeys.filter(k => k.startsWith('scenario:')).length
                  const priceFull = priceCount >= 3
                  const scenarioFull = scenarioCount >= 3
                  return (
                    <>
                {ownCards.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">我的價卡 ({priceCount}/3)</h4>
                    <div className="grid gap-1.5">
                      {ownCards.map(c => {
                        const key = `own:${c.id}`
                        const sel = selectedKeys.includes(key)
                        const dis = !sel && priceFull
                        return (
                          <button key={key} type="button" onClick={() => toggleTarget(key)}
                            disabled={dis}
                            className={`flex items-center justify-between px-4 py-2 rounded-md border text-left text-sm transition-colors
                              ${sel ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30' : 'border-border hover:border-muted-foreground/30'}
                              ${dis ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <span>{c.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {compCards.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">競對價卡 ({priceCount}/3)</h4>
                    <div className="grid gap-1.5">
                      {compCards.map(c => {
                        const key = `comp:${c.id}`
                        const sel = selectedKeys.includes(key)
                        const dis = !sel && priceFull
                        const displayLabel = c.vendor_label || `${c.competitor_name} — ${c.service_code}`
                        return (
                          <button key={key} type="button" onClick={() => toggleTarget(key)}
                            disabled={dis}
                            className={`flex items-center justify-between gap-3 px-4 py-2 rounded-md border text-left text-sm transition-colors
                              ${sel ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/30' : 'border-border hover:border-muted-foreground/30'}
                              ${dis ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <div className="flex items-baseline gap-2 min-w-0 flex-1">
                              <span className="truncate">{displayLabel}</span>
                              {c.version != null && (
                                <span className="text-[10px] font-mono text-muted-foreground shrink-0">v{c.version}</span>
                              )}
                              {c.source_file && (
                                <span className="text-[10px] text-muted-foreground font-mono truncate">
                                  {c.source_file}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">{c.currency}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {scenarioOptions.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">成本方案 ({scenarioCount}/3)</h4>
                    <div className="grid gap-1.5">
                      {scenarioOptions.map(sc => {
                        const key = `scenario:${sc.id}`
                        const sel = selectedKeys.includes(key)
                        const dis = !sel && scenarioFull
                        return (
                          <button key={key} type="button" onClick={() => toggleTarget(key)}
                            disabled={dis}
                            className={`flex items-center justify-between px-4 py-2 rounded-md border text-left text-sm transition-colors
                              ${sel ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-950/30' : 'border-border hover:border-muted-foreground/30'}
                              ${dis ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <span>{sc.name}</span>
                            {sc.pricing_mode && <span className="text-xs text-muted-foreground">{sc.pricing_mode}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {ownCards.length === 0 && compCards.length === 0 && scenarioOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {country} 尚無任何價卡或方案可供比較
                  </p>
                )}
                    </>
                  )
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Side-by-side comparison ── */}
      {step === 1 && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#FF6B00]" />
              <span className="ml-2 text-sm text-muted-foreground">計算中...</span>
            </div>
          ) : sources.length >= 2 ? (
            <UnifiedVerificationTable sources={sources} highlightCheapest compareBy="price" enableMarginCompare />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">至少需要 2 個對標目標</p>
          )}
        </div>
      )}

      {/* ── Step 2: Generate pricing ── */}
      {step === 2 && (
        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* Strategy selection */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setStrategy('war')}
                className={`flex-1 rounded-md border p-4 text-left transition-colors ${
                  strategy === 'war' ? 'border-[#FF6B00] bg-[#FF6B00]/5' : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <div className="font-medium mb-1">戰價模式</div>
                <div className="text-xs text-muted-foreground">跟隨對標價卡 ± 調整%</div>
              </button>
              <button
                type="button"
                onClick={() => setStrategy('markup')}
                className={`flex-1 rounded-md border p-4 text-left transition-colors ${
                  strategy === 'markup' ? 'border-[#FF6B00] bg-[#FF6B00]/5' : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <div className="font-medium mb-1">成本加成</div>
                <div className="text-xs text-muted-foreground">基於方案成本 + 目標毛利</div>
              </button>
            </div>

            {strategy === 'war' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label>對標價卡</Label>
                  <Select value={benchmarkKey} onValueChange={setBenchmarkKey}>
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="選擇對標" />
                    </SelectTrigger>
                    <SelectContent>
                      {benchmarkOptions.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Label>價差調整</Label>
                  <Input
                    type="number"
                    step={1}
                    value={adjustPct}
                    onChange={e => setAdjustPct(parseFloat(e.target.value) || 0)}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">
                    % ({adjustPct < 0 ? `比對標便宜 ${Math.abs(adjustPct)}%` : adjustPct > 0 ? `比對標貴 ${adjustPct}%` : '跟價'})
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label className="shrink-0 whitespace-nowrap">目標毛利率</Label>
                  <div className="relative w-28">
                    <Input
                      type="number"
                      step={1}
                      min={0}
                      max={99}
                      value={targetMarginPct}
                      onChange={e => setTargetMarginPct(parseFloat(e.target.value) || 0)}
                      className="pr-8 text-right tabular-nums"
                    />
                    <span className="pointer-events-none select-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
                {!selectedKeys.some(k => k.startsWith('scenario:')) && (
                  <p className="text-sm text-orange-500">需要至少選擇一個成本方案才能使用成本加成模式</p>
                )}
                <div className="border-t pt-3">
                  <BracketEditor brackets={customBrackets} onChange={setCustomBrackets} />
                </div>
              </div>
            )}

            <Button
              className="bg-[#FF6B00] hover:bg-[#FF6B00]/90 text-white"
              onClick={generateBrackets}
              disabled={
                generatingMarkup ||
                (strategy === 'war' ? !benchmarkKey : !selectedKeys.some(k => k.startsWith('scenario:')) || customBrackets.length === 0)
              }
            >
              {generatingMarkup && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              生成價格
            </Button>

            {brackets.length > 0 && (
              <p className="text-sm text-muted-foreground">
                已生成 {brackets.length} 個重量段的價格
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Verification table ── */}
      {step === 3 && brackets.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">驗算生成的價格</p>
          <RateCardTable brackets={brackets} />
        </div>
      )}

      {/* ── Step 4: Fine-tune + live re-comparison ── */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">逐段微調運費、掛號費、或直接輸入目標毛利%</span>
            {avgMargin !== 0 && (
              <span className={`px-2 py-0.5 rounded text-xs font-mono ${getMarginColorClass(avgMargin)}`}>
                平均毛利 {(avgMargin * 100).toFixed(1)}%
              </span>
            )}
          </div>
          <RateCardTable brackets={brackets} onBracketsChange={setBrackets} />

          {brackets.length > 0 && sources.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">實時再比對 — 我的新價卡 vs 對標</p>
              <p className="text-xs text-muted-foreground">
                調整上方價格，下方同步更新與所有對標的比較與毛利
              </p>
              <UnifiedVerificationTable
                sources={recomparisonSources}
                highlightCheapest
                compareBy="price"
                enableMarginCompare
              />
            </div>
          )}
        </div>
      )}

      {/* ── Step 5: Confirm & export ── */}
      {step === 5 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {savedId ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-lg font-medium">價卡已儲存</p>
                <div className="flex items-center gap-3">
                  <Label>匯出幣別</Label>
                  <Select value={exportCurrency} onValueChange={v => setExportCurrency(v as ExportCurrency)}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HKD">HKD</SelectItem>
                      <SelectItem value="RMB">RMB</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="JPY">JPY</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button className="bg-[#FF6B00] hover:bg-[#FF6B00]/90 text-white" onClick={handleExport}>
                    下載 Excel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  確認 {brackets.length} 個重量段
                </p>
                <div className="flex items-center gap-3">
                  <Label>價卡名稱</Label>
                  <Input
                    value={cardName}
                    onChange={e => setCardName(e.target.value)}
                    placeholder={`${country} 競價定價 ${new Date().toISOString().slice(0, 10)}`}
                    className="w-80"
                  />
                </div>
                <Button
                  className="bg-[#FF6B00] hover:bg-[#FF6B00]/90 text-white"
                  onClick={handleSave}
                  disabled={saving || !cardName.trim()}
                >
                  {saving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />儲存中...</>
                  ) : '確認儲存'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
