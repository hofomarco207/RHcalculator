'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Label } from '@/components/ui/label'
import { Loader2, Plus, X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { getMarginColorClass } from '@/lib/utils/margin'
import { CostTooltip } from '@/components/rate-card/CostTooltip'
import { MarginGauge } from './MarginGauge'
import { getVerdict } from '@/types/pricing-analysis'
import { DEFAULT_EXCHANGE_RATES, UNIFIED_WEIGHT_POINTS } from '@/types'
import type { GlobalRateCard } from '@/types'
import type { CompeteResult, CompetitorBracketPrice, CompetitorRateCard, SegmentBreakdown } from '@/types/pricing-analysis'

type SideType = 'card' | 'scenario'

/** Convert competitor card currency to HKD multiplier */
function currencyToHkd(currency: string): number {
  const r = DEFAULT_EXCHANGE_RATES
  switch (currency) {
    case 'HKD': return 1
    case 'JPY': return r.jpy_hkd ?? 0.052
    case 'USD': return r.usd_hkd
    case 'RMB': return 1 / r.hkd_rmb
    default: return 1
  }
}

/** Unified 24 weight points for comparison (v3.1) */
const FIXED_WEIGHTS = UNIFIED_WEIGHT_POINTS.map(wp => wp.representative)

/** Dummy competitor prices for scenario-only API calls (we only need cost data back) */
const DUMMY_PRICES: CompetitorBracketPrice[] = UNIFIED_WEIGHT_POINTS.map((wp) => ({
  weight_bracket: wp.range,
  weight_min: wp.min,
  weight_max: wp.max,
  representative_weight: wp.representative,
  price: 0,
  rate_per_kg: 0,
  reg_fee: 0,
}))

interface ScenarioOption {
  id: string
  name: string
}

interface ScenarioComputeResult {
  id: string
  name: string
  result: CompeteResult
}

export interface CompeteStep1Props {
  onProceed: (data: {
    competitorPrices: CompetitorBracketPrice[]
    scenarioId: string
    competitorName: string
    initialResult: CompeteResult
    weightStep: number
  }) => void
  displayCurrency?: string
  currencyMultiplier?: number
}

function competitorPriceTooltip(
  ratePerKg: number, weight: number, regFee: number, total: number,
  fscPct?: number, weightStep?: number, mul = 1, cur = 'HKD',
) {
  const hasFsc = (fscPct ?? 0) > 0
  const hasStep = (weightStep ?? 0) > 0
  const chargedWeight = hasStep ? Math.ceil(weight / weightStep!) * weightStep! : weight
  if (hasFsc) {
    const baseRate = ratePerKg / (1 + fscPct! / 100)
    const baseFreight = baseRate * chargedWeight
    const fscAmount = (ratePerKg - baseRate) * chargedWeight
    return (
      <>
        <span className="text-orange-400 font-semibold">同行價格計算</span>
        {hasStep && <>{'\n'}計重 {weight}kg → {chargedWeight}kg ({weightStep}kg 步長)</>}
        {'\n'}
        {hasStep
          ? <>基本運費 {(baseFreight * mul).toFixed(2)}</>
          : <>基本運費 {(baseRate * mul).toFixed(2)} /kg × {chargedWeight} kg = {(baseFreight * mul).toFixed(2)}</>
        }
        {'\n'}
        燃油附加 {fscPct}% = +{(fscAmount * mul).toFixed(2)}
        {'\n'}
        掛號費 {(regFee * mul).toFixed(2)}
        {'\n'}
        ──────────
        {'\n'}
        <span className="text-amber-400">合計 = {(total * mul).toFixed(2)} {cur}</span>
      </>
    )
  }
  const freight = ratePerKg * chargedWeight
  return (
    <>
      <span className="text-orange-400 font-semibold">同行價格計算</span>
      {hasStep && <>{'\n'}計重 {weight}kg → {chargedWeight}kg ({weightStep}kg 步長)</>}
      {'\n'}
      {hasStep
        ? <>運費 {(freight * mul).toFixed(2)}</>
        : <>運費 {(ratePerKg * mul).toFixed(2)} /kg × {chargedWeight} kg = {(freight * mul).toFixed(2)}</>
      }
      {'\n'}
      掛號費 {(regFee * mul).toFixed(2)}
      {'\n'}
      ──────────
      {'\n'}
      <span className="text-amber-400">合計 = {(total * mul).toFixed(2)} {cur}</span>
    </>
  )
}

function ownCardPriceTooltip(
  ratePerKg: number, weight: number, regFee: number, total: number,
  label: string, mul = 1, cur = 'HKD',
) {
  const freight = ratePerKg * weight
  return (
    <>
      <span className="text-blue-400 font-semibold">{label}</span>
      {'\n'}
      運費 {(ratePerKg * mul).toFixed(2)} /kg × {weight} kg = {(freight * mul).toFixed(2)}
      {'\n'}
      掛號費 {(regFee * mul).toFixed(2)}
      {'\n'}
      ──────────
      {'\n'}
      <span className="text-amber-400">合計 = {(total * mul).toFixed(2)} {cur}</span>
    </>
  )
}

function costTooltipContent(breakdown: SegmentBreakdown, total: number, pricingMode: string, mul = 1, cur = 'HKD') {
  const isBCCombined = pricingMode === 'bc_combined'
  const isBCDCombined = pricingMode === 'bcd_combined'
  const isMultiB = pricingMode === 'multi_b'
  const isMultiBB2C = pricingMode === 'multi_b_b2c'
  return (
    <>
      <span className="text-blue-400 font-semibold">成本明細</span>
      {'\n'}
      A段 攬收: {(breakdown.a * mul).toFixed(2)} {cur}
      {isBCDCombined ? (
        <>
          {'\n'}
          BCD 全段: {(breakdown.d * mul).toFixed(2)} {cur}
        </>
      ) : isBCCombined ? (
        <>
          {'\n'}
          BC段 空運+清關: {((breakdown.bc ?? 0) * mul).toFixed(2)} {cur}
          {'\n'}
          D段 尾程: {(breakdown.d * mul).toFixed(2)} {cur}
        </>
      ) : isMultiB ? (
        <>
          {'\n'}
          B1段 空運: {(breakdown.b * mul).toFixed(2)} {cur}
          {'\n'}
          B2段 空運: {((breakdown.b2 ?? 0) * mul).toFixed(2)} {cur}
          {'\n'}
          C段 清關: {(breakdown.c * mul).toFixed(2)} {cur}
          {'\n'}
          D段 尾程: {(breakdown.d * mul).toFixed(2)} {cur}
        </>
      ) : isMultiBB2C ? (
        <>
          {'\n'}
          B1段 空運: {(breakdown.b * mul).toFixed(2)} {cur}
          {'\n'}
          B2C段 空運+清關: {((breakdown.b2c ?? 0) * mul).toFixed(2)} {cur}
          {'\n'}
          D段 尾程: {(breakdown.d * mul).toFixed(2)} {cur}
        </>
      ) : (
        <>
          {'\n'}
          B段 空運: {(breakdown.b * mul).toFixed(2)} {cur}
          {'\n'}
          C段 清關: {(breakdown.c * mul).toFixed(2)} {cur}
          {'\n'}
          D段 尾程: {(breakdown.d * mul).toFixed(2)} {cur}
        </>
      )}
      {'\n'}
      ──────────
      {'\n'}
      <span className="text-amber-400">合計 = {(total * mul).toFixed(2)} {cur}</span>
    </>
  )
}

// ─── Unified card option (own + competitor group) ─────────────────────────

interface UnifiedCardOption {
  id: string       // prefixed: "own:xxx" or "comp-group:competitor||service"
  label: string
  source: 'own' | 'competitor'
  fscPct: number
  weightStep: number
}

interface CompetitorGroup {
  key: string  // `${competitor_name}||${service_code}`
  competitor_name: string
  service_code: string
  label: string
  fscPct: number
  weightStep: number
  cardsByCountry: Map<string, CompetitorRateCard>
}

// ─── Component ────────────────────────────────────────────────────────────

export function CompeteStep1({ onProceed, displayCurrency = 'HKD', currencyMultiplier = 1 }: CompeteStep1Props) {
  const t = useT()
  const cur = displayCurrency
  const mul = currencyMultiplier

  // Side types
  const [leftType, setLeftType] = useState<SideType>('card')
  const [rightType, setRightType] = useState<SideType>('scenario')

  // Per-side item IDs
  const [leftItemIds, setLeftItemIds] = useState<string[]>([''])
  const [rightItemIds, setRightItemIds] = useState<string[]>([''])

  // Data sources
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([])
  const [competitorCards, setCompetitorCards] = useState<CompetitorRateCard[]>([])
  const [ownRateCards, setOwnRateCards] = useState<GlobalRateCard[]>([])
  const [loadingScenarios, setLoadingScenarios] = useState(false)
  const [loadingCards, setLoadingCards] = useState(false)

  // Results — per-side
  const [leftPricesMap, setLeftPricesMap] = useState<Map<string, CompetitorBracketPrice[]>>(new Map())
  const [rightPricesMap, setRightPricesMap] = useState<Map<string, CompetitorBracketPrice[]>>(new Map())
  const [leftScenarioResults, setLeftScenarioResults] = useState<ScenarioComputeResult[]>([])
  const [rightScenarioResults, setRightScenarioResults] = useState<ScenarioComputeResult[]>([])

  // Selection indices for baseline comparison
  const [leftBaselineIdx, setLeftBaselineIdx] = useState(0)
  const [rightBaselineIdx, setRightBaselineIdx] = useState(0)
  const [computing, setComputing] = useState(false)
  const [error, setError] = useState('')
  const [compareCountry, setCompareCountry] = useState('')

  // ── Competitor groups (one per competitor_name × service_code) ───────

  const competitorGroups = useMemo(() => {
    const map = new Map<string, CompetitorGroup>()
    for (const c of competitorCards) {
      const key = `${c.competitor_name}||${c.service_code}`
      const countryId = c.country_code ?? c.country_name_en ?? ''
      if (!countryId) continue
      if (!map.has(key)) {
        map.set(key, {
          key,
          competitor_name: c.competitor_name,
          service_code: c.service_code,
          label: (c.vendor_label as string | null | undefined)?.trim() || `${c.competitor_name} ${c.service_code}`,
          fscPct: c.fuel_surcharge_pct ?? 0,
          weightStep: c.weight_step ?? 0,
          cardsByCountry: new Map(),
        })
      }
      map.get(key)!.cardsByCountry.set(countryId, c)
    }
    return [...map.values()]
  }, [competitorCards])

  // ── All unique destination countries (from competitor cards) ─────────

  const allCountryOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of competitorCards) {
      const id = c.country_code ?? c.country_name_en ?? ''
      if (!id) continue
      map.set(id, c.country_name_zh?.trim() || c.country_name_en || id)
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-TW'))
  }, [competitorCards])

  // Auto-select a country when the list loads
  useEffect(() => {
    if (allCountryOptions.length > 0 && !compareCountry) {
      const us = allCountryOptions.find(c => c.id === 'US' || c.label === '美國' || c.label.includes('美國'))
      setCompareCountry(us?.id ?? allCountryOptions[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCountryOptions])

  // ── Unified card list ─────────────────────────────────────────────────

  const unifiedCards: UnifiedCardOption[] = useMemo(() => {
    const own: UnifiedCardOption[] = ownRateCards.map(c => ({
      id: `own:${c.id}`,
      label: c.product_name,
      source: 'own' as const,
      fscPct: 0,
      weightStep: c.weight_step ?? 0,
    }))
    const comp: UnifiedCardOption[] = competitorGroups.map(g => ({
      id: `comp-group:${g.key}`,
      label: g.label,
      source: 'competitor' as const,
      fscPct: g.fscPct,
      weightStep: g.weightStep,
    }))
    return [...own, ...comp]
  }, [ownRateCards, competitorGroups])

  // ── Fetchers ──────────────────────────────────────────────────────────

  const fetchScenarios = useCallback(async () => {
    setLoadingScenarios(true)
    try {
      const res = await fetch('/api/scenarios')
      if (res.ok) {
        const data = await res.json()
        setScenarios(data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })))
      }
    } catch { /* non-fatal */ }
    setLoadingScenarios(false)
  }, [])

  const fetchCards = useCallback(async () => {
    setLoadingCards(true)
    // Fetch competitor cards and own rate cards independently so one failure doesn't
    // silently block the other. No country_code filter — we want all current cards
    // and let the user pick the destination country via compareCountry.
    try {
      const res = await fetch('/api/competitor-rate-cards')
      if (res.ok) setCompetitorCards(await res.json())
    } catch { /* non-fatal */ }
    try {
      const res = await fetch('/api/rate-cards?with_brackets=1')
      if (res.ok) setOwnRateCards(await res.json())
    } catch { /* non-fatal */ }
    setLoadingCards(false)
  }, [])

  useEffect(() => {
    fetchScenarios()
    fetchCards()
    setLeftItemIds([''])
    setRightItemIds([''])
    setLeftPricesMap(new Map())
    setRightPricesMap(new Map())
    setLeftScenarioResults([])
    setRightScenarioResults([])
  }, [fetchScenarios, fetchCards])

  // ── Side type change handlers ─────────────────────────────────────────

  function handleLeftTypeChange(type: SideType) {
    setLeftType(type)
    setLeftItemIds([''])
    setLeftPricesMap(new Map())
    setLeftScenarioResults([])
  }

  function handleRightTypeChange(type: SideType) {
    setRightType(type)
    setRightItemIds([''])
    setRightPricesMap(new Map())
    setRightScenarioResults([])
  }

  // ── Slot management (generic for either side) ─────────────────────────

  function addSlot(setter: React.Dispatch<React.SetStateAction<string[]>>) {
    setter(prev => [...prev, ''])
  }

  function removeSlot(setter: React.Dispatch<React.SetStateAction<string[]>>, idx: number) {
    setter(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))
  }

  function updateSlot(setter: React.Dispatch<React.SetStateAction<string[]>>, idx: number, val: string) {
    setter(prev => prev.map((v, i) => i === idx ? val : v))
  }

  // ── Build prices from cards ───────────────────────────────────────────

  function buildPricesFromCompetitor(card: CompetitorRateCard): CompetitorBracketPrice[] {
    const fscMult = 1 + (card.fuel_surcharge_pct ?? 0) / 100
    const toHkd = currencyToHkd(card.currency)
    return FIXED_WEIGHTS.map((w, i) => {
      let bracket = card.brackets.find((b) => w > b.weight_min && w <= b.weight_max)
      if (!bracket) {
        bracket = w <= (card.brackets[0]?.weight_min ?? 0)
          ? card.brackets[0]
          : card.brackets[card.brackets.length - 1]
      }
      if (!bracket) return null
      const chargedWeight = card.weight_step > 0 ? Math.ceil(w / card.weight_step) * card.weight_step : w
      const baseFreight = bracket.rate_per_kg * chargedWeight
      const freightWithFsc = baseFreight * fscMult
      const effectiveRatePerKg = Math.round((bracket.rate_per_kg * fscMult * toHkd) * 100) / 100
      return {
        weight_bracket: `${w}kg`,
        weight_min: i === 0 ? 0 : FIXED_WEIGHTS[i - 1],
        weight_max: w,
        representative_weight: w,
        rate_per_kg: effectiveRatePerKg,
        reg_fee: Math.round(bracket.reg_fee * toHkd * 100) / 100,
        price: Math.round((freightWithFsc + bracket.reg_fee) * toHkd * 100) / 100,
      }
    }).filter(Boolean) as CompetitorBracketPrice[]
  }

  function buildPricesFromOwnCard(card: GlobalRateCard): CompetitorBracketPrice[] {
    const countryBracket = card.country_brackets?.find(
      cb => cb.country_code === compareCountry
    ) ?? card.country_brackets?.[0]
    if (!countryBracket?.brackets?.length) return []
    const bs = countryBracket.brackets
    return bs.map((b, i) => {
      const rep = Math.min(b.weight_min + 0.5, (b.weight_min + b.weight_max) / 2)
      const price = b.rate_per_kg * rep + b.reg_fee
      return {
        weight_bracket: `${b.weight_min}–${b.weight_max}kg`,
        weight_min: b.weight_min,
        weight_max: b.weight_max,
        representative_weight: rep,
        rate_per_kg: b.rate_per_kg,
        reg_fee: b.reg_fee,
        price: Math.round(price * 100) / 100,
      }
    })
  }

  function buildPricesForCard(prefixedId: string): CompetitorBracketPrice[] {
    if (prefixedId.startsWith('own:')) {
      const card = ownRateCards.find(c => c.id === prefixedId.slice(4))
      return card ? buildPricesFromOwnCard(card) : []
    }
    if (prefixedId.startsWith('comp-group:')) {
      const groupKey = prefixedId.slice('comp-group:'.length)
      const group = competitorGroups.find(g => g.key === groupKey)
      if (!group) return []
      const card = group.cardsByCountry.get(compareCountry)
      return card ? buildPricesFromCompetitor(card) : []
    }
    // fallback for legacy "comp:" prefix (shouldn't occur in new code)
    const realId = prefixedId.startsWith('comp:') ? prefixedId.slice(5) : prefixedId
    const card = competitorCards.find(c => c.id === realId)
    return card ? buildPricesFromCompetitor(card) : []
  }

  // ── Compute scenario costs via /api/compete ───────────────────────────

  async function computeScenarioCosts(scenarioIds: string[]): Promise<ScenarioComputeResult[]> {
    const results = await Promise.all(
      scenarioIds.map(async (sid) => {
        const res = await fetch('/api/compete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            competitor_prices: DUMMY_PRICES,
            price_unit: 'per_ticket',
            scenario_id: sid,
            adjustment_pct: 0,
            country_code: compareCountry,
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || '計算失敗')
        }
        return (await res.json()) as CompeteResult
      }),
    )
    return scenarioIds.map((id, i) => ({
      id,
      name: scenarios.find(s => s.id === id)?.name ?? id,
      result: results[i],
    }))
  }

  // ── Handle "載入對比" ──────────────────────────────────────────────────

  async function handleCompute() {
    const validLeft = leftItemIds.filter(Boolean)
    const validRight = rightItemIds.filter(Boolean)
    if (validLeft.length === 0 || validRight.length === 0) return

    setComputing(true)
    setError('')
    setLeftPricesMap(new Map())
    setRightPricesMap(new Map())
    setLeftScenarioResults([])
    setRightScenarioResults([])

    try {
      // Build prices for card-type sides
      const newLeftPrices = new Map<string, CompetitorBracketPrice[]>()
      const newRightPrices = new Map<string, CompetitorBracketPrice[]>()

      if (leftType === 'card') {
        for (const id of validLeft) newLeftPrices.set(id, buildPricesForCard(id))
      }
      if (rightType === 'card') {
        for (const id of validRight) newRightPrices.set(id, buildPricesForCard(id))
      }

      // Compute costs for scenario-type sides
      let newLeftScenarios: ScenarioComputeResult[] = []
      let newRightScenarios: ScenarioComputeResult[] = []

      // When one side is card + other is scenario, use the card prices for compete API (for margin)
      if (leftType === 'scenario' && rightType === 'card') {
        // Left = scenarios, Right = cards. Use first card's prices for the compete call.
        const firstPrices = newRightPrices.values().next().value!
        const results = await Promise.all(
          validLeft.map(async (sid) => {
            const res = await fetch('/api/compete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                competitor_prices: firstPrices,
                price_unit: 'per_ticket',
                scenario_id: sid,
                adjustment_pct: 0,
                country_code: compareCountry,
              }),
            })
            if (!res.ok) { const err = await res.json(); throw new Error(err.error || '計算失敗') }
            return (await res.json()) as CompeteResult
          }),
        )
        newLeftScenarios = validLeft.map((id, i) => ({
          id,
          name: scenarios.find(s => s.id === id)?.name ?? id,
          result: results[i],
        }))
      } else if (leftType === 'card' && rightType === 'scenario') {
        // Right = scenarios, Left = cards. Use first card's prices for the compete call.
        const firstPrices = newLeftPrices.values().next().value!
        const results = await Promise.all(
          validRight.map(async (sid) => {
            const res = await fetch('/api/compete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                competitor_prices: firstPrices,
                price_unit: 'per_ticket',
                scenario_id: sid,
                adjustment_pct: 0,
                country_code: compareCountry,
              }),
            })
            if (!res.ok) { const err = await res.json(); throw new Error(err.error || '計算失敗') }
            return (await res.json()) as CompeteResult
          }),
        )
        newRightScenarios = validRight.map((id, i) => ({
          id,
          name: scenarios.find(s => s.id === id)?.name ?? id,
          result: results[i],
        }))
      } else if (leftType === 'scenario' && rightType === 'scenario') {
        // Both scenarios — compute costs with dummy prices
        const [leftRes, rightRes] = await Promise.all([
          computeScenarioCosts(validLeft),
          computeScenarioCosts(validRight),
        ])
        newLeftScenarios = leftRes
        newRightScenarios = rightRes
      }
      // card vs card: no scenario computation needed

      setLeftPricesMap(newLeftPrices)
      setRightPricesMap(newRightPrices)
      setLeftScenarioResults(newLeftScenarios)
      setRightScenarioResults(newRightScenarios)
      setLeftBaselineIdx(0)
      setRightBaselineIdx(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : '計算失敗')
    } finally {
      setComputing(false)
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────

  const validLeftIds = leftItemIds.filter(Boolean)
  const validRightIds = rightItemIds.filter(Boolean)
  const needsCountry = allCountryOptions.length > 0
    && ([...validLeftIds, ...validRightIds].some(id => id.startsWith('comp-group:')))
  const canCompute = validLeftIds.length > 0 && validRightIds.length > 0
    && (!needsCountry || !!compareCountry)

  const hasLeftResults = leftType === 'card' ? leftPricesMap.size > 0 : leftScenarioResults.length > 0
  const hasRightResults = rightType === 'card' ? rightPricesMap.size > 0 : rightScenarioResults.length > 0
  const hasResults = hasLeftResults && hasRightResults

  const isMixed = leftType !== rightType  // one card + one scenario → can proceed to war
  const cardSide: 'left' | 'right' | null = leftType === 'card' && rightType === 'scenario' ? 'left'
    : leftType === 'scenario' && rightType === 'card' ? 'right' : null
  const scenarioSide: 'left' | 'right' | null = cardSide === 'left' ? 'right' : cardSide === 'right' ? 'left' : null

  // Get value at weight index for a side
  function getLeftValue(wi: number): number | null {
    if (leftType === 'card') {
      const id = validLeftIds[leftBaselineIdx]
      const prices = id ? leftPricesMap.get(id) : undefined
      return prices?.[wi]?.price ?? null
    }
    const sr = leftScenarioResults[leftBaselineIdx]
    return sr?.result.brackets[wi]?.my_cost ?? null
  }

  function getRightValue(wi: number): number | null {
    if (rightType === 'card') {
      const id = validRightIds[rightBaselineIdx]
      const prices = id ? rightPricesMap.get(id) : undefined
      return prices?.[wi]?.price ?? null
    }
    const sr = rightScenarioResults[rightBaselineIdx]
    return sr?.result.brackets[wi]?.my_cost ?? null
  }

  // Margin data for summary cards (only meaningful for mixed card+scenario)
  const marginData = useMemo(() => {
    if (!hasResults || !isMixed) return null

    const bracketMargins = FIXED_WEIGHTS.map((_, wi) => {
      // For mixed mode: price from card side, cost from scenario side
      const cardVal = cardSide === 'left' ? getLeftValue(wi) : getRightValue(wi)
      const scenarioVal = scenarioSide === 'left' ? getLeftValue(wi) : getRightValue(wi)
      if (cardVal == null || scenarioVal == null || cardVal <= 0) return null
      const diff = cardVal - scenarioVal
      const marginPct = diff / cardVal
      return { marginPct, verdict: getVerdict(marginPct) }
    }).filter(Boolean) as Array<{ marginPct: number; verdict: string }>

    const avgMargin = bracketMargins.length > 0
      ? bracketMargins.reduce((s, b) => s + b.marginPct, 0) / bracketMargins.length
      : 0

    return {
      avgMargin,
      profitable: bracketMargins.filter(b => b.verdict === 'profitable').length,
      marginal: bracketMargins.filter(b => b.verdict === 'marginal').length,
      loss: bracketMargins.filter(b => b.verdict === 'loss').length,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasResults, isMixed, leftPricesMap, rightPricesMap, leftScenarioResults, rightScenarioResults, leftBaselineIdx, rightBaselineIdx])

  // ── Handle "進入戰價" ──────────────────────────────────────────────────

  function handleProceed() {
    if (!isMixed) return

    // Identify card side and scenario side
    const cardIds = cardSide === 'left' ? validLeftIds : validRightIds
    const cardIdx = cardSide === 'left' ? leftBaselineIdx : rightBaselineIdx
    const scenarioResults = scenarioSide === 'left' ? leftScenarioResults : rightScenarioResults
    const scenarioIdx = scenarioSide === 'left' ? leftBaselineIdx : rightBaselineIdx
    const pricesMap = cardSide === 'left' ? leftPricesMap : rightPricesMap

    const cardId = cardIds[cardIdx]
    const sel = scenarioResults[scenarioIdx]
    if (!cardId || !sel) return

    const prices = pricesMap.get(cardId)
    if (!prices) return

    const uc = unifiedCards.find(c => c.id === cardId)
    const cardName = uc?.label ?? ''

    onProceed({
      competitorPrices: prices,
      scenarioId: sel.id,
      competitorName: cardName,
      initialResult: sel.result,
      weightStep: uc?.weightStep ?? 0,
    })
  }

  // ── Labels for selected baseline ──────────────────────────────────────

  function getLeftBaselineName(): string {
    if (leftType === 'card') {
      const id = validLeftIds[leftBaselineIdx]
      return unifiedCards.find(c => c.id === id)?.label ?? ''
    }
    return leftScenarioResults[leftBaselineIdx]?.name ?? ''
  }

  function getRightBaselineName(): string {
    if (rightType === 'card') {
      const id = validRightIds[rightBaselineIdx]
      return unifiedCards.find(c => c.id === id)?.label ?? ''
    }
    return rightScenarioResults[rightBaselineIdx]?.name ?? ''
  }

  // ── Render helpers ────────────────────────────────────────────────────

  function renderSideSelector(
    side: 'left' | 'right',
    sideType: SideType,
    onTypeChange: (t: SideType) => void,
    itemIds: string[],
    setItemIds: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    const isCard = sideType === 'card'
    const items = isCard ? unifiedCards : scenarios
    const maxSlots = items.length

    return (
      <div className="flex-1 space-y-2">
        {/* Type toggle */}
        <div className="flex gap-1 p-0.5 bg-muted rounded-md">
          <button
            type="button"
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
              sideType === 'card'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => onTypeChange('card')}
          >
            {t.pricingAnalysis.compete.competitorCard}
          </button>
          <button
            type="button"
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
              sideType === 'scenario'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => onTypeChange('scenario')}
          >
            {t.pricingAnalysis.compete.myScenario}
          </button>
        </div>

        {/* Item selectors */}
        <div className="space-y-2">
          {itemIds.map((itemId, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select
                value={itemId}
                onValueChange={(v) => updateSlot(setItemIds, idx, v)}
                disabled={isCard ? loadingCards : loadingScenarios}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue
                    placeholder={
                      (isCard ? loadingCards : loadingScenarios)
                        ? t.common.loading
                        : isCard
                          ? (unifiedCards.length === 0 ? t.pricingAnalysis.compete.noCardsAvailable : t.pricingAnalysis.compete.selectCard)
                          : t.pricingAnalysis.compete.selectScenario
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {isCard ? (
                    <>
                      {ownRateCards.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>{t.pricingAnalysis.compete.ownCardGroup}</SelectLabel>
                          {ownRateCards
                            .filter(c => !itemIds.includes(`own:${c.id}`) || `own:${c.id}` === itemId)
                            .map(c => (
                              <SelectItem key={`own:${c.id}`} value={`own:${c.id}`}>
                                {c.product_name}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      )}
                      {competitorGroups.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>{t.pricingAnalysis.compete.competitorCardGroup}</SelectLabel>
                          {competitorGroups
                            .filter(g => !itemIds.includes(`comp-group:${g.key}`) || `comp-group:${g.key}` === itemId)
                            .map(g => (
                              <SelectItem key={`comp-group:${g.key}`} value={`comp-group:${g.key}`}>
                                {g.label}
                                <span className="ml-1 text-xs text-muted-foreground">
                                  ({g.cardsByCountry.size} 國)
                                </span>
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      )}
                    </>
                  ) : (
                    scenarios
                      .filter(s => !itemIds.includes(s.id) || s.id === itemId)
                      .map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
              {itemIds.length > 1 && (
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeSlot(setItemIds, idx)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => addSlot(setItemIds)}
            disabled={itemIds.length >= maxSlots}
          >
            <Plus className="h-3.5 w-3.5" />
            {isCard ? t.pricingAnalysis.compete.addCard : t.pricingAnalysis.compete.addScenario}
          </Button>
        </div>

        {/* FSC info for selected competitor cards */}
        {isCard && itemIds.filter(Boolean).map(cid => {
          const uc = unifiedCards.find(c => c.id === cid)
          return uc && uc.fscPct > 0 ? (
            <p key={cid} className="text-xs text-muted-foreground">{uc.label}: FSC {uc.fscPct}%</p>
          ) : null
        })}
      </div>
    )
  }

  // ── Render table columns for a side ───────────────────────────────────

  function renderSideHeaders(
    side: 'left' | 'right',
    sideType: SideType,
    itemIds: string[],
    baselineIdx: number,
    setBaselineIdx: (idx: number) => void,
    scenarioResults: ScenarioComputeResult[],
  ) {
    const validIds = itemIds.filter(Boolean)
    return validIds.map((itemId, idx) => {
      const isSelected = idx === baselineIdx
      const label = sideType === 'card'
        ? (unifiedCards.find(c => c.id === itemId)?.label ?? itemId)
        : (scenarioResults[idx]?.name ?? itemId)
      const bgClass = side === 'left'
        ? (isSelected ? 'bg-orange-50 text-orange-700 font-semibold dark:bg-orange-950/30 dark:text-orange-400' : 'hover:bg-muted/50')
        : (isSelected ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/50')
      const dotClass = side === 'left'
        ? (isSelected ? 'border-orange-500 bg-orange-500' : 'border-muted-foreground/40')
        : (isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40')

      return (
        <TableHead
          key={`${side}-${itemId}`}
          className={`text-xs text-center cursor-pointer select-none transition-colors ${bgClass}`}
          onClick={() => setBaselineIdx(idx)}
        >
          <div className="flex items-center justify-center gap-1.5 min-w-0">
            <span className={`w-2 h-2 rounded-full border-2 shrink-0 ${dotClass}`} />
            <span className="truncate" title={label}>{label}</span>
          </div>
          <div className="text-[10px] font-normal text-muted-foreground">
            ({sideType === 'card' ? cur : t.pricingAnalysis.compete.myCost})
          </div>
        </TableHead>
      )
    })
  }

  function renderSideCells(
    side: 'left' | 'right',
    sideType: SideType,
    itemIds: string[],
    wi: number,
    w: number,
    baselineIdx: number,
    setBaselineIdx: (idx: number) => void,
    pricesMap: Map<string, CompetitorBracketPrice[]>,
    scenarioResults: ScenarioComputeResult[],
  ) {
    const validIds = itemIds.filter(Boolean)
    return validIds.map((itemId, idx) => {
      const isSelected = idx === baselineIdx
      const bgClass = side === 'left'
        ? (isSelected ? 'bg-orange-50/50 dark:bg-orange-950/20' : 'hover:bg-muted/30')
        : (isSelected ? 'bg-primary/5' : 'hover:bg-muted/30')

      if (sideType === 'card') {
        const prices = pricesMap.get(itemId)
        const cp = prices?.[wi]
        const uc = unifiedCards.find(c => c.id === itemId)
        return (
          <TableCell
            key={`${side}-${itemId}`}
            className={`text-xs text-center font-mono py-1.5 cursor-pointer transition-colors ${bgClass}`}
            onClick={() => setBaselineIdx(idx)}
          >
            {cp ? (
              <CostTooltip
                content={
                  uc?.source === 'own'
                    ? ownCardPriceTooltip(cp.rate_per_kg, w, cp.reg_fee, cp.price, t.pricingAnalysis.compete.cardPriceTooltip, mul, cur)
                    : competitorPriceTooltip(cp.rate_per_kg, w, cp.reg_fee, cp.price, uc?.fscPct, uc?.weightStep, mul, cur)
                }
              >
                <span className="cursor-help border-b border-dotted border-muted-foreground/40">
                  {(cp.price * mul).toFixed(2)}
                </span>
              </CostTooltip>
            ) : '—'}
          </TableCell>
        )
      }

      // Scenario cell
      const sr = scenarioResults[idx]
      const bracket = sr?.result.brackets[wi]
      return (
        <TableCell
          key={`${side}-${itemId}`}
          className={`text-xs text-center font-mono py-1.5 cursor-pointer transition-colors ${bgClass}`}
          onClick={() => setBaselineIdx(idx)}
        >
          {bracket?.segment_breakdown ? (
            <CostTooltip
              content={costTooltipContent(bracket.segment_breakdown, bracket.my_cost, sr.result.pricing_mode, mul, cur)}
            >
              <span className="cursor-help border-b border-dotted border-muted-foreground/40">
                {(bracket.my_cost * mul).toFixed(2)}
              </span>
            </CostTooltip>
          ) : bracket ? (
            (bracket.my_cost * mul).toFixed(2)
          ) : '—'}
        </TableCell>
      )
    })
  }

  return (
    <div className="space-y-4">
      {/* ── Selection Card ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {allCountryOptions.length > 0 && (
            <div className="flex items-center gap-3 pb-2 border-b">
              <Label className="text-xs text-muted-foreground shrink-0">目的國</Label>
              <Select value={compareCountry} onValueChange={setCompareCountry}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="選擇目的國…" />
                </SelectTrigger>
                <SelectContent>
                  {allCountryOptions.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">（競對價卡依目的國計算 D 段尾程）</span>
            </div>
          )}

          <div className="flex gap-4">
            {renderSideSelector('left', leftType, handleLeftTypeChange, leftItemIds, setLeftItemIds)}
            <div className="w-px bg-border self-stretch" />
            {renderSideSelector('right', rightType, handleRightTypeChange, rightItemIds, setRightItemIds)}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleCompute} disabled={!canCompute || computing}>
              {computing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t.pricingAnalysis.compete.loadComparison}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────── */}
      {hasResults && (
        <>
          {/* Summary cards — only for mixed card+scenario comparison */}
          {isMixed && marginData && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3 flex justify-center">
                  <MarginGauge
                    margin={marginData.avgMargin}
                    verdict={getVerdict(marginData.avgMargin)}
                    label={`${getLeftBaselineName()} vs ${getRightBaselineName()}`}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{marginData.profitable}</div>
                  <div className="text-xs text-muted-foreground">{t.pricingAnalysis.compete.profitableBrackets}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <div className="text-2xl font-bold text-yellow-600">{marginData.marginal}</div>
                  <div className="text-xs text-muted-foreground">{t.pricingAnalysis.compete.marginalBrackets}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <div className="text-2xl font-bold text-red-600">{marginData.loss}</div>
                  <div className="text-xs text-muted-foreground">{t.pricingAnalysis.compete.lossBrackets}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Comparison table */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-3">
                {t.pricingAnalysis.compete.tableHint}
              </p>
              <div className="overflow-x-auto">
                <Table className="table-auto w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs text-center">KG</TableHead>
                      {renderSideHeaders('left', leftType, leftItemIds, leftBaselineIdx, setLeftBaselineIdx, leftScenarioResults)}
                      {renderSideHeaders('right', rightType, rightItemIds, rightBaselineIdx, setRightBaselineIdx, rightScenarioResults)}
                      <TableHead className="text-xs text-center">{t.pricingAnalysis.compete.difference}</TableHead>
                      <TableHead className="text-xs text-center">{t.pricingAnalysis.compete.marginRate}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {FIXED_WEIGHTS.map((w, wi) => {
                      const leftVal = getLeftValue(wi)
                      const rightVal = getRightValue(wi)
                      const hasBoth = leftVal != null && rightVal != null

                      let diff = 0
                      let marginPct = 0
                      let showMargin = false

                      if (hasBoth) {
                        if (isMixed) {
                          // card price vs scenario cost → margin
                          const price = cardSide === 'left' ? leftVal! : rightVal!
                          const cost = scenarioSide === 'left' ? leftVal! : rightVal!
                          diff = price - cost
                          marginPct = price > 0 ? diff / price : 0
                          showMargin = true
                        } else {
                          // same type → just diff
                          diff = leftVal! - rightVal!
                        }
                      }

                      return (
                        <TableRow key={w} className={wi % 2 === 1 ? 'bg-muted/10' : ''}>
                          <TableCell className="text-xs font-mono text-center font-semibold py-1.5">{w}</TableCell>
                          {renderSideCells('left', leftType, leftItemIds, wi, w, leftBaselineIdx, setLeftBaselineIdx, leftPricesMap, leftScenarioResults)}
                          {renderSideCells('right', rightType, rightItemIds, wi, w, rightBaselineIdx, setRightBaselineIdx, rightPricesMap, rightScenarioResults)}
                          <TableCell className={`text-xs text-center font-mono py-1.5 ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {hasBoth ? `${diff >= 0 ? '+' : ''}${(diff * mul).toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-center py-1.5">
                            {hasBoth && showMargin ? (
                              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${getMarginColorClass(marginPct)}`}>
                                {(marginPct * 100).toFixed(1)}%
                              </span>
                            ) : hasBoth && !showMargin ? (
                              <span className={`text-xs font-mono ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {leftVal! > 0 ? `${diff >= 0 ? '+' : ''}${((diff / leftVal!) * 100).toFixed(1)}%` : '—'}
                              </span>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Proceed button or hint */}
          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-muted-foreground space-y-0.5">
              {isMixed ? (
                <>
                  <p>{t.pricingAnalysis.compete.selectedCompetitor}: <span className="font-medium text-foreground">{cardSide === 'left' ? getLeftBaselineName() : getRightBaselineName()}</span></p>
                  <p>{t.pricingAnalysis.compete.selectedScenario}: <span className="font-medium text-foreground">{scenarioSide === 'left' ? getLeftBaselineName() : getRightBaselineName()}</span></p>
                </>
              ) : (
                <p className="text-amber-600">{t.pricingAnalysis.compete.comparisonOnlyHint}</p>
              )}
            </div>
            {isMixed && (
              <Button onClick={handleProceed}>
                {t.pricingAnalysis.compete.proceedToWar} ({cardSide === 'left' ? getLeftBaselineName() : getRightBaselineName()} vs {scenarioSide === 'left' ? getLeftBaselineName() : getRightBaselineName()})
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
