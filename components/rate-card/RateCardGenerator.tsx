'use client'

import { useState, useEffect, useCallback } from 'react'
import type { RateCardBracket, ProductType, RateCard, WeightPoint } from '@/types'
import { PRODUCT_LABELS, WEIGHT_BRACKETS, VERIFICATION_WEIGHT_POINTS } from '@/types'
import { generateRateCardFromScenario } from '@/lib/calculations/scenario-pricing'
import { exportRateCardToExcel } from '@/lib/excel/exporter'
import type { ExportCurrency } from '@/lib/excel/exporter'
import { DEFAULT_EXCHANGE_RATES } from '@/types'
import { useCountry } from '@/lib/context/country-context'
import { RateCardTable } from './RateCardTable'
import { VerificationTable } from './VerificationTable'
import { WeightedMarginPanel } from './WeightedMarginPanel'
import { BracketEditor } from './BracketEditor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { BracketCost, Scenario } from '@/types/scenario'
import { useT } from '@/lib/i18n'

export function RateCardGenerator() {
  const { country } = useCountry()
  const t = useT()

  // Scenario-based state
  const [scenarios, setScenarios] = useState<Array<{ id: string; name: string; results?: { cost_per_bracket: BracketCost[] } }>>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')
  const [scenarioCosts, setScenarioCosts] = useState<BracketCost[] | null>(null)
  const [scenarioName, setScenarioName] = useState<string>('')
  const [loadedScenario, setLoadedScenario] = useState<Scenario | null>(null)

  // Custom brackets
  const [customBrackets, setCustomBrackets] = useState<WeightPoint[]>([...WEIGHT_BRACKETS])
  const [recomputingBrackets, setRecomputingBrackets] = useState(false)

  // Common state
  const [productType, setProductType] = useState<ProductType>('economy')
  const [targetMargin, setTargetMargin] = useState<number>(30)
  const [rateCard, setRateCard] = useState<RateCardBracket[] | null>(null)
  const [cardName, setCardName] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [generating, setGenerating] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false)
  const [showVerification, setShowVerification] = useState<boolean>(false)
  const [verificationCosts, setVerificationCosts] = useState<BracketCost[] | null>(null)
  const [loadingVerification, setLoadingVerification] = useState(false)
  const [savedCards, setSavedCards] = useState<RateCard[]>([])
  const [showSavedCards, setShowSavedCards] = useState<boolean>(false)
  const [exportCurrency, setExportCurrency] = useState<ExportCurrency>('HKD')
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const fetchSavedCards = useCallback(async () => {
    try {
      const res = await fetch(`/api/rate-cards?country_code=${country}`)
      if (res.ok) setSavedCards(await res.json())
    } catch {
      // non-fatal
    }
  }, [country])

  // Load scenarios for current country
  useEffect(() => {
    setLoading(true)
    setSelectedScenarioId('')
    setScenarioCosts(null)

    fetch(`/api/scenarios?country=${country}`)
      .then((r) => r.json())
      .then((scenarioList) => {
        if (Array.isArray(scenarioList)) {
          setScenarios(scenarioList.filter((s: Scenario) => s.results?.cost_per_bracket))
        }
      })
      .catch((err) => console.error('Load failed:', err))
      .finally(() => setLoading(false))

    fetchSavedCards()
  }, [country, fetchSavedCards])

  // Load scenario details when selected — always recompute fresh costs
  useEffect(() => {
    if (!selectedScenarioId) { setScenarioCosts(null); setScenarioName(''); setVerificationCosts(null); return }
    setVerificationCosts(null)
    let cancelled = false
    fetch(`/api/scenarios/${selectedScenarioId}`)
      .then((r) => r.json())
      .then(async (sc: Scenario) => {
        if (cancelled) return
        setLoadedScenario(sc)
        setScenarioName(sc.name)
        if (!cardName) setCardName(`${sc.name} - ${t.pages.rateCard.title}`)

        // Recompute costs fresh using current engine + vendor rates
        try {
          const res = await fetch('/api/scenarios/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...sc, weights: customBrackets }),
          })
          if (!cancelled && res.ok) {
            const data = await res.json()
            if (data.cost_per_bracket) {
              setScenarioCosts(data.cost_per_bracket)
              return
            }
          }
        } catch {
          // Fall through to saved results
        }

        // Fallback: use saved results if fresh computation fails
        if (!cancelled && sc.results?.cost_per_bracket) {
          setScenarioCosts(sc.results.cost_per_bracket)
        }
      })
      .catch(() => { if (!cancelled) setScenarioCosts(null) })
    return () => { cancelled = true }
  }, [selectedScenarioId])

  // Recompute scenario costs when custom weight brackets change
  const handleWeightBracketsChange = useCallback(async (newBrackets: WeightPoint[]) => {
    setCustomBrackets(newBrackets)
    setRateCard(null)
    if (!loadedScenario || newBrackets.length === 0) return

    setRecomputingBrackets(true)
    try {
      const res = await fetch('/api/scenarios/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loadedScenario, weights: newBrackets }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.cost_per_bracket) {
          setScenarioCosts(data.cost_per_bracket)
        }
      }
    } catch {
      // non-fatal
    } finally {
      setRecomputingBrackets(false)
    }
  }, [loadedScenario])

  // Fetch exact costs at all 80+ verification weights
  const fetchVerificationCosts = useCallback(async () => {
    if (!loadedScenario) return
    setLoadingVerification(true)
    setVerificationCosts(null)
    try {
      const res = await fetch('/api/scenarios/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loadedScenario, weights: VERIFICATION_WEIGHT_POINTS }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.cost_per_bracket) setVerificationCosts(data.cost_per_bracket)
      }
    } catch {
      // non-fatal — VerificationTable falls back to interpolation
    } finally {
      setLoadingVerification(false)
    }
  }, [loadedScenario])

  const handleLoadCard = useCallback((card: RateCard) => {
    setCardName(card.name)
    setProductType(card.product_type as ProductType)
    setTargetMargin(Math.round(card.target_margin * 100))
    setRateCard(card.brackets)
    setShowVerification(false)
    setSaveSuccess(false)
    setSaveError(null)
    setShowSavedCards(false)
  }, [])

  const handleDeleteCard = useCallback(async (cardId: string) => {
    setDeletingCardId(cardId)
    try {
      const res = await fetch(`/api/rate-cards/${cardId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setSavedCards((prev) => prev.filter((c) => c.id !== cardId))
      setConfirmDeleteId(null)
    } catch {
      // non-fatal
    } finally {
      setDeletingCardId(null)
    }
  }, [])

  const handleGenerate = useCallback(() => {
    if (!scenarioCosts) return
    setGenerating(true)
    try {
      const brackets = generateRateCardFromScenario(scenarioCosts, targetMargin / 100)
      setRateCard(brackets)
      setShowVerification(false)
      setSaveSuccess(false)
      setSaveError(null)
    } finally {
      setGenerating(false)
    }
  }, [scenarioCosts, targetMargin])

  const handleRateCardBracketsChange = useCallback((brackets: RateCardBracket[]) => {
    setRateCard(brackets)
  }, [])

  const handleSave = useCallback(async () => {
    if (!rateCard || !cardName.trim()) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const payload = {
        name: cardName.trim(),
        product_type: productType,
        target_margin: targetMargin / 100,
        brackets: rateCard,
        scenario_id: selectedScenarioId || null,
        country_code: country,
      }
      const res = await fetch('/api/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? t.common.saveFailed)
      }
      setSaveSuccess(true)
      fetchSavedCards()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : t.common.saveFailed)
    } finally {
      setSaving(false)
    }
  }, [rateCard, cardName, productType, targetMargin, fetchSavedCards, selectedScenarioId, country])

  const getExportMultiplier = useCallback((cur: ExportCurrency): number => {
    const r = DEFAULT_EXCHANGE_RATES
    switch (cur) {
      case 'HKD': return 1
      case 'RMB': return r.hkd_rmb
      case 'USD': return 1 / r.usd_hkd
      case 'JPY': return 1 / (r.jpy_hkd ?? 0.052)
    }
  }, [])

  const handleExport = useCallback(() => {
    if (!rateCard || !cardName.trim()) return
    exportRateCardToExcel(
      {
        name: cardName.trim() || cardName,
        product_type: productType,
        target_margin: targetMargin / 100,
        brackets: rateCard,
      },
      exportCurrency,
      getExportMultiplier(exportCurrency),
    )
  }, [rateCard, cardName, productType, targetMargin, exportCurrency, getExportMultiplier])

  return (
    <div className="space-y-6">
      {/* Saved Cards */}
      {savedCards.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">{t.pages.rateCard.title}（{savedCards.length}）</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowSavedCards(v => !v)}>
                {showSavedCards ? t.common.close : t.common.edit}
              </Button>
            </div>
          </CardHeader>
          {showSavedCards && (
            <CardContent className="pt-0">
              <div className="divide-y">
                {savedCards.map((card) => (
                  <div key={card.id} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{card.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {PRODUCT_LABELS[card.product_type as ProductType]} · {t.common.margin} {Math.round(card.target_margin * 100)}%
                        {card.created_at && ` · ${new Date(card.created_at).toLocaleDateString('zh-TW')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button size="sm" variant="outline" onClick={() => handleLoadCard(card)}>
                        載入
                      </Button>
                      {card.id && confirmDeleteId === card.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deletingCardId === card.id}
                            onClick={() => handleDeleteCard(card.id!)}
                          >
                            {deletingCardId === card.id ? t.common.deleting : t.common.confirm}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            {t.common.cancel}
                          </Button>
                        </div>
                      ) : card.id ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setConfirmDeleteId(card.id!)}
                        >
                          {t.common.delete}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Section 1: Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t.pages.rateCard.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Scenario Selector */}
          <div className="space-y-1.5">
            <Label>{t.pages.rateCard.selectScenario}</Label>
            {scenarios.length > 0 ? (
              <Select value={selectedScenarioId} onValueChange={setSelectedScenarioId}>
                <SelectTrigger>
                  <SelectValue placeholder={t.pages.rateCard.selectScenario} />
                </SelectTrigger>
                <SelectContent>
                  {scenarios.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {loading ? t.common.loading : '沒有已計算的方案，請先到「方案分析」建立並計算方案'}
              </p>
            )}
            {scenarioCosts && (
              <p className="text-xs text-green-600 font-medium">
                已載入方案「{scenarioName}」的成本數據（{scenarioCosts.length} 個重量區間）
              </p>
            )}
          </div>

          {/* Custom Weight Brackets */}
          {scenarioCosts && (
            <div className="space-y-1.5 border-t pt-4">
              <BracketEditor
                brackets={customBrackets}
                onChange={handleWeightBracketsChange}
              />
              {recomputingBrackets && (
                <p className="text-xs text-muted-foreground animate-pulse">{t.pages.rateCard.generating}</p>
              )}
            </div>
          )}

          {/* Product selector */}
          <div className="space-y-1.5">
            <Label>產品類型</Label>
            <Tabs
              value={productType}
              onValueChange={(v) => setProductType(v as ProductType)}
            >
              <TabsList className="w-full">
                <TabsTrigger value="economy" className="flex-1">
                  {PRODUCT_LABELS.economy}
                </TabsTrigger>
                <TabsTrigger value="premium" className="flex-1">
                  {PRODUCT_LABELS.premium}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Margin input + generate button */}
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="target-margin">{t.pages.rateCard.targetMargin} (%)</Label>
              <Input
                id="target-margin"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={targetMargin}
                onChange={(e) => setTargetMargin(parseFloat(e.target.value) || 0)}
                className="w-full"
                placeholder="例如：30"
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={!scenarioCosts || generating}
              className="bg-orange-500 hover:bg-orange-600 text-white min-w-[100px]"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.pages.rateCard.generating}
                </>
              ) : (
                t.pages.rateCard.generate
              )}
            </Button>
          </div>

          {/* Card name */}
          <div className="space-y-1.5">
            <Label htmlFor="card-name">{t.pricingAnalysis.step5.rateCardName}</Label>
            <Input
              id="card-name"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="例如：美國特惠普貨 2026-03"
              className="w-full"
            />
          </div>

          {/* Status */}
          <div className="text-sm">
            {loading ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t.common.loading}
              </span>
            ) : scenarioCosts ? (
              <span className="text-green-600 font-medium">方案成本已就緒</span>
            ) : (
              <span className="text-amber-500">{t.pages.rateCard.selectScenario}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Rate Card Table */}
      {rateCard && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              {PRODUCT_LABELS[productType]} — {t.pages.rateCard.targetMargin} {targetMargin}%
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RateCardTable
              brackets={rateCard}
              onBracketsChange={handleRateCardBracketsChange}
            />

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleSave}
                disabled={saving || !cardName.trim()}
                variant="default"
                className="min-w-[100px]"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.common.saving}
                  </>
                ) : (
                  t.common.save
                )}
              </Button>
              <div className="flex items-center gap-1.5">
                <Button
                  onClick={handleExport}
                  disabled={!cardName.trim()}
                  variant="outline"
                  className="min-w-[110px]"
                >
                  {t.pricingAnalysis.step5.exportExcel}
                </Button>
                <div className="flex items-center gap-0.5">
                  {(['HKD', 'RMB', 'USD', 'JPY'] as ExportCurrency[]).map((cur) => (
                    <button
                      key={cur}
                      onClick={() => setExportCurrency(cur)}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${
                        exportCurrency === cur
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-input hover:bg-accent'
                      }`}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>
              {saveSuccess && (
                <span className="text-sm text-green-600 font-medium">{t.common.success}</span>
              )}
              {saveError && (
                <span className="text-sm text-red-500">{saveError}</span>
              )}
              {!cardName.trim() && (
                <span className="text-sm text-muted-foreground">{t.pricingAnalysis.step5.rateCardName}</span>
              )}
            </div>

            {/* Weighted Overall Margin */}
            <div className="pt-2 border-t">
              <WeightedMarginPanel
                brackets={rateCard}
                productType={productType}
              />
            </div>

            {/* Verification Table */}
            <div className="pt-2 border-t">
              {!showVerification ? (
                <Button
                  variant="outline"
                  onClick={() => { setShowVerification(true); fetchVerificationCosts() }}
                  className="w-full"
                >
                  {t.pages.rateCard.verificationTable}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {t.verification.verificationTable} — {PRODUCT_LABELS[productType]}
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowVerification(false)}
                    >
                      {t.common.close}
                    </Button>
                  </div>
                  {loadingVerification ? (
                    <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      計算 {VERIFICATION_WEIGHT_POINTS.length} 個驗算重量中…
                    </div>
                  ) : (
                    <VerificationTable
                      brackets={rateCard}
                      productType={productType}
                      scenarioCosts={verificationCosts ?? scenarioCosts ?? undefined}
                      pricingMode={loadedScenario?.pricing_mode}
                    />
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
