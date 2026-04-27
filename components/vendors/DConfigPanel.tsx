'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { ExcelDropZone } from '@/components/data/ExcelDropZone'
import { parseLastMileExcel } from '@/lib/excel/last-mile-parser'
import { generateLastMileRateTemplate } from '@/lib/excel/template-generator'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCountry } from '@/lib/context/country-context'
import { useT } from '@/lib/i18n'
import type { LastMileRate, ZipZoneMapping, Vendor, Carrier } from '@/types'
import type { VendorDConfig } from '@/types/vendor'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface DConfigPanelProps {
  vendor: Vendor
}

interface CarrierData {
  rate_count: number
  rate_sample: LastMileRate[]
  zip_zone_count: number
  zip_zone_sample: ZipZoneMapping[]
  last_imported_at: string | null
}

interface ImportPreview {
  carriers: string[]
  ratesByCarrier: Record<string, number>
  zipZonesByCarrier: Record<string, number>
  sheets: string[]
  file: File
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export function DConfigPanel({ vendor }: DConfigPanelProps) {
  const isPerPiece = vendor.config?.per_piece === true
  const isSimple = vendor.config?.simple_rate === true
  if (isPerPiece) return <DRatePerPiecePanel vendor={vendor} />
  if (isSimple) return <DRateSimplePanel vendor={vendor} />
  return <DConfigFullPanel vendor={vendor} />
}

// ─── Per-Piece Panel: fixed fee per shipment (no weight) ───────────────────

function DRatePerPiecePanel({ vendor }: DConfigPanelProps) {
  const t = useT()
  const [fee, setFee] = useState(String((vendor.config?.per_piece_fee as number) || ''))
  const [currency, setCurrency] = useState((vendor.config?.per_piece_currency as string) || 'USD')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const feeNum = parseFloat(fee)
    if (!fee || isNaN(feeNum) || feeNum <= 0) {
      toast.error(t.vendorPanels.dRate.perPieceFee ?? '請輸入每件費用')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { ...vendor.config, per_piece: true, per_piece_fee: feeNum, per_piece_currency: currency },
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${t.vendorPanels.dRate.title} ${t.common.success}`)
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{vendor.name} — {t.vendorPanels.dRate.title} ({t.vendorPanels.dRate.perPieceLabel ?? '按件計費'})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3">
          <div className="space-y-1 flex-1 max-w-48">
            <Label className="text-xs">{t.vendorPanels.dRate.perPieceFee ?? '每件費用'}</Label>
            <Input
              type="number"
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1 w-24">
            <Label className="text-xs">{t.common.currency}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="RMB">RMB</SelectItem>
                <SelectItem value="HKD">HKD</SelectItem>
                <SelectItem value="JPY">JPY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? t.common.saving : t.common.save}
          </Button>
        </div>
        {fee && parseFloat(fee) > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {t.vendorPanels.dRate.perPieceFormula ?? '成本'} = {fee} {currency}/{t.vendorPanels.dRate.perPieceUnit ?? '件'}（{t.vendorPanels.dRate.perPieceNoWeight ?? '固定金額，不看重量'}）
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Simple Panel: single per-KG rate ──────────────────────────────────────

function DRateSimplePanel({ vendor }: DConfigPanelProps) {
  const t = useT()
  const [rate, setRate] = useState(String(vendor.config?.rate_per_kg || ''))
  const [currency, setCurrency] = useState(vendor.config?.rate_currency || 'USD')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const rateNum = parseFloat(rate)
    if (!rate || isNaN(rateNum) || rateNum <= 0) {
      toast.error(t.vendorPanels.bRate.ratePerKg)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { ...vendor.config, simple_rate: true, rate_per_kg: rateNum, rate_currency: currency },
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${t.vendorPanels.dRate.title} ${t.common.success}`)
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{vendor.name} — {t.vendorPanels.dRate.title} ({t.vendorPanels.bRate.simpleRateLabel})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3">
          <div className="space-y-1 flex-1 max-w-48">
            <Label className="text-xs">{t.vendorPanels.bRate.ratePerKg}</Label>
            <Input
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1 w-24">
            <Label className="text-xs">{t.common.currency}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="RMB">RMB</SelectItem>
                <SelectItem value="HKD">HKD</SelectItem>
                <SelectItem value="JPY">JPY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? t.common.saving : t.common.save}
          </Button>
        </div>
        {rate && parseFloat(rate) > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            成本 = {rate} {currency}/KG × 重量
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Full Panel: carrier-based rate management ─────────────────────────────

function DConfigFullPanel({ vendor }: DConfigPanelProps) {
  const t = useT()
  const { carriers: allCarriers } = useCountry()

  // Carrier config state
  const [config, setConfig] = useState<VendorDConfig[]>([])
  const [loading, setLoading] = useState(true)

  // Add-carrier dialog
  const [showAddCarrier, setShowAddCarrier] = useState(false)
  const [pendingCodes, setPendingCodes] = useState<Set<string>>(new Set())
  const [savingConfig, setSavingConfig] = useState(false)

  // Active carrier tab + data cache
  const [activeCarrier, setActiveCarrier] = useState<string | null>(null)
  const [carrierDataCache, setCarrierDataCache] = useState<Record<string, CarrierData>>({})
  const [loadingCarrier, setLoadingCarrier] = useState<string | null>(null)

  // ZIP search
  const [zipSearch, setZipSearch] = useState('')

  // Import dialog
  const [showImport, setShowImport] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selectedImportCarriers, setSelectedImportCarriers] = useState<string[]>([])

  // Configured carrier codes (active)
  const configuredCodes = config.map((c) => c.carrier_code)

  // ─── Load vendor carrier config ─────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/d-config`)
      const data = await res.json()
      if (Array.isArray(data)) {
        setConfig(data)
        // Auto-select first carrier tab if none selected
        if (data.length > 0 && !activeCarrier) {
          setActiveCarrier(data[0].carrier_code)
        }
      }
    } catch (err) {
      console.error('Load D config error:', err)
    } finally {
      setLoading(false)
    }
  }, [vendor.id, activeCarrier])

  useEffect(() => { loadConfig() }, [loadConfig])

  // ─── Load carrier rate data ─────────────────────────────────────────────────

  const fetchCarrierData = useCallback(async (carrier: string, force = false) => {
    if (!force && carrierDataCache[carrier]) return
    setLoadingCarrier(carrier)
    try {
      const res = await fetch(
        `/api/data/last-mile?carrier=${carrier}&vendor_id=${vendor.id}`
      )
      const json = await res.json()
      if (res.ok && json.rate_count != null) {
        setCarrierDataCache((prev) => ({
          ...prev,
          [carrier]: {
            rate_count: json.rate_count ?? 0,
            rate_sample: json.rate_sample ?? [],
            zip_zone_count: json.zip_zone_count ?? 0,
            zip_zone_sample: json.zip_zone_sample ?? [],
            last_imported_at: json.last_imported_at ?? null,
          },
        }))
      } else if (res.ok) {
        // API returned ok but unexpected shape (e.g. summary endpoint) — treat as empty
        setCarrierDataCache((prev) => ({
          ...prev,
          [carrier]: {
            rate_count: 0, rate_sample: [], zip_zone_count: 0,
            zip_zone_sample: [], last_imported_at: null,
          },
        }))
      } else {
        toast.error(`${t.common.loadFailed} ${carrier}：${json.error ?? t.common.error}`)
      }
    } catch {
      toast.error(`${t.common.loadFailed} ${carrier}`)
    } finally {
      setLoadingCarrier(null)
    }
  }, [carrierDataCache, vendor.id])

  // Auto-fetch when tab changes
  useEffect(() => {
    if (activeCarrier && configuredCodes.includes(activeCarrier)) {
      fetchCarrierData(activeCarrier)
    }
  }, [activeCarrier, configuredCodes, fetchCarrierData])

  // ─── Add / Remove carriers ──────────────────────────────────────────────────

  function openAddCarrierDialog() {
    setPendingCodes(new Set(configuredCodes))
    setShowAddCarrier(true)
  }

  function togglePendingCode(code: string) {
    setPendingCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  async function saveCarrierConfig() {
    setSavingConfig(true)
    try {
      const codes = [...pendingCodes]
      const res = await fetch(`/api/vendors/${vendor.id}/d-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier_codes: codes }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${t.vendorPanels.dRate.carrierConfig} ${t.common.success}`)
      setShowAddCarrier(false)

      // Reload config
      const configRes = await fetch(`/api/vendors/${vendor.id}/d-config`)
      const configData = await configRes.json()
      if (Array.isArray(configData)) {
        setConfig(configData)
        // If active carrier was removed, switch to first available
        const newCodes = configData.map((c: VendorDConfig) => c.carrier_code)
        if (activeCarrier && !newCodes.includes(activeCarrier)) {
          setActiveCarrier(newCodes[0] ?? null)
        } else if (!activeCarrier && newCodes.length > 0) {
          setActiveCarrier(newCodes[0])
        }
      }
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSavingConfig(false)
    }
  }

  async function removeCarrier(code: string) {
    const remaining = configuredCodes.filter((c) => c !== code)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/d-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier_codes: remaining }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${t.common.delete} ${code} ${t.common.success}`)

      setConfig((prev) => prev.filter((c) => c.carrier_code !== code))
      // Remove cached data
      setCarrierDataCache((prev) => {
        const next = { ...prev }
        delete next[code]
        return next
      })
      // Switch tab if needed
      if (activeCarrier === code) {
        setActiveCarrier(remaining[0] ?? null)
      }
    } catch (err) {
      toast.error(`${t.common.operationFailed}：${err instanceof Error ? err.message : t.common.error}`)
    }
  }

  // ─── Template download ──────────────────────────────────────────────────────

  function handleDownloadTemplate() {
    if (!activeCarrier) return
    try {
      const buffer = generateLastMileRateTemplate(activeCarrier)
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `last_mile_template_${activeCarrier}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(t.common.operationFailed)
    }
  }

  // ─── Import dialog ──────────────────────────────────────────────────────────

  function openImportDialog() {
    setPreview(null)
    setSelectedImportCarriers([])
    setParsing(false)
    setImporting(false)
    setShowImport(true)
  }

  function closeImportDialog() {
    setShowImport(false)
    setPreview(null)
    setSelectedImportCarriers([])
  }

  async function handleFileSelected(file: File) {
    setPreview(null)
    setParsing(true)
    try {
      const buffer = await file.arrayBuffer()
      const parsed = parseLastMileExcel(buffer)

      const carriers: string[] = []
      const ratesByCarrier: Record<string, number> = {}
      const zipZonesByCarrier: Record<string, number> = {}

      for (const r of parsed.rates) {
        if (!carriers.includes(r.carrier)) carriers.push(r.carrier)
        ratesByCarrier[r.carrier] = r.count
      }
      for (const z of parsed.zipZones) {
        if (!carriers.includes(z.carrier)) carriers.push(z.carrier)
        zipZonesByCarrier[z.carrier] = z.count
      }

      if (carriers.length === 0) {
        toast.error(t.common.importFailed)
        return
      }

      // Only show carriers that are configured for this vendor
      const relevantCarriers = carriers.filter((c) => configuredCodes.includes(c))
      if (relevantCarriers.length === 0) {
        toast.error(
          `Excel 中的承運商 (${carriers.join(', ')}) 均未在此供應商配置中，請先新增承運商`
        )
        return
      }

      setPreview({
        carriers: relevantCarriers,
        ratesByCarrier,
        zipZonesByCarrier,
        sheets: parsed.sheets,
        file,
      })
      setSelectedImportCarriers([...relevantCarriers])
    } catch {
      toast.error('解析失敗，請確認 Excel 格式')
    } finally {
      setParsing(false)
    }
  }

  async function handleConfirmImport() {
    if (!preview || selectedImportCarriers.length === 0) return
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', preview.file)
      formData.append('carriers', selectedImportCarriers.join(','))
      formData.append('vendor_id', vendor.id)

      const res = await fetch('/api/data/last-mile', { method: 'POST', body: formData })
      const json = await res.json()

      if (res.ok) {
        const total = (json.results ?? []).reduce(
          (sum: number, r: { rates_imported: number }) => sum + r.rates_imported,
          0
        )
        toast.success(`匯入成功：${total} 筆費率`)

        // Invalidate cached data for imported carriers
        setCarrierDataCache((prev) => {
          const next = { ...prev }
          for (const c of selectedImportCarriers) {
            delete next[c]
          }
          return next
        })

        // Refresh active tab data
        if (activeCarrier) {
          fetchCarrierData(activeCarrier, true)
        }
        closeImportDialog()
      } else {
        toast.error(`${t.common.importFailed}：${json.error ?? t.common.error}`)
      }
    } catch {
      toast.error(t.common.importFailed)
    } finally {
      setImporting(false)
    }
  }

  // ─── Carrier tab content ────────────────────────────────────────────────────

  function renderCarrierContent(carrier: string) {
    const data = carrierDataCache[carrier]
    const isLoading = loadingCarrier === carrier

    if (isLoading) {
      return <p className="text-sm text-muted-foreground py-4">{t.common.loading}</p>
    }

    if (!data) {
      return (
        <div className="py-4">
          <Button variant="outline" size="sm" onClick={() => fetchCarrierData(carrier, true)}>
            載入 {carrier} 數據
          </Button>
        </div>
      )
    }

    // Build zone x weight matrix from rate_sample
    const zones = [...new Set(data.rate_sample.map((r) => r.zone))].sort((a, b) => a - b)
    const weights = [...new Set(data.rate_sample.map((r) => r.weight_oz_max))].sort(
      (a, b) => a - b
    )
    const rateMap = new Map<string, number>()
    for (const r of data.rate_sample) {
      rateMap.set(`${r.weight_oz_max}-${r.zone}`, r.price_usd)
    }

    // ZIP search
    const filteredZip = zipSearch.trim()
      ? data.zip_zone_sample.filter((z) => z.zip_prefix.startsWith(zipSearch.trim()))
      : data.zip_zone_sample

    return (
      <div className="space-y-4">
        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">費率筆數</p>
              <p className="text-2xl font-bold">{data.rate_count.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">ZIP 分區筆數</p>
              <p className="text-2xl font-bold">{data.zip_zone_count.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">最後匯入</p>
              <p className="text-sm font-semibold">
                {data.last_imported_at
                  ? new Date(data.last_imported_at).toLocaleString('zh-HK')
                  : '尚未匯入'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{t.settings.carriers.title}</p>
              <p className="text-2xl font-bold">{carrier}</p>
            </CardContent>
          </Card>
        </div>

        {/* Rate table preview */}
        {data.rate_sample.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  費率預覽（Zone x 重量，前 50 筆）
                </CardTitle>
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                  {t.pages.shipments.exportTemplate}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">重量上限(oz)</TableHead>
                      {zones.map((z) => (
                        <TableHead key={z} className="text-center whitespace-nowrap">
                          Zone {z}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weights.map((w) => (
                      <TableRow key={w}>
                        <TableCell className="font-mono text-sm">{w}</TableCell>
                        {zones.map((z) => {
                          const price = rateMap.get(`${w}-${z}`)
                          return (
                            <TableCell key={z} className="text-center font-mono text-sm">
                              {price != null ? `$${price.toFixed(2)}` : '—'}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ZIP-zone search */}
        {data.zip_zone_sample.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">ZIP 分區查詢</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <label
                  htmlFor={`zip-search-${carrier}`}
                  className="text-sm whitespace-nowrap"
                >
                  ZIP 碼前綴
                </label>
                <Input
                  id={`zip-search-${carrier}`}
                  type="text"
                  placeholder="如：900"
                  value={zipSearch}
                  onChange={(e) => setZipSearch(e.target.value)}
                  className="w-40"
                />
                {zipSearch && (
                  <span className="text-xs text-muted-foreground">
                    找到 {filteredZip.length} 筆
                  </span>
                )}
              </div>
              {filteredZip.length > 0 && (
                <div className="overflow-x-auto rounded-md border max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ZIP 前綴</TableHead>
                        <TableHead>Gateway</TableHead>
                        <TableHead className="text-center">Zone</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredZip.map((z, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">
                            {z.zip_prefix}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono text-xs">
                              {z.gateway}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm">{z.zone}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {!zipSearch && (
                <p className="text-xs text-muted-foreground">
                  輸入 ZIP 前綴以搜尋分區（顯示樣本前 10 筆）
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {data.rate_count === 0 && data.zip_zone_count === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              尚無 {carrier} 費率數據，請點擊上方「匯入費率」按鈕匯入。
            </p>
          </div>
        )}
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">
                {vendor.name} — D段尾程費率
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {configuredCodes.length} 個承運商
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {configuredCodes.length > 0 && (
                <Button size="sm" variant="outline" onClick={openImportDialog}>
                  匯入費率
                </Button>
              )}
              <Button size="sm" onClick={openAddCarrierDialog}>
                管理承運商
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {configuredCodes.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                尚未配置承運商，請先新增此供應商支援的承運商。
              </p>
              <Button size="sm" variant="outline" onClick={openAddCarrierDialog}>
                {t.settings.carriers.addCarrier}
              </Button>
            </div>
          ) : (
            <Tabs
              value={activeCarrier ?? configuredCodes[0]}
              onValueChange={(v) => {
                setActiveCarrier(v)
                setZipSearch('')
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <TabsList>
                  {configuredCodes.map((code) => (
                    <TabsTrigger key={code} value={code}>
                      {code}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {activeCarrier && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(`確定要移除 ${activeCarrier} 嗎？（不會刪除費率數據）`)) {
                        removeCarrier(activeCarrier)
                      }
                    }}
                  >
                    移除此承運商
                  </Button>
                )}
              </div>
              {configuredCodes.map((code) => (
                <TabsContent key={code} value={code} className="mt-2">
                  {renderCarrierContent(code)}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* ─── Add/Manage Carrier Dialog ──────────────────────────────────────── */}
      <Dialog open={showAddCarrier} onOpenChange={(open) => !open && setShowAddCarrier(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>管理承運商 — {vendor.name}</DialogTitle>
            <DialogDescription>
              選擇此供應商提供的承運商服務。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {allCarriers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                未找到可用承運商，請先在設定中新增承運商。
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {allCarriers.map((carrier: Carrier) => (
                  <label
                    key={carrier.id}
                    className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/30"
                  >
                    <Checkbox
                      checked={pendingCodes.has(carrier.code)}
                      onCheckedChange={() => togglePendingCode(carrier.code)}
                    />
                    <span className="text-sm font-medium">{carrier.code}</span>
                    {carrier.name && carrier.name !== carrier.code && (
                      <span className="text-xs text-muted-foreground">{carrier.name}</span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddCarrier(false)}
              disabled={savingConfig}
            >
              {t.common.cancel}
            </Button>
            <Button onClick={saveCarrierConfig} disabled={savingConfig}>
              {savingConfig ? t.common.saving : `${t.common.save}${t.vendorPanels.dRate.carrierConfig}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Import Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={showImport} onOpenChange={(open) => !open && closeImportDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>匯入尾程費率 — {vendor.name}</DialogTitle>
            <DialogDescription>
              上傳含有承運商費率的 Excel 檔案，系統將解析並預覽。僅匯入此供應商已配置的承運商數據。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <ExcelDropZone
              onFile={handleFileSelected}
              label="拖放費率 Excel 至此，或點擊選擇"
              sublabel="支援 .xlsx 格式"
            />

            {parsing && (
              <p className="text-sm text-muted-foreground text-center">{t.pages.shipments.parsing}</p>
            )}

            {preview && (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                  <p className="font-medium">解析預覽</p>
                  <p className="text-muted-foreground text-xs">
                    工作表：{preview.sheets.join('、')}
                  </p>
                  <div className="space-y-1">
                    {preview.carriers.map((c) => (
                      <div key={c} className="flex items-center justify-between text-xs">
                        <span className="font-mono">{c}</span>
                        <span className="text-muted-foreground">
                          費率 {preview.ratesByCarrier[c] ?? 0} 筆 ·{' '}
                          ZIP 分區 {preview.zipZonesByCarrier[c] ?? 0} 筆
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">選擇要匯入的承運商</p>
                  <div className="flex flex-wrap gap-3">
                    {preview.carriers.map((c) => (
                      <label
                        key={c}
                        htmlFor={`import-carrier-${c}`}
                        className="flex items-center gap-2 cursor-pointer text-sm"
                      >
                        <Checkbox
                          id={`import-carrier-${c}`}
                          checked={selectedImportCarriers.includes(c)}
                          onCheckedChange={(checked) => {
                            setSelectedImportCarriers((prev) =>
                              checked ? [...prev, c] : prev.filter((x) => x !== c)
                            )
                          }}
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeImportDialog} disabled={importing}>
              {t.common.cancel}
            </Button>
            {preview && (
              <Button
                onClick={handleConfirmImport}
                disabled={importing || selectedImportCarriers.length === 0}
              >
                {importing
                  ? t.common.importing
                  : `${t.pages.shipments.confirmImport} ${selectedImportCarriers.length} 個承運商`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
