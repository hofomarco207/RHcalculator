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
import type { RateCardBracket, ApiCountryBracket } from '@/types'
import type { CompetitorRateCard } from '@/types/pricing-analysis'

interface CompetitivePricingFlowProps {
  onBack: () => void
}

// One grouped entry per (competitor_name, service_code) — global card with N countries.
interface CompetitorGroup {
  key: string
  competitor_name: string
  service_code: string
  vendor_label: string | null
  country_count: number
  version: number
  cards: CompetitorRateCard[]
}

interface GlobalCountryBracket {
  country_code: string
  country_name_en: string
  country_name_zh: string | null
  brackets: RateCardBracket[]
}

const STEP_LABELS = ['選對標', '策略設定', '全球預覽', '儲存']

export function CompetitivePricingFlow({ onBack }: CompetitivePricingFlowProps) {
  const t = useT()
  const [step, setStep] = useState(0)

  // Step 0
  const [compGroups, setCompGroups] = useState<CompetitorGroup[]>([])
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Step 1 — war pricing config
  const [adjustPct, setAdjustPct] = useState(-3)

  // Step 2 — generated global brackets
  const [generatedCountries, setGeneratedCountries] = useState<GlobalCountryBracket[]>([])
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null)

  // Step 3 — save
  const [productName, setProductName] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  // Load all current competitor cards via API (uses admin client, bypasses RLS)
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/competitor-rate-cards')
        const cards: CompetitorRateCard[] = res.ok ? await res.json() : []

        const groupMap = new Map<string, CompetitorGroup>()
        for (const c of cards) {
          const key = `comp-grp:${c.competitor_name}:${c.service_code}`
          if (!groupMap.has(key)) {
            groupMap.set(key, {
              key,
              competitor_name: c.competitor_name,
              service_code: c.service_code,
              vendor_label: c.vendor_label ?? null,
              country_count: 0,
              version: c.version ?? 1,
              cards: [],
            })
          }
          const g = groupMap.get(key)!
          g.cards.push(c)
          g.country_count++
        }

        setCompGroups([...groupMap.values()])
      } catch {
        // leave compGroups empty — UI shows "no cards" message
      }
      setLoading(false)
    }
    load()
  }, [])

  const selectedGroup = useMemo(
    () => compGroups.find((g) => g.key === selectedGroupKey) ?? null,
    [compGroups, selectedGroupKey],
  )

  // Generate global war-pricing brackets from the selected competitor group
  const handleGenerate = useCallback(() => {
    if (!selectedGroup) return
    const factor = 1 + adjustPct / 100

    const generated = selectedGroup.cards
      .filter((c) => c.country_code != null)
      .map((c) => {
        const compBrackets = (c.brackets ?? []) as Array<{
          weight_min: number
          weight_max: number
          rate_per_kg: number
          reg_fee: number
        }>
        const brackets: RateCardBracket[] = compBrackets.map((b) => {
          const capMax = Math.min(b.weight_max, b.weight_min + 5)
          const rep =
            b.weight_min === 0
              ? Math.min(0.1, b.weight_max / 2)
              : (b.weight_min + capMax) / 2
          const freight = Math.ceil(b.rate_per_kg * factor)
          const regFee = Math.ceil(b.reg_fee)
          return {
            weight_range: `${b.weight_min}-${b.weight_max}kg`,
            weight_min_kg: b.weight_min,
            weight_max_kg: b.weight_max,
            representative_weight_kg: rep,
            cost_hkd: 0,
            freight_rate_hkd_per_kg: freight,
            reg_fee_hkd: regFee,
            revenue_hkd: Math.ceil(freight * rep + regFee),
            actual_margin: 0,
            is_manually_adjusted: false,
          }
        })
        return {
          country_code: c.country_code!,
          country_name_en: c.country_name_en,
          country_name_zh: c.country_name_zh ?? null,
          brackets,
        }
      })

    setGeneratedCountries(generated)
    setStep(2)
  }, [selectedGroup, adjustPct])

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
          cost_hkd: 0,
        })),
      }))

      const res = await fetch('/api/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName.trim(),
          source: 'manual',
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
  }, [productName, generatedCountries])

  // Preview helpers
  const previewWeights = [0.5, 1, 2, 5]
  const getPreviewPrice = (brackets: RateCardBracket[], kg: number) => {
    const b =
      brackets.find((br) => kg > br.weight_min_kg && kg <= br.weight_max_kg) ??
      brackets[brackets.length - 1]
    if (!b) return null
    return Math.ceil(b.freight_rate_hkd_per_kg * kg + b.reg_fee_hkd)
  }

  const canProceed =
    step === 0 ? !!selectedGroupKey :
    step === 1 ? !!selectedGroup :
    step === 2 ? generatedCountries.length > 0 :
    !!productName.trim()

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← {t.common.back}
        </Button>
        <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          B. 競價定價
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

      {/* ── Step 0: Select benchmark competitor group ── */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">選擇對標競對</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              選擇一個競對服務作為戰價基準，系統將對所有涵蓋國家套用調整。
            </p>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> 載入中…
              </div>
            ) : compGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                尚無競對價卡，請先到「設定」→「競對價卡」匯入
              </p>
            ) : (
              <div className="grid gap-2">
                {compGroups.map((g) => {
                  const isSelected = selectedGroupKey === g.key
                  const label = g.vendor_label ?? `${g.competitor_name} — ${g.service_code}`
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => setSelectedGroupKey(g.key)}
                      className={`flex items-center justify-between px-4 py-3 rounded-md border text-left text-sm transition-colors ${
                        isSelected
                          ? 'border-[#0284C7] bg-[#0284C7]/5 text-[#0284C7]'
                          : 'border-border hover:border-muted-foreground/30'
                      }`}
                    >
                      <div>
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-foreground text-xs ml-2">
                          v{g.version} · {g.country_count} 個國家
                        </span>
                      </div>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-[#0284C7]" />}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="pt-2 flex justify-end">
              <Button disabled={!selectedGroupKey} onClick={() => setStep(1)}>
                下一步
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Strategy config + competitor summary ── */}
      {step === 1 && selectedGroup && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                對標：{selectedGroup.vendor_label ?? selectedGroup.competitor_name} v{selectedGroup.version}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Competitor rate summary */}
              <div className="overflow-auto max-h-56 rounded border text-xs mb-4">
                <table className="w-full data-table">
                  <thead className="sticky top-0 bg-muted/80">
                    <tr>
                      <th className="px-3 py-2 text-left w-40">國家</th>
                      {previewWeights.map((kg) => (
                        <th key={kg} className="px-3 py-2 text-right">
                          {kg}kg
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGroup.cards
                      .filter((c) => c.country_code != null)
                      .map((c) => {
                        const compBrackets = (c.brackets ?? []) as Array<{
                          weight_min: number; weight_max: number; rate_per_kg: number; reg_fee: number
                        }>
                        const getPrice = (kg: number) => {
                          const b = compBrackets.find(br => kg > br.weight_min && kg <= br.weight_max) ?? compBrackets[compBrackets.length - 1]
                          return b ? Math.ceil(b.rate_per_kg * kg + b.reg_fee) : '—'
                        }
                        return (
                          <tr key={c.country_code} className="border-t">
                            <td className="px-3 py-1.5 font-medium">
                              {c.country_name_en}
                              {c.country_name_zh && (
                                <span className="text-muted-foreground ml-1 text-[10px]">
                                  ({c.country_name_zh})
                                </span>
                              )}
                            </td>
                            {previewWeights.map((kg) => (
                              <td key={kg} className="px-3 py-1.5 text-right tabular-nums">
                                {getPrice(kg)}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">戰價設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Label className="shrink-0">價差調整</Label>
                <Input
                  type="number"
                  step={1}
                  value={adjustPct}
                  onChange={(e) => setAdjustPct(parseFloat(e.target.value) || 0)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">
                  %
                  {adjustPct < 0
                    ? ` — 比對標便宜 ${Math.abs(adjustPct)}%`
                    : adjustPct > 0
                    ? ` — 比對標貴 ${adjustPct}%`
                    : ' — 跟價'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                調整幅度套用到所有國家、所有重量段的每公斤運費（掛號費不變）
              </p>
              <Button onClick={handleGenerate}>
                生成全球戰價 →
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Step 2: Preview all countries ── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                全球戰價預覽 — {generatedCountries.length} 個國家 ·
                調整 {adjustPct > 0 ? '+' : ''}{adjustPct}%
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
                            onClick={() =>
                              setExpandedCountry(isExpanded ? null : c.country_code)
                            }
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
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
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
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {c.brackets.map((b) => (
                                      <tr key={b.weight_range} className="border-t border-muted/40">
                                        <td className="py-1">{b.weight_range}</td>
                                        <td className="text-right tabular-nums">
                                          {b.freight_rate_hkd_per_kg}
                                        </td>
                                        <td className="text-right tabular-nums">{b.reg_fee_hkd}</td>
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
              ← 返回調整
            </Button>
            <Button onClick={() => setStep(3)}>下一步：儲存 →</Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Save ── */}
      {step === 3 && (
        <div className="space-y-4 max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">儲存全球戰價卡</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {savedId ? (
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>儲存成功！價卡 ID: {savedId}</span>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>產品名稱 *</Label>
                    <Input
                      placeholder={`戰價 ${selectedGroup?.vendor_label ?? selectedGroup?.competitor_name} ${new Date().toISOString().slice(0, 10)}`}
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                    />
                  </div>

                  <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                    <p>
                      <span className="text-muted-foreground">對標：</span>
                      {selectedGroup?.vendor_label ?? selectedGroup?.competitor_name} v
                      {selectedGroup?.version}
                    </p>
                    <p>
                      <span className="text-muted-foreground">調整幅度：</span>
                      {adjustPct > 0 ? '+' : ''}
                      {adjustPct}%
                    </p>
                    <p>
                      <span className="text-muted-foreground">國家數：</span>
                      {generatedCountries.length}
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
