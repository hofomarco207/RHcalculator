'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { exportSingleScenario } from '@/lib/excel/scenario-exporter'
import { VolumeConfig } from '@/components/scenarios/VolumeConfig'
import { SegmentAConfig } from '@/components/scenarios/SegmentAConfig'
import { SegmentBCConfig } from '@/components/scenarios/SegmentBCConfig'
import { SegmentDConfig } from '@/components/scenarios/SegmentDConfig'
import { ResultsPanel } from '@/components/scenarios/ResultsPanel'
import type { Vendor } from '@/types'
import type { ScenarioResults } from '@/types/scenario'
import { useT } from '@/lib/i18n'

export default function ScenariosPage() {
  const t = useT()

  const [aVendors, setAVendors] = useState<Vendor[]>([])
  const [bcVendors, setBcVendors] = useState<Vendor[]>([])

  const [name, setName] = useState('新方案')
  const [weeklyTickets, setWeeklyTickets] = useState(7000)
  const [weeklyKg, setWeeklyKg] = useState<number | null>(null)
  const [vendorAId, setVendorAId] = useState('')
  const [segA, setSegA] = useState<{
    pickup: number; sorting: number; includeSorting: boolean;
    bubbleRatio?: number; perKgCurrency?: string; perPieceFee?: number; perPieceCurrency?: string
  }>({ pickup: 4.2, sorting: 0, includeSorting: false, bubbleRatio: 1.0, perKgCurrency: 'TWD' })
  const [vendorBCId, setVendorBCId] = useState('')
  const [bcBubbleRate, setBcBubbleRate] = useState(1.0)
  const [dCompetitorName, setDCompetitorName] = useState('')
  const [dServiceCode, setDServiceCode] = useState('')
  const [twdHkd, setTwdHkd] = useState(0.2440)
  const [usdHkd] = useState(7.814)
  const [hkdRmb] = useState(0.934)
  const [usdRmb] = useState(7.295)
  const [refreshKeys, setRefreshKeys] = useState<Record<string, number>>({})

  // Country selector for per-country D-segment view
  const [availableCountries, setAvailableCountries] = useState<Array<{ id: string; label: string }>>([])
  const [selectedCountry, setSelectedCountry] = useState('')

  // Exchange rates collapse
  const [exchangeRatesOpen, setExchangeRatesOpen] = useState(false)

  const [results, setResults] = useState<ScenarioResults | null>(null)
  const [computing, setComputing] = useState(false)
  const [isPreview, setIsPreview] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [loadedScenarioId, setLoadedScenarioId] = useState<string | null>(null)
  const [savedScenarios, setSavedScenarios] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/vendors?segment=A').then((r) => r.json()),
      fetch('/api/vendors?segment=BC').then((r) => r.json()),
      fetch('/api/scenarios').then((r) => r.json()),
    ]).then(([a, bc, s]) => {
      if (Array.isArray(a)) setAVendors(a)
      if (Array.isArray(bc)) setBcVendors(bc)
      if (Array.isArray(s)) setSavedScenarios(s.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
    })
  }, [])

  useEffect(() => { if (aVendors.length === 1 && !vendorAId) setVendorAId(aVendors[0].id) }, [aVendors, vendorAId])
  useEffect(() => { if (bcVendors.length === 1 && !vendorBCId) setVendorBCId(bcVendors[0].id) }, [bcVendors, vendorBCId])

  // Load countries from D-segment competitor card
  useEffect(() => {
    if (!dCompetitorName || !dServiceCode) {
      setAvailableCountries([])
      setSelectedCountry('')
      return
    }
    fetch(`/api/competitor-rate-cards?competitor_name=${encodeURIComponent(dCompetitorName)}&service_code=${encodeURIComponent(dServiceCode)}&is_current=true`)
      .then((r) => r.json())
      .then((rows: Array<{ country_code?: string | null; country_name_en: string; country_name_zh?: string | null }>) => {
        if (!Array.isArray(rows)) return
        // Deduplicate by id — competitor cards may have multiple rows per country
        // (e.g. AU-1/AU-2/AU-3 all with country_name_en="Australia" and null country_code)
        const seen = new Map<string, { id: string; label: string }>()
        for (const r of rows) {
          const id = r.country_code ?? r.country_name_zh?.trim() ?? r.country_name_en
          if (!seen.has(id)) {
            seen.set(id, { id, label: r.country_name_zh?.trim() || r.country_name_en })
          }
        }
        const countries = [...seen.values()]
          .sort((a, b) => a.label.localeCompare(b.label, 'zh'))
        setAvailableCountries(countries)
        // Default to US/美國 if available, else first country
        const us = countries.find((c) => c.id === 'US' || c.label === '美國' || c.label === 'United States')
        setSelectedCountry(us ? us.id : (countries[0]?.id ?? ''))
      })
      .catch(() => { setAvailableCountries([]); setSelectedCountry('') })
  }, [dCompetitorName, dServiceCode])

  const refreshSavedScenarios = useCallback(async () => {
    const res = await fetch('/api/scenarios')
    const list = await res.json()
    if (Array.isArray(list)) setSavedScenarios(list.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
  }, [])

  const canCompute = !!vendorBCId

  const buildScenarioData = useCallback(() => ({
    name,
    pricing_mode: 'bc_combined',
    weekly_tickets: weeklyTickets,
    weekly_kg: weeklyKg,
    seg_a: {
      pickup_hkd_per_kg: segA.pickup,
      sorting_hkd_per_kg: segA.sorting,
      include_sorting: segA.includeSorting,
      bubble_ratio: segA.bubbleRatio ?? 1.0,
      per_kg_currency: segA.perKgCurrency ?? 'TWD',
      per_piece_fee: segA.perPieceFee,
      per_piece_currency: segA.perPieceCurrency ?? 'TWD',
    },
    vendor_a_id: vendorAId || null,
    vendor_bc_id: vendorBCId || null,
    bc_bubble_ratio: bcBubbleRate,
    vendor_d_id: null,
    d_competitor_name: dCompetitorName || null,
    d_service_code: dServiceCode || null,
    exchange_rates: { usd_hkd: usdHkd, hkd_rmb: hkdRmb, usd_rmb: usdRmb, twd_hkd: twdHkd },
  }), [name, weeklyTickets, weeklyKg, segA, vendorAId, vendorBCId, bcBubbleRate, dCompetitorName, dServiceCode, usdHkd, hkdRmb, usdRmb, twdHkd])

  async function handleCompute() {
    if (!vendorBCId) { toast.error('請選擇 BC 供應商'); return }
    setComputing(true)
    try {
      let id: string
      if (loadedScenarioId) {
        const saveRes = await fetch(`/api/scenarios/${loadedScenarioId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildScenarioData()),
        })
        if (!saveRes.ok) throw new Error((await saveRes.json()).error || '更新方案失敗')
        id = loadedScenarioId
      } else {
        const saveRes = await fetch('/api/scenarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildScenarioData()),
        })
        if (!saveRes.ok) throw new Error((await saveRes.json()).error || '儲存方案失敗')
        id = (await saveRes.json()).id
      }
      const computeRes = await fetch(`/api/scenarios/${id}/compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country_code: selectedCountry }),
      })
      if (!computeRes.ok) {
        const errBody = await computeRes.json().catch(() => ({}))
        throw new Error(errBody.error || '計算失敗')
      }
      setResults(await computeRes.json())
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
          perKgCurrency: sc.seg_a.per_kg_currency ?? 'TWD',
          perPieceFee: sc.seg_a.per_piece_fee,
          perPieceCurrency: sc.seg_a.per_piece_currency ?? 'TWD',
        })
      }
      if (sc.vendor_a_id) setVendorAId(sc.vendor_a_id)
      if (sc.vendor_bc_id) setVendorBCId(sc.vendor_bc_id)
      setBcBubbleRate(sc.bc_bubble_ratio ?? 1.0)
      if (sc.d_competitor_name) setDCompetitorName(sc.d_competitor_name)
      if (sc.d_service_code) setDServiceCode(sc.d_service_code)
      if (sc.exchange_rates) {
        if (sc.exchange_rates.twd_hkd) setTwdHkd(sc.exchange_rates.twd_hkd)
      }
      if (sc.results) setResults(sc.results)
      setLoadedScenarioId(id)
      toast.success(`已載入方案「${sc.name}」`)
    } catch { toast.error('載入方案失敗') }
  }

  // Auto-preview: fires on any config change (debounced 800ms)
  useEffect(() => {
    if (!canCompute) return
    const timer = setTimeout(async () => {
      setPreviewing(true)
      try {
        const res = await fetch('/api/scenarios/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...buildScenarioData(), country_code: selectedCountry }),
        })
        if (res.ok) {
          setResults(await res.json()); setIsPreview(true)
        } else {
          const err = await res.json().catch(() => ({}))
          console.warn('Preview failed:', err.error)
        }
      } catch (e) { console.warn('Preview error:', e) } finally { setPreviewing(false) }
    }, 800)
    return () => clearTimeout(timer)
  }, [canCompute, vendorBCId, dCompetitorName, dServiceCode, vendorAId, weeklyTickets, weeklyKg, bcBubbleRate, twdHkd, segA, selectedCountry, buildScenarioData])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title={t.pages.scenarios.title} description={t.pages.scenarios.description} />

      <div className="flex gap-6 mt-6">
        {/* ── Left column: config ── */}
        <div className="w-[380px] flex-shrink-0 space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">方案名稱</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="方案名稱" />
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

          <Card>
            <CardContent className="pt-4">
              <VolumeConfig
                weeklyTickets={weeklyTickets}
                weeklyKg={weeklyKg}
                flightsPerWeek={null}
                onTicketsChange={setWeeklyTickets}
                onWeeklyKgChange={setWeeklyKg}
                onFlightsPerWeekChange={() => {}}
              />
            </CardContent>
          </Card>

          {/* Exchange rates — collapsible, TWD/HKD only */}
          <Card>
            <CardContent className="pt-4 space-y-2">
              <button
                className="flex w-full items-center justify-between"
                onClick={() => setExchangeRatesOpen((v) => !v)}
              >
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-pointer">匯率</Label>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`w-4 h-4 text-muted-foreground transition-transform ${exchangeRatesOpen ? 'rotate-180' : ''}`}
                >
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>
              {exchangeRatesOpen && (
                <div className="space-y-0.5 pt-1">
                  <Label className="text-[10px] text-muted-foreground">TWD/HKD</Label>
                  <Input
                    type="number" step="0.0001" className="h-8 text-xs"
                    value={twdHkd}
                    onChange={(e) => setTwdHkd(parseFloat(e.target.value) || 0)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

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
                perKgCurrency={segA.perKgCurrency}
                perPieceFee={segA.perPieceFee}
                perPieceCurrency={segA.perPieceCurrency}
                onChange={setSegA}
                refreshKey={refreshKeys['A']}
              />
            </CardContent>
          </Card>

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
                selectedCompetitorKey={dCompetitorName && dServiceCode ? `${dCompetitorName}||${dServiceCode}` : ''}
                onCompetitorChange={(cn, sc) => { setDCompetitorName(cn); setDServiceCode(sc) }}
              />
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Button className="w-full" size="lg" onClick={handleCompute} disabled={computing || !canCompute}>
              {computing ? '儲存中...' : loadedScenarioId ? '更新並計算' : '儲存並計算'}
            </Button>
            {loadedScenarioId && (
              <Button className="w-full" size="sm" variant="outline" onClick={() => {
                setLoadedScenarioId(null); setName('新方案'); setResults(null); toast.info('已切換為新增模式')
              }}>
                建立新方案
              </Button>
            )}
            {results && (
              <Button className="w-full" size="sm" variant="outline" onClick={() => exportSingleScenario(name, results)}>
                匯出 Excel
              </Button>
            )}
          </div>
        </div>

        {/* ── Right column: country selector + results ── */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Country selector — only shown when D-segment countries are loaded */}
          {availableCountries.length > 0 && (
            <div className="flex items-center justify-end gap-3">
              <Label className="text-sm text-muted-foreground shrink-0">查看國家：</Label>
              <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger className="w-60">
                  <SelectValue placeholder="選擇國家" />
                </SelectTrigger>
                <SelectContent>
                  {availableCountries.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <ResultsPanel
            results={results}
            loading={computing || previewing}
            weeklyTickets={weeklyTickets}
            isPreview={isPreview}
            pricingMode="bc_combined"
          />
        </div>
      </div>
    </div>
  )
}
