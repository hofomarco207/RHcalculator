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
  computeScenarioCostAtWeight,
  type ScenarioSource,
} from './shared/UnifiedVerificationTable'
import { RateCardTable } from '@/components/rate-card/RateCardTable'
import { BracketEditor } from '@/components/rate-card/BracketEditor'
import { DEFAULT_EXCHANGE_RATES, UNIFIED_WEIGHT_POINTS } from '@/types'
import type { WeightPoint } from '@/types'
import type { BracketCost } from '@/types/scenario'
import type { RateCardBracket } from '@/types'
import { generateRateCardFromScenario } from '@/lib/calculations/scenario-pricing'
import { exportRateCardToExcel, type ExportCurrency } from '@/lib/excel/exporter'
import { createClient } from '@/lib/supabase/client'

interface ScenarioOption {
  id: string
  name: string
  pricing_mode?: string
}

interface CostPricingFlowProps {
  onBack: () => void
}

const STEP_LABELS = ['選方案', '驗算比較', '設定加成', '微調價格', '確認儲存 / 匯出']

export function CostPricingFlow({ onBack }: CostPricingFlowProps) {
  const t = useT()
  const { country } = useCountry()
  const supabase = createClient()

  const [step, setStep] = useState(0)
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [scenarioCosts, setScenarioCosts] = useState<Record<string, BracketCost[]>>({})
  const [scenarioModes, setScenarioModes] = useState<Record<string, string>>({})

  // Step 2: markup config (integer percent, e.g. 20 = 20%)
  const [targetMarginPct, setTargetMarginPct] = useState(15)
  const targetMargin = targetMarginPct / 100
  const [primaryScenarioId, setPrimaryScenarioId] = useState<string>('')
  const [useCustomBrackets, setUseCustomBrackets] = useState(false)
  const [customBrackets, setCustomBrackets] = useState<WeightPoint[]>([...UNIFIED_WEIGHT_POINTS])

  // Step 3: generated brackets (editable)
  const [brackets, setBrackets] = useState<RateCardBracket[]>([])

  // Step 4: save state
  const [cardName, setCardName] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  // Step 5: export currency
  const [exportCurrency, setExportCurrency] = useState<ExportCurrency>('HKD')

  // ── Load scenarios ──
  useEffect(() => {
    if (!country) return
    const load = async () => {
      const { data } = await supabase
        .from('scenarios')
        .select('id, name, pricing_mode')
        .eq('country_code', country)
        .order('created_at', { ascending: false })
      setScenarios(data ?? [])
    }
    load()
  }, [country])

  const toggleScenario = useCallback((id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 4) return prev
      return [...prev, id]
    })
  }, [])

  // ── Compute costs for selected scenarios ──
  const computeSelectedCosts = useCallback(async () => {
    if (selectedIds.length === 0) return
    setLoading(true)
    const costs: Record<string, BracketCost[]> = {}
    const modes: Record<string, string> = {}
    for (const id of selectedIds) {
      if (scenarioCosts[id]) {
        costs[id] = scenarioCosts[id]
        modes[id] = scenarioModes[id]
        continue
      }
      try {
        // Preview at UNIFIED_WEIGHT_POINTS (24 points) so every display weight
        // gets an exact full computation — avoids D段 weight_bracket / first_additional
        // interpolation errors that come from scaling between 6-point representatives.
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
          costs[id] = data.cost_per_bracket ?? []
          modes[id] = data.assumptions?.pricing_mode ?? sc.pricing_mode ?? 'segmented'
        }
      } catch {
        // skip failed
      }
    }
    setScenarioCosts(prev => ({ ...prev, ...costs }))
    setScenarioModes(prev => ({ ...prev, ...modes }))
    setLoading(false)
  }, [selectedIds])

  // ── Build data sources for UnifiedVerificationTable ──
  const sources: ScenarioSource[] = useMemo(() => {
    return selectedIds
      .filter(id => scenarioCosts[id])
      .map(id => {
        const sc = scenarios.find(s => s.id === id)
        return {
          type: 'scenario' as const,
          id,
          label: sc?.name ?? id.slice(0, 8),
          costs: scenarioCosts[id],
          pricingMode: scenarioModes[id],
        }
      })
  }, [selectedIds, scenarioCosts, scenarioModes, scenarios])

  // ── Avg margin ──
  const avgMargin = useMemo(() => {
    if (brackets.length === 0) return 0
    return brackets.reduce((s, b) => s + b.actual_margin, 0) / brackets.length
  }, [brackets])

  // ── Step navigation with side effects ──
  const handleStepChange = useCallback(async (newStep: number) => {
    if (newStep === 1 && step === 0) {
      await computeSelectedCosts()
    }
    if (newStep === 2 && step === 1) {
      // Default primary to first selected with costs; do NOT auto-generate brackets
      const pid = selectedIds.find(id => scenarioCosts[id])
      if (pid && !primaryScenarioId) {
        setPrimaryScenarioId(pid)
      }
    }
    setStep(newStep)
  }, [step, selectedIds, computeSelectedCosts, scenarioCosts, primaryScenarioId])

  // ── Generate brackets ──
  const handleGenerate = useCallback(() => {
    const id = primaryScenarioId || selectedIds.find(id => scenarioCosts[id])
    if (!id || !scenarioCosts[id]) return
    const costs = scenarioCosts[id]

    if (useCustomBrackets && customBrackets.length > 0) {
      // Build BracketCost[] from custom brackets by interpolating scenario costs
      const customCosts: BracketCost[] = customBrackets.map(bp => {
        const result = computeScenarioCostAtWeight(bp.representative, costs)
        return {
          weight_range: bp.range,
          weight_min_kg: bp.min,
          weight_max_kg: bp.max,
          representative_weight_kg: bp.representative,
          cost_hkd: result.cost,
          seg_a: result.segA,
          seg_b: result.segB,
          seg_c: result.segC,
          seg_d: result.segD,
          seg_bc: result.segBC,
          seg_b2: result.segB2,
          seg_b2c: result.segB2C,
        }
      })
      setBrackets(generateRateCardFromScenario(customCosts, targetMargin))
    } else {
      setBrackets(generateRateCardFromScenario(costs, targetMargin))
    }
  }, [primaryScenarioId, selectedIds, scenarioCosts, targetMargin, useCustomBrackets, customBrackets])

  // ── Save rate card ──
  const handleSave = useCallback(async () => {
    if (!brackets.length || !cardName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cardName.trim(),
          product_type: 'economy',
          target_margin: targetMargin,
          brackets,
          scenario_id: primaryScenarioId || selectedIds[0],
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
  }, [brackets, cardName, targetMargin, primaryScenarioId, selectedIds, country, t])

  // ── Export Excel ──
  const handleExport = useCallback(() => {
    if (!brackets.length) return
    const r = DEFAULT_EXCHANGE_RATES
    const mul = exportCurrency === 'HKD' ? 1
      : exportCurrency === 'RMB' ? r.hkd_rmb
      : exportCurrency === 'USD' ? 1 / r.usd_hkd
      : 1 / (r.jpy_hkd ?? 0.052)
    exportRateCardToExcel(
      { name: cardName || 'Cost Rate Card', product_type: 'economy', target_margin: targetMargin, brackets },
      exportCurrency,
      mul,
    )
    toast.success('Excel 已下載')
  }, [brackets, cardName, targetMargin, exportCurrency])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← {t.common.back}
        </Button>
        <h2 className="text-xl font-bold">A. 成本定價</h2>
        <span className="text-sm text-muted-foreground">{country}</span>
      </div>

      <FlowStepper
        steps={STEP_LABELS}
        currentStep={step}
        onStepChange={handleStepChange}
        canProceed={
          step === 0 ? selectedIds.length > 0 :
          step === 1 ? sources.length > 0 :
          step === 2 ? brackets.length > 0 :
          step === 3 ? brackets.length > 0 :
          true
        }
        finishLabel="完成"
        onFinish={onBack}
      />

      {/* ── Step 0: Select scenarios ── */}
      {step === 0 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              選擇最多 4 個成本方案進行比較（已選 {selectedIds.length}/4）
            </p>
            {scenarios.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {country} 尚無成本方案，請先到「成本方案生成」建立
              </p>
            ) : (
              <div className="grid gap-2">
                {scenarios.map(sc => {
                  const isSelected = selectedIds.includes(sc.id)
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => toggleScenario(sc.id)}
                      className={`
                        flex items-center justify-between px-4 py-3 rounded-md border text-left text-sm transition-colors
                        ${isSelected
                          ? 'border-[#FF6B00] bg-[#FF6B00]/5 text-[#FF6B00]'
                          : 'border-border hover:border-muted-foreground/30'
                        }
                        ${!isSelected && selectedIds.length >= 4 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                      disabled={!isSelected && selectedIds.length >= 4}
                    >
                      <span className="font-medium">{sc.name}</span>
                      {sc.pricing_mode && (
                        <span className="text-xs text-muted-foreground">{sc.pricing_mode}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Multi-scenario verification ── */}
      {step === 1 && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#FF6B00]" />
              <span className="ml-2 text-sm text-muted-foreground">計算成本中...</span>
            </div>
          ) : sources.length > 0 ? (
            <UnifiedVerificationTable
              sources={sources}
              highlightCheapest
              compareBy="cost"
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              無法取得方案成本數據
            </p>
          )}
        </div>
      )}

      {/* ── Step 2: Set markup ── */}
      {step === 2 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
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
              <div className="flex items-center gap-2">
                <Label>基於方案</Label>
                <Select
                  value={primaryScenarioId}
                  onValueChange={setPrimaryScenarioId}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="選擇方案" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedIds.filter(id => scenarioCosts[id]).map(id => {
                      const sc = scenarios.find(s => s.id === id)
                      return (
                        <SelectItem key={id} value={id}>{sc?.name ?? id.slice(0, 8)}</SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Custom bracket toggle + editor */}
            <div className="space-y-3 border rounded-md p-4">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={useCustomBrackets}
                    onChange={e => setUseCustomBrackets(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  自定義重量區間
                </label>
                {!useCustomBrackets && (
                  <span className="text-xs text-muted-foreground">
                    使用方案預設區間（{primaryScenarioId && scenarioCosts[primaryScenarioId]
                      ? scenarioCosts[primaryScenarioId].length
                      : '—'} 段）
                  </span>
                )}
                {useCustomBrackets && (
                  <span className="text-xs text-muted-foreground">
                    {customBrackets.length} 個自定義區間
                  </span>
                )}
              </div>
              {useCustomBrackets && (
                <BracketEditor brackets={customBrackets} onChange={setCustomBrackets} />
              )}
            </div>

            <Button
              size="sm"
              className="bg-[#FF6B00] hover:bg-[#FF6B00]/90 text-white"
              onClick={handleGenerate}
            >
              生成價格
            </Button>

            {brackets.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">已生成 {brackets.length} 個重量段</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono ${getMarginColorClass(avgMargin)}`}>
                    平均毛利 {(avgMargin * 100).toFixed(1)}%
                  </span>
                </div>
                <RateCardTable brackets={brackets} onBracketsChange={setBrackets} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Fine-tune prices (with live verification) ── */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              逐段微調運費、掛號費、或直接輸入目標毛利%
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-mono ${getMarginColorClass(avgMargin)}`}>
              平均毛利 {(avgMargin * 100).toFixed(1)}%
            </span>
          </div>
          <RateCardTable brackets={brackets} onBracketsChange={setBrackets} />

          {brackets.length > 0 && sources.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">實時驗算 — 成本 vs 新價格</p>
              <p className="text-xs text-muted-foreground">
                調整上方的價格，下方表格會同步更新毛利與成本對比
              </p>
              <UnifiedVerificationTable
                sources={[
                  ...sources,
                  {
                    type: 'rate-card' as const,
                    id: 'tuned',
                    label: '微調後價卡',
                    brackets,
                  },
                ]}
                compareBy="cost"
                enableMarginCompare
              />
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Confirm, save & export ── */}
      {step === 4 && (
        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* Final rate card preview */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium">最終價卡預覽</h3>
                <span className="text-xs text-muted-foreground">
                  {brackets.length} 段 · 平均毛利
                </span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${getMarginColorClass(avgMargin)}`}>
                  {(avgMargin * 100).toFixed(1)}%
                </span>
              </div>
              <RateCardTable brackets={brackets} />
            </div>

            {/* Save + Export row */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Label>價卡名稱</Label>
                <Input
                  value={cardName}
                  onChange={e => setCardName(e.target.value)}
                  placeholder={`${country} 成本定價 ${new Date().toISOString().slice(0, 10)}`}
                  className="w-80"
                  disabled={!!savedId}
                />
                {savedId && <CheckCircle2 className="h-4 w-4 text-green-500" />}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  className="bg-[#FF6B00] hover:bg-[#FF6B00]/90 text-white"
                  onClick={handleSave}
                  disabled={saving || !cardName.trim() || !!savedId}
                >
                  {saving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />儲存中...</>
                  ) : savedId ? '已儲存' : '確認儲存'}
                </Button>
                <span className="text-sm text-muted-foreground">|</span>
                <Label>匯出</Label>
                <Select value={exportCurrency} onValueChange={v => setExportCurrency(v as ExportCurrency)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HKD">HKD</SelectItem>
                    <SelectItem value="RMB">RMB</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={!brackets.length}
                >
                  下載 Excel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                此價卡可在「競價定價」(B 路徑) 中作為對標目標使用
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
