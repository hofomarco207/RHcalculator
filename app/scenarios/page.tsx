'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
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
import { toast } from 'sonner'
import { exportSingleScenario } from '@/lib/excel/scenario-exporter'
import { VolumeConfig } from '@/components/scenarios/VolumeConfig'
import { SegmentAConfig } from '@/components/scenarios/SegmentAConfig'
import { SegmentBConfig } from '@/components/scenarios/SegmentBConfig'
import { SegmentCConfig } from '@/components/scenarios/SegmentCConfig'
import { SegmentDConfig } from '@/components/scenarios/SegmentDConfig'
import { SegmentBCConfig } from '@/components/scenarios/SegmentBCConfig'
import { ResultsPanel } from '@/components/scenarios/ResultsPanel'
import type { Vendor } from '@/types'
import type { ScenarioResults } from '@/types/scenario'
import { useCountry } from '@/lib/context/country-context'
import { useT } from '@/lib/i18n'

type GatewayMode = 'optimized' | 'single' | 'manual'

export default function ScenariosPage() {
  const t = useT()
  const { country, pricingMode: countryPricingMode } = useCountry()

  // Scenario-level pricing mode override (defaults to country setting)
  const [scenarioPricingMode, setScenarioPricingMode] = useState<'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c'>(countryPricingMode)
  const pricingMode = scenarioPricingMode

  // Vendor lists
  const [aVendors, setAVendors] = useState<Vendor[]>([])
  const [bVendors, setBVendors] = useState<Vendor[]>([])
  const [cVendors, setCVendors] = useState<Vendor[]>([])
  const [dVendors, setDVendors] = useState<Vendor[]>([])
  const [bcVendors, setBcdVendors] = useState<Vendor[]>([])

  // Scenario config state
  const [name, setName] = useState('新方案')
  const [weeklyTickets, setWeeklyTickets] = useState(7000)
  const [weeklyKg, setWeeklyKg] = useState<number | null>(null)
  const [flightsPerWeek, setFlightsPerWeek] = useState<number | null>(null)
  const [vendorAId, setVendorAId] = useState<string>('')
  const [segA, setSegA] = useState<{
    pickup: number; sorting: number; includeSorting: boolean;
    bubbleRatio?: number; perPieceFee?: number; perPieceCurrency?: string
  }>({ pickup: 4.2, sorting: 0, includeSorting: false, bubbleRatio: 1.0 })
  const [vendorBId, setVendorBId] = useState<string>('')
  const [gatewayMode, setGatewayMode] = useState<GatewayMode>('single')
  const [singleGateway, setSingleGateway] = useState('')
  const [manualProportions, setManualProportions] = useState<Record<string, number>>({})
  const [bubbleRate, setBubbleRate] = useState(1.1)
  const [b1BubbleRate, setB1BubbleRate] = useState(1.1)
  const [useMedianPricing, setUseMedianPricing] = useState(true)
  const [vendorCId, setVendorCId] = useState<string>('')
  const [vendorDId, setVendorDId] = useState<string>('')
  const [carrierProportions, setCarrierProportions] = useState<Array<{ carrier: string; pct: number }>>([])
  const [vendorBCId, setVendorBCId] = useState<string>('')
  const [bcBubbleRate, setBcBubbleRate] = useState(1.0)
  const [vendorBCDId, setVendorBCDId] = useState<string>('')
  const [bcdVendors, setBCDVendors] = useState<Vendor[]>([])

  // B2段 (multi-leg)
  const [vendorB2Id, setVendorB2Id] = useState<string>('')
  const [b2GatewayMode, setB2GatewayMode] = useState<GatewayMode>('single')
  const [b2SingleGateway, setB2SingleGateway] = useState('')
  const [b2ManualProportions, setB2ManualProportions] = useState<Record<string, number>>({})

  // Per-segment refresh keys (increment to trigger re-fetch)
  const [refreshKeys, setRefreshKeys] = useState<Record<string, number>>({})
  const refreshSegment = (seg: string) => setRefreshKeys((prev) => ({ ...prev, [seg]: (prev[seg] ?? 0) + 1 }))

  // Exchange rates
  const [usdHkd, setUsdHkd] = useState(7.814)
  const [hkdRmb, setHkdRmb] = useState(0.934)
  const [usdRmb, setUsdRmb] = useState(7.295)

  // Results
  const [results, setResults] = useState<ScenarioResults | null>(null)
  const [computing, setComputing] = useState(false)
  const [isPreview, setIsPreview] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  // Loaded scenario tracking (for update vs create)
  const [loadedScenarioId, setLoadedScenarioId] = useState<string | null>(null)

  // Saved scenarios + compare selection
  const [savedScenarios, setSavedScenarios] = useState<Array<{ id: string; name: string }>>([])

  // Sync scenario pricing mode when country changes
  useEffect(() => { setScenarioPricingMode(countryPricingMode) }, [countryPricingMode])

  // Load vendors and saved scenarios (re-fetch when country changes)
  useEffect(() => {
    // Reset selections when country changes
    setVendorAId('')
    setVendorBId('')
    setVendorCId('')
    setVendorDId('')
    setVendorBCId('')
    setVendorBCDId('')
    setVendorB2Id('')
    setResults(null)
    setLoadedScenarioId(null)

    Promise.all([
      fetch('/api/vendors?segment=A').then((r) => r.json()),
      fetch(`/api/vendors?segment=B&country=${country}`).then((r) => r.json()),
      fetch(`/api/vendors?segment=C&country=${country}`).then((r) => r.json()),
      fetch(`/api/vendors?segment=D&country=${country}`).then((r) => r.json()),
      fetch(`/api/vendors?segment=BC&country=${country}`).then((r) => r.json()),
      fetch(`/api/vendors?segment=BCD&country=${country}`).then((r) => r.json()),
      fetch(`/api/scenarios?country=${country}`).then((r) => r.json()),
      fetch(`/api/gateways?country=${country}`).then((r) => r.json()),
    ]).then(([a, b, c, d, bc, bcd, s, gws]) => {
      if (Array.isArray(a)) setAVendors(a)
      if (Array.isArray(b)) setBVendors(b)
      if (Array.isArray(c)) setCVendors(c)
      if (Array.isArray(d)) setDVendors(d)
      if (Array.isArray(bc)) setBcdVendors(bc)
      if (Array.isArray(bcd)) setBCDVendors(bcd)
      if (Array.isArray(s)) setSavedScenarios(s.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
      // Initialize gateway defaults from country's configured gateways
      if (Array.isArray(gws) && gws.length > 0) {
        const codes = gws.filter((g: { is_active?: boolean }) => g.is_active !== false).map((g: { code: string }) => g.code)
        if (codes.length === 1) {
          setSingleGateway(codes[0])
          setGatewayMode('single')
        } else if (codes.length > 1) {
          setSingleGateway(codes[0])
          const pct = 1.0 / codes.length
          const props: Record<string, number> = {}
          for (const c of codes) props[c] = Math.round(pct * 10000) / 10000
          setManualProportions(props)
        }
      }
    })
  }, [country])

  // Auto-select first vendor if only one (also re-check on mode switch)
  useEffect(() => { if (aVendors.length === 1 && !vendorAId) setVendorAId(aVendors[0].id) }, [aVendors])
  useEffect(() => { if (bVendors.length === 1 && !vendorBId && pricingMode === 'segmented') setVendorBId(bVendors[0].id) }, [bVendors, pricingMode, vendorBId])
  useEffect(() => { if (cVendors.length === 1 && !vendorCId && pricingMode === 'segmented') setVendorCId(cVendors[0].id) }, [cVendors, pricingMode, vendorCId])
  useEffect(() => { if (dVendors.length === 1 && !vendorDId && pricingMode !== 'bcd_combined') setVendorDId(dVendors[0].id) }, [dVendors, pricingMode, vendorDId])
  useEffect(() => { if (bcVendors.length === 1 && !vendorBCId && pricingMode === 'bc_combined') setVendorBCId(bcVendors[0].id) }, [bcVendors, pricingMode, vendorBCId])
  useEffect(() => { if (bcdVendors.length === 1 && !vendorBCDId) setVendorBCDId(bcdVendors[0].id) }, [bcdVendors])

  const refreshSavedScenarios = useCallback(async () => {
    const res = await fetch(`/api/scenarios?country=${country}`)
    const list = await res.json()
    if (Array.isArray(list)) setSavedScenarios(list.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
  }, [country])

  async function handleCompute() {
    if (pricingMode === 'segmented' && !vendorBId) { toast.error('請選擇 B段供應商'); return }
    if (pricingMode === 'bc_combined' && !vendorBCId) { toast.error('請選擇 BC 供應商'); return }
    if (pricingMode === 'bcd_combined' && !vendorBCDId) { toast.error('請選擇 BCD 供應商'); return }
    if (isMultiLeg && !vendorBId) { toast.error('請選擇 B1段供應商'); return }
    if (isMultiLeg && !vendorB2Id) { toast.error('請選擇 B2段供應商'); return }

    setComputing(true)
    try {
      const scenarioData = buildScenarioData()
      let id: string

      if (loadedScenarioId) {
        // Update existing scenario
        const saveRes = await fetch(`/api/scenarios/${loadedScenarioId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scenarioData),
        })
        if (!saveRes.ok) {
          const err = await saveRes.json()
          throw new Error(err.error || '更新方案失敗')
        }
        id = loadedScenarioId
      } else {
        // Create new scenario
        const saveRes = await fetch('/api/scenarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scenarioData),
        })
        if (!saveRes.ok) {
          const err = await saveRes.json()
          throw new Error(err.error || '儲存方案失敗')
        }
        const result = await saveRes.json()
        id = result.id
      }

      // If optimized mode (segmented only), run optimizer first
      if (pricingMode === 'segmented' && gatewayMode === 'optimized') {
        const optRes = await fetch(`/api/scenarios/${id}/optimize`, { method: 'POST' })
        if (!optRes.ok) throw new Error('口岸優化失敗')
        const optResult = await optRes.json()
        if (optResult.allocation) {
          setManualProportions(optResult.allocation)
        }
      }

      // Compute
      const computeRes = await fetch(`/api/scenarios/${id}/compute`, { method: 'POST' })
      if (!computeRes.ok) throw new Error('計算失敗')
      const computeResults = await computeRes.json()

      setResults(computeResults)
      setIsPreview(false)
      setLoadedScenarioId(id)
      toast.success(loadedScenarioId ? '已更新並計算完成' : '已儲存並計算完成')

      await refreshSavedScenarios()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '計算失敗')
    } finally {
      setComputing(false)
    }
  }

  async function handleLoadScenario(id: string) {
    try {
      const res = await fetch(`/api/scenarios/${id}`)
      if (!res.ok) throw new Error()
      const sc = await res.json()

      setName(sc.name)
      setWeeklyTickets(sc.weekly_tickets ?? 7000)
      setWeeklyKg(sc.weekly_kg ?? null)
      if (sc.seg_a) {
        setSegA({
          pickup: sc.seg_a.pickup_hkd_per_kg ?? 4.2,
          sorting: sc.seg_a.sorting_hkd_per_kg ?? 0,
          includeSorting: sc.seg_a.include_sorting ?? false,
          bubbleRatio: sc.seg_a.bubble_ratio ?? 1.0,
          perPieceFee: sc.seg_a.per_piece_fee,
          perPieceCurrency: sc.seg_a.per_piece_currency,
        })
      }
      if (sc.vendor_a_id) setVendorAId(sc.vendor_a_id)
      if (sc.vendor_b_id) setVendorBId(sc.vendor_b_id)
      setGatewayMode(sc.b_gateway_mode === 'single' ? 'single' : 'manual')
      if (sc.b_single_gateway) setSingleGateway(sc.b_single_gateway)
      if (sc.b_manual_proportions) setManualProportions(sc.b_manual_proportions)
      setFlightsPerWeek(sc.flights_per_week ?? null)
      setBubbleRate(sc.b_bubble_rate ?? 1.1)
      setB1BubbleRate(sc.b1_bubble_ratio ?? sc.b_bubble_rate ?? 1.1)
      setUseMedianPricing(sc.use_median_pricing ?? false)
      if (sc.vendor_c_id) setVendorCId(sc.vendor_c_id)
      if (sc.vendor_d_id) setVendorDId(sc.vendor_d_id)
      if (sc.d_carrier_proportions) setCarrierProportions(sc.d_carrier_proportions)
      if (sc.vendor_bc_id) setVendorBCId(sc.vendor_bc_id)
      setBcBubbleRate(sc.bc_bubble_ratio ?? 1.0)
      if (sc.vendor_bcd_id) setVendorBCDId(sc.vendor_bcd_id)
      // B2 multi-leg fields
      if (sc.vendor_b2_id) setVendorB2Id(sc.vendor_b2_id)
      if (sc.b2_gateway_mode) setB2GatewayMode(sc.b2_gateway_mode === 'single' ? 'single' : 'manual')
      if (sc.b2_single_gateway) setB2SingleGateway(sc.b2_single_gateway)
      if (sc.b2_manual_proportions) setB2ManualProportions(sc.b2_manual_proportions)
      if (sc.pricing_mode) setScenarioPricingMode(sc.pricing_mode)
      if (sc.exchange_rates) {
        setUsdHkd(sc.exchange_rates.usd_hkd)
        setHkdRmb(sc.exchange_rates.hkd_rmb)
        setUsdRmb(sc.exchange_rates.usd_rmb)
      }
      if (sc.results) setResults(sc.results)

      setLoadedScenarioId(id)
      toast.success(`已載入方案「${sc.name}」`)
    } catch {
      toast.error('載入方案失敗')
    }
  }

  const isBCCombined = pricingMode === 'bc_combined'
  const isBCDCombined = pricingMode === 'bcd_combined'
  const isMultiB = pricingMode === 'multi_b'
  const isMultiBB2C = pricingMode === 'multi_b_b2c'
  const isMultiLeg = isMultiB || isMultiBB2C
  const canCompute = isBCDCombined
    ? !!vendorBCDId
    : isBCCombined
    ? !!vendorBCId
    : isMultiLeg
    ? !!vendorBId && !!vendorB2Id
    : !!vendorBId

  // Build scenario data object (shared between preview and save+compute)
  const buildScenarioData = useCallback(() => ({
    name,
    country_code: country,
    weekly_tickets: weeklyTickets,
    weekly_kg: weeklyKg,
    flights_per_week: flightsPerWeek,
    seg_a: {
      pickup_hkd_per_kg: segA.pickup,
      sorting_hkd_per_kg: segA.sorting,
      include_sorting: segA.includeSorting,
      bubble_ratio: segA.bubbleRatio ?? 1.0,
      per_piece_fee: segA.perPieceFee,
      per_piece_currency: segA.perPieceCurrency,
    },
    vendor_a_id: vendorAId || null,
    vendor_b_id: (isBCCombined || isBCDCombined) ? null : (vendorBId || null),
    b_gateway_mode: gatewayMode,
    b_single_gateway: gatewayMode === 'single' ? singleGateway : null,
    b_manual_proportions: gatewayMode === 'manual' ? manualProportions : null,
    b_bubble_rate: bubbleRate,
    b1_bubble_ratio: isMultiLeg ? b1BubbleRate : null,
    use_median_pricing: useMedianPricing,
    bc_bubble_ratio: bcBubbleRate,
    vendor_c_id: (isBCCombined || isBCDCombined || isMultiBB2C) ? null : (vendorCId || null),
    vendor_d_id: isBCDCombined ? null : (vendorDId || null),
    d_carrier_proportions: carrierProportions.length > 0 ? carrierProportions : null,
    exchange_rates: { usd_hkd: usdHkd, hkd_rmb: hkdRmb, usd_rmb: usdRmb },
    pricing_mode: pricingMode,
    vendor_bc_id: isBCCombined ? vendorBCId : null,
    vendor_bcd_id: isBCDCombined ? vendorBCDId : null,
    // B2 multi-leg fields
    vendor_b2_id: isMultiLeg ? (vendorB2Id || null) : null,
    b2_gateway_mode: isMultiLeg ? b2GatewayMode : null,
    b2_single_gateway: isMultiLeg && b2GatewayMode === 'single' ? b2SingleGateway : null,
    b2_manual_proportions: isMultiLeg && b2GatewayMode === 'manual' ? b2ManualProportions : null,
  }), [name, country, weeklyTickets, weeklyKg, flightsPerWeek, segA, vendorAId, vendorBId, gatewayMode, singleGateway, manualProportions, bubbleRate, b1BubbleRate, bcBubbleRate, vendorCId, vendorDId, carrierProportions, usdHkd, hkdRmb, usdRmb, scenarioPricingMode, vendorBCId, vendorBCDId, isBCCombined, isBCDCombined, isMultiLeg, isMultiBB2C, vendorB2Id, b2GatewayMode, b2SingleGateway, b2ManualProportions, useMedianPricing])

  // Auto-preview: debounced compute when vendor selections change
  useEffect(() => {
    if (!canCompute) return

    const timer = setTimeout(async () => {
      setPreviewing(true)
      try {
        const res = await fetch('/api/scenarios/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildScenarioData()),
        })
        if (res.ok) {
          const data = await res.json()
          setResults(data)
          setIsPreview(true)
        }
      } catch {
        // Silent fail for preview
      } finally {
        setPreviewing(false)
      }
    }, 800)

    return () => clearTimeout(timer)
  }, [canCompute, vendorBId, vendorCId, vendorDId, vendorBCId, vendorBCDId, vendorAId, vendorB2Id, weeklyTickets, weeklyKg, bubbleRate, b1BubbleRate, bcBubbleRate, gatewayMode, singleGateway, b2GatewayMode, b2SingleGateway, usdHkd, hkdRmb, usdRmb, segA, pricingMode, useMedianPricing, buildScenarioData])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title={t.pages.scenarios.title}
        description={t.pages.scenarios.description}
      />

      <div className="flex gap-6 mt-6">
        {/* ─── Left: Config Panel ─── */}
        <div className="w-[380px] flex-shrink-0 space-y-4">
          {/* Scenario name + load */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">方案名稱</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="方案名稱"
                />
              </div>
              {savedScenarios.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">載入已存方案</Label>
                  <Select onValueChange={handleLoadScenario}>
                    <SelectTrigger><SelectValue placeholder="選擇方案" /></SelectTrigger>
                    <SelectContent>
                      {savedScenarios.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Volume */}
          <Card>
            <CardContent className="pt-4">
              <VolumeConfig
                weeklyTickets={weeklyTickets}
                weeklyKg={weeklyKg}
                flightsPerWeek={flightsPerWeek}
                onTicketsChange={setWeeklyTickets}
                onWeeklyKgChange={setWeeklyKg}
                onFlightsPerWeekChange={setFlightsPerWeek}
              />
            </CardContent>
          </Card>

          {/* Exchange Rates */}
          <Card>
            <CardContent className="pt-4 space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                匯率
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[10px]">USD/HKD</Label>
                  <Input type="number" step="0.001" className="h-8 text-xs" value={usdHkd} onChange={(e) => setUsdHkd(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">HKD/RMB</Label>
                  <Input type="number" step="0.001" className="h-8 text-xs" value={hkdRmb} onChange={(e) => setHkdRmb(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">USD/RMB</Label>
                  <Input type="number" step="0.001" className="h-8 text-xs" value={usdRmb} onChange={(e) => setUsdRmb(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 定價模式 */}
          <Card>
            <CardContent className="pt-4 space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                定價模式
              </Label>
              <Select
                value={scenarioPricingMode}
                onValueChange={(v: 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c') => {
                  setScenarioPricingMode(v)
                  // Clear vendor selections for the mode being left
                  if (v === 'segmented') {
                    setVendorBCId('')
                    setVendorBCDId('')
                  } else if (v === 'bc_combined') {
                    setVendorBId('')
                    setVendorCId('')
                    setVendorBCDId('')
                  } else if (v === 'multi_b' || v === 'multi_b_b2c') {
                    setVendorBCId('')
                    setVendorBCDId('')
                  } else {
                    setVendorBId('')
                    setVendorCId('')
                    setVendorDId('')
                    setVendorBCId('')
                  }
                  setResults(null)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="segmented">A + B + C + D（分段報價）</SelectItem>
                  <SelectItem value="bc_combined">A + BC + D（空運清關合併）</SelectItem>
                  <SelectItem value="bcd_combined">A + BCD（全段合併）</SelectItem>
                  <SelectItem value="multi_b">A + B1 + B2 + C + D（多段空運）</SelectItem>
                  <SelectItem value="multi_b_b2c">A + B1 + B2C + D（多段空運+包清）</SelectItem>
                </SelectContent>
              </Select>
              {scenarioPricingMode !== countryPricingMode && (
                <p className="text-[10px] text-amber-600">
                  已覆蓋國家預設（{
                    countryPricingMode === 'segmented' ? '分段'
                    : countryPricingMode === 'bc_combined' ? 'BC合併'
                    : countryPricingMode === 'bcd_combined' ? 'BCD合併'
                    : countryPricingMode === 'multi_b' ? '多段空運'
                    : '多段空運+包清'
                  }）
                </p>
              )}
            </CardContent>
          </Card>

          {/* A段 */}
          <Card>
            <CardContent className="pt-4">
              <SegmentAConfig
                vendors={aVendors}
                selectedVendorId={vendorAId}
                onVendorChange={setVendorAId}
                pickup={segA.pickup}
                sorting={segA.sorting}
                includeSorting={segA.includeSorting}
                bubbleRatio={segA.bubbleRatio}
                perPieceFee={segA.perPieceFee}
                perPieceCurrency={segA.perPieceCurrency}
                onChange={setSegA}
                refreshKey={refreshKeys['A']}
              />
            </CardContent>
          </Card>

          {isBCDCombined ? (
            /* BCD 全段合併 */
            <Card>
              <CardContent className="pt-4 space-y-3">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  BCD 全段合併
                </Label>
                <div className="space-y-1">
                  <Label className="text-xs">供應商</Label>
                  <Select value={vendorBCDId} onValueChange={setVendorBCDId}>
                    <SelectTrigger><SelectValue placeholder="選擇 BCD 供應商" /></SelectTrigger>
                    <SelectContent>
                      {bcdVendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  空運+清關+尾程 一站式服務，依區域×重量查表計價
                </p>
              </CardContent>
            </Card>
          ) : isBCCombined ? (
            /* BC 合併 + D 獨立 */
            <>
              <Card>
                <CardContent className="pt-4">
                  <SegmentBCConfig
                    vendors={bcVendors}
                    selectedVendorId={vendorBCId}
                    onVendorChange={setVendorBCId}
                    bubbleRate={bcBubbleRate}
                    onBubbleRateChange={setBcBubbleRate}
                    refreshKey={refreshKeys['BC']}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <SegmentDConfig
                    vendors={dVendors}
                    selectedVendorId={vendorDId}
                    onVendorChange={setVendorDId}
                    carrierProportions={carrierProportions}
                    onCarrierProportionsChange={setCarrierProportions}
                    refreshKey={refreshKeys['D']}
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              {/* B段 (or B1 in multi-leg) */}
              <Card>
                <CardContent className="pt-4">
                  <SegmentBConfig
                    vendors={bVendors}
                    selectedVendorId={vendorBId}
                    onVendorChange={setVendorBId}
                    gatewayMode={gatewayMode}
                    onGatewayModeChange={setGatewayMode}
                    singleGateway={singleGateway}
                    onSingleGatewayChange={setSingleGateway}
                    manualProportions={manualProportions}
                    onManualProportionsChange={setManualProportions}
                    bubbleRate={isMultiLeg ? b1BubbleRate : bubbleRate}
                    onBubbleRateChange={isMultiLeg ? setB1BubbleRate : setBubbleRate}
                    label={isMultiLeg ? 'B1段 空運（中轉）' : undefined}
                    refreshKey={refreshKeys['B']}
                    useMedianPricing={useMedianPricing}
                    onUseMedianPricingChange={setUseMedianPricing}
                  />
                </CardContent>
              </Card>

              {/* B2段 (multi-leg only) */}
              {isMultiB && (
                <Card>
                  <CardContent className="pt-4">
                    <SegmentBConfig
                      vendors={bVendors}
                      selectedVendorId={vendorB2Id}
                      onVendorChange={setVendorB2Id}
                      gatewayMode={b2GatewayMode}
                      onGatewayModeChange={setB2GatewayMode}
                      singleGateway={b2SingleGateway}
                      onSingleGatewayChange={setB2SingleGateway}
                      manualProportions={b2ManualProportions}
                      onManualProportionsChange={setB2ManualProportions}
                      bubbleRate={bubbleRate}
                      onBubbleRateChange={setBubbleRate}
                      label="B2段 空運（到達）"
                      refreshKey={refreshKeys['B2']}
                    />
                  </CardContent>
                </Card>
              )}

              {/* B2C段 (multi_b_b2c only) */}
              {isMultiBB2C && (
                <Card>
                  <CardContent className="pt-4">
                    <SegmentBCConfig
                      vendors={bcVendors}
                      selectedVendorId={vendorB2Id}
                      onVendorChange={setVendorB2Id}
                      bubbleRate={bcBubbleRate}
                      onBubbleRateChange={setBcBubbleRate}
                      label="B2C段 空運+清關（到達）"
                      refreshKey={refreshKeys['B2C']}
                    />
                  </CardContent>
                </Card>
              )}

              {/* C段 */}
              <Card>
                <CardContent className="pt-4">
                  {isMultiBB2C ? (
                    <div className="space-y-2 opacity-50">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        C段 清關
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        清關費用已��含在 B2C 段
                      </p>
                    </div>
                  ) : (
                    <SegmentCConfig
                      vendors={cVendors}
                      selectedVendorId={vendorCId}
                      onVendorChange={setVendorCId}
                      refreshKey={refreshKeys['C']}
                    />
                  )}
                </CardContent>
              </Card>

              {/* D段 */}
              <Card>
                <CardContent className="pt-4">
                  <SegmentDConfig
                    vendors={dVendors}
                    selectedVendorId={vendorDId}
                    onVendorChange={setVendorDId}
                    carrierProportions={carrierProportions}
                    onCarrierProportionsChange={setCarrierProportions}
                    refreshKey={refreshKeys['D']}
                  />
                </CardContent>
              </Card>
            </>
          )}

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button
              className="w-full"
              size="lg"
              onClick={handleCompute}
              disabled={computing || !canCompute}
            >
              {computing ? '儲存中...' : loadedScenarioId ? '更新並計算' : '儲存並計算'}
            </Button>
            {loadedScenarioId && (
              <Button
                className="w-full"
                size="sm"
                variant="outline"
                onClick={() => {
                  setLoadedScenarioId(null)
                  setName('新方案')
                  setResults(null)
                  toast.info('已切換為新增模式')
                }}
              >
                建立新方案
              </Button>
            )}
            {results && (
              <Button
                className="w-full"
                size="sm"
                variant="outline"
                onClick={() => exportSingleScenario(name, results)}
              >
                匯出 Excel
              </Button>
            )}
          </div>
        </div>

        {/* ─── Right: Results Panel ─── */}
        <div className="flex-1 min-w-0">
          <ResultsPanel results={results} loading={computing || previewing} weeklyTickets={weeklyTickets} isPreview={isPreview} pricingMode={pricingMode as 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c'} />
        </div>
      </div>
    </div>
  )
}
