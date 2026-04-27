'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import type { Vendor } from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuoteImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportSuccess: () => void
  country: string
}

interface QuoteMeta {
  source_file?: string
  interpreted_at?: string
  segment: string
  route?: { origin?: string; destination?: string }
  currency?: string
  country_code?: string
  notes?: string
}

interface QuoteFile {
  meta: QuoteMeta
  vendor_quotes: Array<Record<string, unknown>>
  cost_estimate?: Record<string, unknown>
}

interface ParsedPreview {
  raw: QuoteFile
  segment: string
  segmentLabel: string
  vendorName: string
  product: string
  currency: string
  countryCode: string
  ratesSummary: string
  canImport: boolean
}

const SEGMENT_LABELS: Record<string, string> = {
  B: 'B段 空運',
  C: 'C段 清關',
  D: 'D段 尾程',
  BC: 'BC 空運+清關',
  BCD: 'BCD 全段合併',
}

// ─── Parse & Preview ────────────────────────────────────────────────────────

function parseQuoteJson(text: string): ParsedPreview {
  const raw = JSON.parse(text) as QuoteFile

  if (!raw.meta) throw new Error('缺少 meta 欄位')
  if (!raw.vendor_quotes || raw.vendor_quotes.length === 0) throw new Error('缺少 vendor_quotes')

  const seg = raw.meta.segment?.toUpperCase() ?? ''
  if (!SEGMENT_LABELS[seg]) throw new Error(`不支援的段別: ${raw.meta.segment}`)

  const quote = raw.vendor_quotes[0]
  const vendorName = (quote.vendor as string) ?? '未知'
  const product = (quote.product as string) ?? ''
  const currency = (raw.meta.currency as string) ?? 'USD'

  // Derive country_code from meta
  const countryCode = raw.meta.country_code
    ?? (raw.meta.route?.destination?.substring(0, 2)?.toUpperCase())
    ?? ''

  // Build summary based on segment + structure
  let ratesSummary = ''
  const structure = (quote.pricing_structure as string) ?? (quote.pricing_model as string) ?? ''

  if (seg === 'BC') {
    const rates = quote.rates as Record<string, number> | undefined
    if (rates) {
      ratesSummary = `${rates.freight_per_kg} ${currency}/kg + ${rates.handling_per_ticket} ${currency}/票`
    }
  } else if (seg === 'D' && structure === 'first_additional') {
    const zones = (quote.zones as Array<Record<string, unknown>>) ?? []
    ratesSummary = `${zones.length} 個分區，首重/續重模型`
    if (zones.length > 0) {
      const z0 = zones[0]
      ratesSummary += `（${z0.zone}: 首重 ${z0.first_1kg_usd}，續重 ${z0.additional_per_kg_usd}）`
    }
  } else if (seg === 'D' && structure === 'weight_bracket') {
    const zones = (quote.zones as Array<Record<string, unknown>>) ?? []
    ratesSummary = `${zones.length} 個分區，重量段模型`
  } else if (seg === 'D' && structure === 'tiered_per_kg') {
    const tiers = (quote.tiers as Array<Record<string, unknown>>)
      ?? (quote.weight_tiers as Array<Record<string, unknown>>) ?? []
    ratesSummary = `${tiers.length} 個重量段`
  } else if (seg === 'D' && structure === 'lookup_table') {
    const areas = (quote.areas as Array<Record<string, unknown>>) ?? []
    ratesSummary = `${areas.length} 個區域，查表模型`
  } else if (seg === 'B') {
    const rates = (quote.rates as Array<Record<string, unknown>>) ?? (quote.tiers as Array<Record<string, unknown>>) ?? []
    ratesSummary = `${rates.length} 筆費率`
  } else if (seg === 'BCD') {
    ratesSummary = 'BCD 全段合併費率'
  } else {
    ratesSummary = `${structure || '未知結構'}`
  }

  return {
    raw,
    segment: seg,
    segmentLabel: SEGMENT_LABELS[seg] ?? seg,
    vendorName,
    product,
    currency,
    countryCode,
    ratesSummary,
    canImport: true,
  }
}

// ─── Map quote to API call ──────────────────────────────────────────────────

