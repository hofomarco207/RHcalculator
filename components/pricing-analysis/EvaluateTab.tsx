'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCountry } from '@/lib/context/country-context'
import { Loader2 } from 'lucide-react'
import { MarginGauge } from './MarginGauge'
import { CostBreakdownBar } from './CostBreakdownBar'
import { SensitivityChart } from './SensitivityChart'
import type { EvaluateResult, PriceUnit } from '@/types/pricing-analysis'
import { getVerdictLabel } from '@/types/pricing-analysis'
import { useT } from '@/lib/i18n'

interface ScenarioOption {
  id: string
  name: string
}

export function EvaluateTab() {
  const { country } = useCountry()
  const t = useT()

  // Form state
  const [price, setPrice] = useState('')
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('per_ticket')
  const [weight, setWeight] = useState('')
  const [scenarioId, setScenarioId] = useState('')

  // Scenarios list
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([])
  const [loadingScenarios, setLoadingScenarios] = useState(false)

  // Result
  const [result, setResult] = useState<EvaluateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load scenarios for current country
  const fetchScenarios = useCallback(async () => {
    setLoadingScenarios(true)
    try {
      const res = await fetch(`/api/scenarios?country=${country}`)
      if (res.ok) {
        const data = await res.json()
        setScenarios(data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })))
      }
    } catch { /* non-fatal */ }
    setLoadingScenarios(false)
  }, [country])

  useEffect(() => {
    fetchScenarios()
    setScenarioId('')
    setResult(null)
  }, [fetchScenarios])

  async function handleEvaluate() {
    const p = parseFloat(price)
    const w = parseFloat(weight)
    if (!p || !w || !scenarioId) return

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: p,
          price_unit: priceUnit,
          representative_weight: w,
          scenario_id: scenarioId,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || t.common.operationFailed)
        return
      }
      setResult(await res.json())
    } catch {
      setError(t.common.error)
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = !!price && !!weight && !!scenarioId && !loading

  return (
    <div className="space-y-6">
      {/* Input form */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">{t.pricingAnalysis.evaluate.price} (HKD)</Label>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="例: 35.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.pricingAnalysis.evaluate.priceUnit}</Label>
              <Select value={priceUnit} onValueChange={(v) => setPriceUnit(v as PriceUnit)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_ticket">{t.pricingAnalysis.evaluate.perTicket}</SelectItem>
                  <SelectItem value="per_kg">{t.pricingAnalysis.evaluate.perKg}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.pricingAnalysis.evaluate.representativeWeight} (KG)</Label>
              <Input
                type="number"
                step="0.01"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="例: 0.3"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.pricingAnalysis.evaluate.selectScenario}</Label>
              <Select value={scenarioId} onValueChange={setScenarioId} disabled={loadingScenarios}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingScenarios ? t.common.loading : t.pricingAnalysis.evaluate.selectScenario} />
                </SelectTrigger>
                <SelectContent>
                  {scenarios.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleEvaluate} disabled={!canSubmit}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.pricingAnalysis.evaluate.calculate}
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 flex justify-center">
                <MarginGauge margin={result.margin} verdict={result.verdict} label={t.verification.margin} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.common.revenue}</span>
                  <span className="font-mono font-medium">HKD {result.revenue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.common.cost}</span>
                  <span className="font-mono font-medium">HKD {result.cost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.verification.marginAmount}</span>
                  <span className="font-mono font-medium">HKD {(result.revenue - result.cost).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">判斷</span>
                  <span className="font-medium">{getVerdictLabel(result.verdict)}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <CostBreakdownBar
                  breakdown={result.segment_breakdown}
                  pricingMode={result.pricing_mode}
                  revenue={result.revenue}
                />
              </CardContent>
            </Card>
          </div>

          {/* Sensitivity chart */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium mb-2">{t.pricingAnalysis.evaluate.sensitivityChart}</h3>
              <p className="text-xs text-muted-foreground mb-3">
                代表重量 ×0.7 ~ ×1.3 的毛利率變化
              </p>
              <SensitivityChart
                data={result.sensitivity}
                representativeWeight={parseFloat(weight)}
              />
            </CardContent>
          </Card>

          {/* Conclusion */}
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm">
                在 <strong>{weight} KG</strong>，
                {priceUnit === 'per_ticket' ? t.pricingAnalysis.evaluate.perTicket : t.pricingAnalysis.evaluate.perKg}{' '}
                <strong>HKD {parseFloat(price).toFixed(2)}</strong>，
                {t.verification.margin} <strong>{(result.margin * 100).toFixed(1)}%</strong>，
                判斷：<strong>{getVerdictLabel(result.verdict)}</strong>。
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
