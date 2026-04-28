'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, Globe, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { FlowStepper } from './shared/FlowStepper'
import { generateRateCardFromScenario } from '@/lib/calculations/scenario-pricing'
import type { BracketCost } from '@/types/scenario'
import type { RateCardBracket, ApiCountryBracket } from '@/types'

interface ScenarioOption {
  id: string
  name: string
}

interface GlobalCountryCost {
  country_code: string
  country_name_en: string
  country_name_zh: string | null
  cost_per_bracket: BracketCost[]
}

interface GlobalCountryBracket {
  country_code: string
  country_name_en: string
  country_name_zh: string | null
  brackets: RateCardBracket[]
}

interface CostPricingFlowProps {
  onBack: () => void
}

const STEP_LABELS = ['選方案', '全球試算', '預覽價卡', '儲存匯出']

export function CostPricingFlow({ onBack }: CostPricingFlowProps) {
  const t = useT()
  const [step, setStep] = useState(0)

  // Step 0
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loadingScenarios, setLoadingScenarios] = useState(true)

  // Step 1
  const [globalCosts, setGlobalCosts] = useState<GlobalCountryCost[]>([])
  const [computing, setComputing] = useState(false)
  const [targetMarginPct, setTargetMarginPct] = useState(15)

  // Step 2
  const [generatedCountries, setGeneratedCountries] = useState<GlobalCountryBracket[]>([])
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null)

  // Step 3
  const [productName, setProductName] = useState('')
  const [productCode, setProductCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoadingScenarios(true)
      const res = await fetch('/api/scenarios')
      if (res.ok) {
        const data = await res.json()
        setScenarios(data ?? [])
      }
      setLoadingScenarios(false)
    }
    load()
  }, [])

  const handleComputeGlobal = useCallback(async () => {
    if (!selectedId) return
    setComputing(true)
    try {
      const res = await fetch('/api/scenarios/compute-global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: selectedId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '試算失敗')
      }
      const data = await res.json()
      setGlobalCosts(data.countries ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '試算失敗')
    } finally {
      setComputing(false)
    }
  }, [selectedId])

  const handleGenerate = useCallback(() => {
    const margin = targetMarginPct / 100
    const generated = globalCosts.map((c) => ({
      country_code: c.country_code,
      country_name_en: c.country_name_en,
      country_name_zh: c.country_name_zh,
      brackets: generateRateCardFromScenario(c.cost_per_bracket, margin),
    }))
    setGeneratedCountries(generated)
    setStep(2)
  }, [globalCosts, targetMarginPct])

  const handleSave = useCallback(async () => {
    if (!productName.trim() || !generatedCountries.length) return
    setSaving(true)
    try {
      const countryBracketsPayload = generatedCountries.map((c) => ({
        country_code: c.country_code,
        country_name_en: c.country_name_en,
        country_name_zh: c.country_name_zh,
        brackets: c.brackets.map((b): ApiCountryBracket => ({
          weight_min: b.weight_min_kg,
          weight_max: b.weight_max_kg,
          rate_per_kg: b.freight_rate_hkd_per_kg,
          reg_fee: b.reg_fee_hkd,
          cost_hkd: b.cost_hkd,
        })),
      }))

      const res = await fetch('/api/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName.trim(),
          product_code: productCode.trim() || undefined,
          scenario_id: selectedId,
          source: 'scenario',
          country_brackets: countryBracketsPayload,
        }),
      })

      if (!res.ok) throw new Error()
      const data = await res.json()
      setSavedId(data.id)
      toast.success(`已儲存「${productName}」v${data.version}，涵蓋 ${data.country_count} 個國家`)
    } catch {
      toast.error('儲存失敗')
    } finally {
      setSaving(false)
    }
  }, [productName, productCode, selectedId, generatedCountries])

  // Preview: find representative prices for key weights in each country
  const previewWeights = [0.5, 1, 2, 5]
  const getPreviewPrice = (brackets: RateCardBracket[], kg: number) => {
    const b = brackets.find((br) => kg > br.weight_min_kg && kg <= br.weight_max_kg)
      ?? brackets[brackets.length - 1]
    if (!b) return null
    return Math.ceil(b.freight_rate_hkd_per_kg * kg + b.reg_fee_hkd)
  }

  // Avg margin across all countries
  const avgMargin = useMemo(() => {
    if (!generatedCountries.length) return 0
    let total = 0, count = 0
    for (const c of generatedCountries) {
      for (const b of c.brackets) {
        total += b.actual_margin
        count++
      }
    }
    return count > 0 ? total / count : 0
  }, [generatedCountries])

  const canProceed = (
    step === 0 ? !!selectedId :
    step === 1 ? globalCosts.length > 0 :
    step === 2 ? generatedCountries.length > 0 :
    !!productName.trim()
  )

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← {t.common.back}
        </Button>
        <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          A. 成本定價
        </h2>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Globe className="h-3 w-3" /> 全球模式
        </span>
      </div>

      <FlowStepper
        steps={STEP_LABELS}
        currentStep={step}
        onStepChange={(s) => {
          if (s < step) setStep(s)
        }}
        canProceed={canProceed}
        finishLabel="完成"
        onFinish={onBack}
      />

      {/* ── Step 0: Select scenario ── */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">選擇成本方案</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              選擇一個 bc_combined 方案，系統會自動讀取 D 段供應商的全球費率進行試算。
            </p>
            {loadingScenarios ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> 載入中…
              </div>
            ) : scenarios.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                尚無成本方案，請先到「方案分析」建立
              </p>
            ) : (
              <div className="grid gap-2">
                {scenarios.map((sc) => {
                  const isSelected = selectedId === sc.id
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setSelectedId(sc.id)}
                      className={`flex items-center justify-between px-4 py-3 rounded-md border text-left text-sm transition-colors ${
                        isSelected
                          ? 'border-[#0284C7] bg-[#0284C7]/5 text-[#0284C7]'
                          : 'border-border hover:border-muted-foreground/30'
                      }`}
                    >
                      <span className="font-medium">{sc.name}</span>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-[#0284C7]" />}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="pt-2 flex justify-end">
              <Button
                disabled={!selectedId}
                onClick={() => setStep(1)}
              >
                下一步
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Global compute + margin config ── */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">全球成本試算</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {globalCosts.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    系統將逐一計算 D 段供應商所有目的國的 A+BC+D 完整成本。
                  </p>
                  <Button
                    onClick={handleComputeGlobal}
                    disabled={computing}
                    className="gap-2"
                  >
                    {computing && <Loader2 className="h-4 w-4 animate-spin" />}
                    {computing ? '試算中…' : '開始試算'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <CheckCircle2 className="h-4 w-4" />
                    已完成 {globalCosts.length} 個國家的成本試算
                  </div>
                  {/* Cost summary table */}
                  <div className="overflow-auto max-h-64 rounded border text-xs">
                    <table className="w-full data-table">
                      <thead className="sticky top-0 bg-muted/80">
                        <tr>
                          <th className="px-3 py-2 text-left">國家</th>
                          {globalCosts[0]?.cost_per_bracket.slice(0, 4).map((b) => (
                            <th key={b.weight_range} className="px-3 py-2 text-right">
                              {b.representative_weight_kg}kg 成本
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {globalCosts.map((c) => (
                          <tr key={c.country_code} className="border-t">
                            <td className="px-3 py-1.5 font-medium">
                              {c.country_name_en}
                              {c.country_name_zh && (
                                <span className="text-muted-foreground ml-1">({c.country_name_zh})</span>
                              )}
                            </td>
                            {c.cost_per_bracket.slice(0, 4).map((b) => (
                              <td key={b.weight_range} className="px-3 py-1.5 text-right tabular-nums">
                                {b.cost_hkd.toFixed(1)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {globalCosts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">設定全球加成</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-end gap-4">
                  <div className="space-y-1.5">
                    <Label>目標毛利率 (%)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={99}
                        value={targetMarginPct}
                        onChange={(e) => setTargetMarginPct(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)))}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <Button onClick={handleGenerate}>
                    生成全球價卡 →
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  套用統一毛利率後可在下一步逐國檢視，暫不支援逐國微調。
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Step 2: Preview all countries ── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                全球價卡預覽 — {generatedCountries.length} 個國家 ·
                均毛利 {(avgMargin * 100).toFixed(1)}% ·
                加成 {targetMarginPct}%
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto rounded border text-xs">
                <table className="w-full data-table">
                  <thead className="sticky top-0 bg-muted/80">
                    <tr>
                      <th className="px-3 py-2 text-left w-48">國家</th>
                      {previewWeights.map((kg) => (
                        <th key={kg} className="px-3 py-2 text-right">
                          {kg}kg 總價
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right">掛號費</th>
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {generatedCountries.map((c) => {
                      const isExpanded = expandedCountry === c.country_code
                      const regFee = c.brackets[0]?.reg_fee_hkd ?? 0
                      return (
                        <>
                          <tr
                            key={c.country_code}
                            className="border-t hover:bg-muted/30 cursor-pointer"
                            onClick={() => setExpandedCountry(isExpanded ? null : c.country_code)}
                          >
                            <td className="px-3 py-2 font-medium">
                              {c.country_name_en}
                              {c.country_name_zh && (
                                <span className="text-muted-foreground ml-1 text-[10px]">
                                  {c.country_name_zh}
                                </span>
                              )}
                            </td>
                            {previewWeights.map((kg) => (
                              <td key={kg} className="px-3 py-2 text-right tabular-nums">
                                {getPreviewPrice(c.brackets, kg) ?? '—'}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right tabular-nums">{regFee}</td>
                            <td className="px-2 py-2 text-muted-foreground">
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${c.country_code}-detail`} className="bg-muted/20">
                              <td colSpan={previewWeights.length + 3} className="px-4 pb-3">
                                <table className="w-full text-[11px] mt-2">
                                  <thead>
                                    <tr className="text-muted-foreground">
                                      <th className="text-left py-1">重量段</th>
                                      <th className="text-right py-1">售價/kg</th>
                                      <th className="text-right py-1">掛號費</th>
                                      <th className="text-right py-1">成本</th>
                                      <th className="text-right py-1">毛利率</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {c.brackets.map((b) => (
                                      <tr key={b.weight_range} className="border-t border-muted/40">
                                        <td className="py-1">{b.weight_range}</td>
                                        <td className="text-right tabular-nums">{b.freight_rate_hkd_per_kg}</td>
                                        <td className="text-right tabular-nums">{b.reg_fee_hkd}</td>
                                        <td className="text-right tabular-nums text-muted-foreground">
                                          {b.cost_hkd.toFixed(1)}
                                        </td>
                                        <td className="text-right tabular-nums">
                                          {(b.actual_margin * 100).toFixed(1)}%
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              ← 返回調整加成
            </Button>
            <Button onClick={() => setStep(3)}>
              下一步：儲存 →
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Save + export ── */}
      {step === 3 && (
        <div className="space-y-4 max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">儲存全球價卡</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {savedId ? (
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>儲存成功！價卡 ID: {savedId}</span>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>產品名稱 *</Label>
                      <Input
                        placeholder="e.g. RH 全球小包 Q2 2026"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        產品代號{' '}
                        <span className="text-muted-foreground text-xs">(選填，留空自動生成)</span>
                      </Label>
                      <Input
                        placeholder="e.g. RH-GLOBAL-Q2-2026"
                        value={productCode}
                        onChange={(e) => setProductCode(e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                    <p>
                      <span className="text-muted-foreground">國家數：</span>
                      {generatedCountries.length}
                    </p>
                    <p>
                      <span className="text-muted-foreground">均毛利率：</span>
                      {(avgMargin * 100).toFixed(1)}%
                    </p>
                    <p>
                      <span className="text-muted-foreground">設定加成：</span>
                      {targetMarginPct}%
                    </p>
                  </div>

                  <Button
                    className="w-full"
                    disabled={saving || !productName.trim()}
                    onClick={handleSave}
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {saving ? '儲存中…' : '確認儲存'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