async function importQuote(
  preview: ParsedPreview,
  vendorId: string,
): Promise<{ success: boolean; message: string }> {
  const quote = preview.raw.vendor_quotes[0]
  const structure = (quote.pricing_structure as string) ?? (quote.pricing_model as string) ?? ''

  if (preview.segment === 'BC') {
    const rates = quote.rates as Record<string, number>
    const res = await fetch(`/api/vendors/${vendorId}/bc-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rate_per_kg: rates.freight_per_kg,
        handling_fee_per_unit: rates.handling_per_ticket ?? 0,
        currency: preview.currency,
        notes: preview.raw.meta.notes ?? null,
      }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'BC 費率匯入失敗')
    return { success: true, message: `BC 費率已匯入：${rates.freight_per_kg} ${preview.currency}/kg` }
  }

  if (preview.segment === 'D' && structure === 'first_additional') {
    const zones = (quote.zones as Array<Record<string, unknown>>) ?? []
    const apiRates = zones.map((z) => ({
      zone: z.zone as string,
      first_weight_kg: 1,
      first_weight_price: z.first_1kg_usd as number,
      additional_weight_kg: 1,
      additional_weight_price: z.additional_per_kg_usd as number,
      currency: preview.currency,
    }))
    const res = await fetch(`/api/vendors/${vendorId}/d-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rates: apiRates }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'D 費率匯入失敗')
    return { success: true, message: `D段 ${zones.length} 個分區費率已匯入` }
  }

  if (preview.segment === 'D' && structure === 'weight_bracket') {
    const zones = (quote.zones as Array<Record<string, unknown>>) ?? []
    const apiRates: Array<Record<string, unknown>> = []
    for (const z of zones) {
      const brackets = (z.brackets as Array<Record<string, unknown>>) ?? []
      for (const b of brackets) {
        apiRates.push({
          zone: z.zone as string,
          first_weight_kg: b.weight_max_kg as number,
          first_weight_price: b.price as number,
          additional_weight_kg: (b.additional_weight_kg as number) ?? 0,
          additional_weight_price: (b.additional_weight_price as number) ?? 0,
          currency: preview.currency,
        })
      }
    }
    const res = await fetch(`/api/vendors/${vendorId}/d-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rates: apiRates }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'D 費率匯入失敗')
    return { success: true, message: `D段 ${apiRates.length} 筆重量段費率已匯入` }
  }

  if (preview.segment === 'D' && structure === 'tiered_per_kg') {
    const rawTiers = (quote.tiers as Array<Record<string, unknown>>)
      ?? (quote.weight_tiers as Array<Record<string, unknown>>) ?? []
    const countryCode = (quote.country as string)
      ?? preview.raw.meta.route?.destination ?? preview.countryCode
    // Normalize: weight_tiers format → API format
    const apiRates = rawTiers.map((t) => ({
      country_code: (t.country_code as string) ?? countryCode,
      weight_min_kg: t.weight_min_kg ?? t.min_weight_kg_exclusive ?? 0,
      weight_max_kg: t.weight_max_kg ?? t.max_weight_kg_inclusive ?? 0,
      rate_per_kg: t.rate_per_kg ?? t.delivery_fee_hkd_per_kg ?? 0,
      registration_fee: t.registration_fee ?? t.registration_fee_hkd_per_parcel ?? 0,
      currency: t.currency ?? preview.currency,
      min_chargeable_weight_kg: t.min_chargeable_weight_kg
        ?? (quote.minimum_chargeable_weight_kg as number) ?? undefined,
      transit_days: t.transit_days
        ?? (quote.transit_time_working_days as string) ?? undefined,
    }))
    const res = await fetch(`/api/vendors/${vendorId}/d-tiered-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rates: apiRates,
        source: 'quote_import',
        source_file: preview.raw.meta.source_file ?? null,
      }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'D 階梯費率匯入失敗')
    return { success: true, message: `D段 ${apiRates.length} 筆階梯費率已匯入` }
  }

  if (preview.segment === 'D' && structure === 'lookup_table') {
    const areas = (quote.areas as Array<Record<string, unknown>>) ?? []
    const areaCountries = (quote.area_countries as Array<Record<string, unknown>>) ?? []
    const rates: Array<Record<string, unknown>> = []
    for (const a of areas) {
      const rows = (a.rates as Array<Record<string, unknown>>) ?? []
      for (const r of rows) {
        rates.push({
          area_code: a.area_code,
          area_name: a.area_name ?? null,
          weight_kg: r.weight_kg,
          amount: r.amount,
          currency: preview.currency,
        })
      }
    }
    const res = await fetch(`/api/vendors/${vendorId}/d-lookup-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rates, area_countries: areaCountries }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'D 查表費率匯入失敗')
    return { success: true, message: `D段 ${rates.length} 筆查表費率已匯入` }
  }

  if (preview.segment === 'B') {
    const rates = (quote.rates as Array<Record<string, unknown>>) ?? []
    const res = await fetch(`/api/vendors/${vendorId}/b-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rates }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'B 費率匯入失敗')
    return { success: true, message: `B段 ${rates.length} 筆費率已匯入` }
  }

  if (preview.segment === 'BCD') {
    // BCD uses the lookup structure
    const areas = (quote.areas as Array<Record<string, unknown>>) ?? []
    const areaCountries = (quote.area_countries as Array<Record<string, unknown>>) ?? []
    const rates: Array<Record<string, unknown>> = []
    for (const a of areas) {
      const rows = (a.rates as Array<Record<string, unknown>>) ?? []
      for (const r of rows) {
        rates.push({
          area_code: a.area_code,
          area_name: a.area_name ?? null,
          weight_kg: r.weight_kg,
          amount: r.amount,
          currency: preview.currency,
          fuel_surcharge_pct: r.fuel_surcharge_pct ?? null,
        })
      }
    }
    // Use the bcd-rates endpoint if it accepts bulk, otherwise use import-quote
    const res = await fetch(`/api/vendors/${vendorId}/d-lookup-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rates, area_countries: areaCountries }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'BCD 費率匯入失敗')
    return { success: true, message: `BCD ${rates.length} 筆費率已匯入` }
  }

  throw new Error(`不支援的匯入組合：${preview.segment} / ${structure}`)
}

// ─── Save cost estimate ─────────────────────────────────────────────────────

async function saveCostEstimate(preview: ParsedPreview, vendorId: string) {
  if (!preview.raw.cost_estimate) return
  try {
    await fetch('/api/vendors/import-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meta: {
          ...preview.raw.meta,
          country_code: preview.countryCode,
          segment: preview.segment,
        },
        vendor_quotes: [], // rates already imported above
        cost_estimate: preview.raw.cost_estimate,
        _vendor_id_override: vendorId,
      }),
    })
  } catch {
    // Non-critical — silently ignore cost_estimate save failures
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function QuoteImportDialog({
  open,
  onOpenChange,
  onImportSuccess,
  country,
}: QuoteImportDialogProps) {
  const t = useT()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [jsonText, setJsonText] = useState('')
  const [preview, setPreview] = useState<ParsedPreview | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Vendor selection
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [selectedVendorId, setSelectedVendorId] = useState<string>('__new__')
  const [newVendorName, setNewVendorName] = useState('')
  const [loadingVendors, setLoadingVendors] = useState(false)

  // Import state
  const [importing, setImporting] = useState(false)
  const [overwriteConfirm, setOverwriteConfirm] = useState<{
    vendorId: string
    vendorName: string
    rateCount: number
  } | null>(null)

  // Load vendors when preview segment changes
  useEffect(() => {
    if (!preview) return
    setLoadingVendors(true)
    const seg = preview.segment
    const cc = preview.countryCode || country
    fetch(`/api/vendors?segment=${seg}&country=${cc}&include_inactive=true`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          setVendors(d)
          // If vendor name matches an existing one, auto-select it
          const match = d.find((v: Vendor) => v.name === preview.vendorName)
          if (match) {
            setSelectedVendorId(match.id)
          } else {
            setSelectedVendorId('__new__')
            setNewVendorName(preview.vendorName)
          }
        }
      })
      .catch(() => setVendors([]))
      .finally(() => setLoadingVendors(false))
  }, [preview, country])

  function handleReset() {
    setJsonText('')
    setPreview(null)
    setParseError(null)
    setSelectedVendorId('__new__')
    setNewVendorName('')
    setVendors([])
    setOverwriteConfirm(null)
  }

  function handleParse(text: string) {
    setJsonText(text)
    setParseError(null)
    setPreview(null)
    try {
      const p = parseQuoteJson(text)
      setPreview(p)
      setNewVendorName(p.vendorName)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'JSON 解析失敗')
    }
  }

  async function handleFileSelected(file: File) {
    try {
      const text = await file.text()
      handleParse(text)
    } catch {
      setParseError('無法讀取檔案')
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelected(file)
  }, [])

  async function checkExistingRates(vendorId: string, segment: string): Promise<number> {
    const structure = (preview?.raw.vendor_quotes[0]?.pricing_structure as string)
      ?? (preview?.raw.vendor_quotes[0]?.pricing_model as string) ?? ''
    let url = ''
    if (segment === 'BC') url = `/api/vendors/${vendorId}/bc-rates`
    else if (segment === 'B') url = `/api/vendors/${vendorId}/b-rates`
    else if (segment === 'D' && (structure === 'tiered_per_kg')) url = `/api/vendors/${vendorId}/d-tiered-rates`
    else if (segment === 'D' && (structure === 'lookup_table')) url = `/api/vendors/${vendorId}/d-lookup-rates`
    else if (segment === 'D') url = `/api/vendors/${vendorId}/d-rates`
    else if (segment === 'BCD') url = `/api/vendors/${vendorId}/d-lookup-rates`
    else return 0

    try {
      const res = await fetch(url)
      if (!res.ok) return 0
      const data = await res.json()
      if (Array.isArray(data)) return data.length
      // BC returns single object; d-lookup-rates returns { rates: [], area_countries: [] }
      if (data?.rates && Array.isArray(data.rates)) return data.rates.length
      if (data && typeof data === 'object' && data.id) return 1
      return 0
    } catch {
      return 0
    }
  }

  async function handleImport() {
    if (!preview) return
    setImporting(true)
    try {
      let vendorId = selectedVendorId

      // Create vendor if needed
      if (vendorId === '__new__') {
        const name = newVendorName.trim()
        if (!name) { toast.error('請輸入供應商名稱'); setImporting(false); return }

        const cc = preview.countryCode || country
        const res = await fetch('/api/vendors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            segment: preview.segment,
            country_code: preview.segment === 'A' ? 'GLB' : cc,
            notes: `從 ${preview.raw.meta.source_file ?? 'JSON'} 匯入`,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? '新增供應商失敗')
        const created = await res.json()
        vendorId = created.id
      } else {
        // Check if existing vendor already has rates
        const existingCount = await checkExistingRates(vendorId, preview.segment)
        if (existingCount > 0) {
          const vendorLabel = vendors.find((v) => v.id === vendorId)?.name ?? '該供應商'
          setOverwriteConfirm({ vendorId, vendorName: vendorLabel, rateCount: existingCount })
          setImporting(false)
          return
        }
      }

      await doImport(vendorId)
    } catch (err) {
      toast.error(`${t.common.importFailed}：${err instanceof Error ? err.message : t.common.error}`)
      setImporting(false)
    }
  }

  async function doImport(vendorId: string) {
    if (!preview) return
    setImporting(true)
    try {
      const result = await importQuote(preview, vendorId)

      // Save cost estimate (non-blocking)
      saveCostEstimate(preview, vendorId)

      toast.success(result.message)
      onImportSuccess()
      onOpenChange(false)
      handleReset()
    } catch (err) {
      toast.error(`${t.common.importFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setImporting(false)
    }
  }

  async function handleOverwriteConfirm() {
    if (!overwriteConfirm) return
    setOverwriteConfirm(null)
    await doImport(overwriteConfirm.vendorId)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) handleReset()
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.pages.vendors.importQuoteJson}</DialogTitle>
        </DialogHeader>

        {/* Step 1: File input */}
        {!preview && !parseError && (
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              className={`relative rounded-lg border-2 border-dashed transition-colors cursor-pointer
                ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelected(file)
                }}
              />
              <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
                <div className="text-2xl text-muted-foreground">{ '{...}' }</div>
                <p className="text-sm font-medium">拖放 JSON 檔案至此，或點擊選擇</p>
                <p className="text-xs text-muted-foreground">支援報價 JSON（含 meta + vendor_quotes）</p>
              </div>
            </div>

            {/* Or paste */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 border-t" />
                <span className="text-xs text-muted-foreground">或直接貼上 JSON</span>
                <div className="flex-1 border-t" />
              </div>
              <Textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder='{"meta": {...}, "vendor_quotes": [...], ...}'
                className="font-mono text-xs min-h-[120px] resize-y"
              />
              {jsonText.trim() && (
                <Button size="sm" onClick={() => handleParse(jsonText)}>
                  解析 JSON
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Parse error */}
        {parseError && (
          <div className="space-y-3">
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">解析失敗</p>
              <p className="text-xs mt-1">{parseError}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset}>重新選擇</Button>
          </div>
        )}

        {/* Step 2: Preview + vendor selection */}
        {preview && (
          <div className="space-y-4">
            {/* Preview card */}
            <div className="rounded-md border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{preview.segmentLabel}</span>
                <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground underline">
                  重新選擇
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div><span className="text-muted-foreground">供應商：</span>{preview.vendorName}</div>
                <div><span className="text-muted-foreground">產品：</span>{preview.product || '—'}</div>
                <div><span className="text-muted-foreground">幣種：</span>{preview.currency}</div>
                <div><span className="text-muted-foreground">國家：</span>{preview.countryCode || '—'}</div>
                <div className="col-span-2"><span className="text-muted-foreground">費率：</span>{preview.ratesSummary}</div>
                {preview.raw.meta.source_file && (
                  <div className="col-span-2"><span className="text-muted-foreground">來源：</span>{preview.raw.meta.source_file}</div>
                )}
                {preview.raw.meta.notes && (
                  <div className="col-span-2"><span className="text-muted-foreground">備註：</span>{preview.raw.meta.notes}</div>
                )}
              </div>

              {/* Cost estimate preview */}
              {preview.raw.cost_estimate && (
                <div className="border-t pt-2 mt-2">
                  <p className="text-xs text-muted-foreground mb-1">成本估算：</p>
                  <div className="text-xs grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {(preview.raw.cost_estimate as Record<string, unknown>).basis ? (
                      <div className="col-span-2">{String((preview.raw.cost_estimate as Record<string, unknown>).basis)}</div>
                    ) : null}
                    {(preview.raw.cost_estimate as Record<string, unknown>).equivalent_per_kg != null ? (
                      <div>
                        <span className="text-muted-foreground">等效 per KG：</span>
                        <span className="font-mono font-medium">
                          {String((preview.raw.cost_estimate as Record<string, unknown>).equivalent_per_kg)} {preview.currency}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            {/* Vendor selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">匯入到哪個供應商？</Label>

              {loadingVendors ? (
                <p className="text-xs text-muted-foreground">{t.common.loading}</p>
              ) : (
                <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.scenarioConfig.selectVendor} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__">+ 新增供應商</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}{!v.is_active ? ` (${t.common.inactive})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {selectedVendorId === '__new__' && (
                <div className="space-y-1">
                  <Label className="text-xs">新供應商名稱</Label>
                  <Input
                    value={newVendorName}
                    onChange={(e) => setNewVendorName(e.target.value)}
                    placeholder={preview.vendorName}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    將新增 {preview.segmentLabel} 供應商到 {preview.countryCode || country}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Overwrite confirmation */}
        {overwriteConfirm && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-3">
            <p className="text-sm font-medium text-amber-900">
              「{overwriteConfirm.vendorName}」已有 {overwriteConfirm.rateCount} 筆費率資料
            </p>
            <p className="text-xs text-amber-800">
              繼續匯入會覆蓋原有價卡，是否確認？
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOverwriteConfirm(null)}
              >
                {t.common.cancel}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleOverwriteConfirm}
              >
                確認覆蓋
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={importing}>
            {t.common.cancel}
          </Button>
          {preview && !overwriteConfirm && (
            <Button
              onClick={handleImport}
              disabled={importing || (selectedVendorId === '__new__' && !newVendorName.trim())}
            >
              {importing
                ? t.common.importing
                : selectedVendorId === '__new__'
                ? `新增供應商並匯入`
                : '匯入費率'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
