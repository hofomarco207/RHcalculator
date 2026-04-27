'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { parseLastMileExcel } from '@/lib/excel/last-mile-parser'
import { generateLastMileRateTemplate } from '@/lib/excel/template-generator'
import { ExcelDropZone } from '@/components/data/ExcelDropZone'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import type { CarrierName, LastMileRate, ZipZoneMapping } from '@/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CarrierData {
  rate_count: number
  rate_sample: LastMileRate[]
  zip_zone_count: number
  zip_zone_sample: ZipZoneMapping[]
  last_imported_at: string | null
}

interface ImportPreview {
  carriers: CarrierName[]
  ratesByCarrier: Record<string, number>
  zipZonesByCarrier: Record<string, number>
  sheets: string[]
  file: File
}

const CARRIER_LABELS: Record<CarrierName, string> = {
  GOFO: 'GOFO',
  USPS: 'USPS',
  UNI: 'UniUni',
  OSM: 'OSM',
}

const ALL_CARRIERS: CarrierName[] = ['GOFO', 'USPS', 'UNI', 'OSM']

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function LastMilePage() {
  const router = useRouter()
  const [isDirty, setIsDirty] = useState(false)

  const [activeCarrier, setActiveCarrier] = useState<CarrierName>('GOFO')
  const [carrierData, setCarrierData] = useState<Partial<Record<CarrierName, CarrierData>>>({})
  const [loadingCarrier, setLoadingCarrier] = useState<CarrierName | null>(null)
  const [zipSearch, setZipSearch] = useState('')

  // Import dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selectedCarriers, setSelectedCarriers] = useState<CarrierName[]>([])

  // ─── Fetch carrier data ─────────────────────────────────────────────────────
  const fetchCarrierData = useCallback(async (carrier: CarrierName) => {
    if (carrierData[carrier]) return
    setLoadingCarrier(carrier)
    try {
      const res = await fetch(`/api/data/last-mile?carrier=${carrier}`)
      const json = await res.json()
      if (res.ok) {
        setCarrierData(prev => ({
          ...prev,
          [carrier]: {
            rate_count: json.rate_count,
            rate_sample: json.rate_sample ?? [],
            zip_zone_count: json.zip_zone_count,
            zip_zone_sample: json.zip_zone_sample ?? [],
            last_imported_at: json.last_imported_at ?? null,
          },
        }))
      } else {
        toast.error(`載入 ${carrier} 數據失敗：${json.error ?? '未知錯誤'}`)
      }
    } catch {
      toast.error(`載入 ${carrier} 數據失敗`)
    } finally {
      setLoadingCarrier(null)
    }
  }, [carrierData])

  // Fetch on tab change
  function handleTabChange(value: CarrierName) {
    setActiveCarrier(value)
    setZipSearch('')
    fetchCarrierData(value)
  }

  // ─── Template download ──────────────────────────────────────────────────────
  function handleDownloadTemplate() {
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
      toast.error('模板下載失敗')
    }
  }

  // ─── Import dialog: open ────────────────────────────────────────────────────
  function handleOpenImportDialog() {
    setPreview(null)
    setSelectedCarriers([])
    setDialogOpen(true)
  }

  function handleCloseDialog() {
    setDialogOpen(false)
    setPreview(null)
    setSelectedCarriers([])
    setIsDirty(false)
  }

  // ─── Import dialog: file parse (client-side preview only) ──────────────────
  async function handleFileSelected(file: File) {
    setPreview(null)
    setParsing(true)
    try {
      const buffer = await file.arrayBuffer()
      const parsed = parseLastMileExcel(buffer)

      const carriers: CarrierName[] = []
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
        toast.error('未能解析任何有效數據，請確認 Excel 格式')
        return
      }

      setPreview({ carriers, ratesByCarrier, zipZonesByCarrier, sheets: parsed.sheets, file })
      setSelectedCarriers([...carriers])
      setIsDirty(true)
    } catch {
      toast.error('解析失敗，請確認 Excel 格式')
    } finally {
      setParsing(false)
    }
  }

  // ─── Import dialog: confirm import ─────────────────────────────────────────
  async function handleConfirmImport() {
    if (!preview || selectedCarriers.length === 0) return
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', preview.file)
      formData.append('carriers', selectedCarriers.join(','))

      const res = await fetch('/api/data/last-mile', { method: 'POST', body: formData })
      const json = await res.json()

      if (res.ok) {
        const total = (json.results ?? []).reduce(
          (sum: number, r: { rates_imported: number }) => sum + r.rates_imported,
          0
        )
        toast.success(`匯入成功：${total} 筆費率`)
        setIsDirty(false)

        // Invalidate cached data for imported carriers
        setCarrierData(prev => {
          const next = { ...prev }
          for (const c of selectedCarriers) {
            delete next[c]
          }
          return next
        })

        // Refresh active tab data
        fetchCarrierData(activeCarrier)
        handleCloseDialog()
      } else {
        toast.error(`匯入失敗：${json.error ?? '未知錯誤'}`)
      }
    } catch {
      toast.error('匯入失敗')
    } finally {
      setImporting(false)
    }
  }

  // ─── Carrier tab content ────────────────────────────────────────────────────
  function renderCarrierContent(carrier: CarrierName) {
    const data = carrierData[carrier]
    const isLoading = loadingCarrier === carrier

    if (isLoading) {
      return <p className="text-sm text-muted-foreground py-4">載入中...</p>
    }

    if (!data) {
      return (
        <div className="py-4">
          <Button variant="outline" size="sm" onClick={() => fetchCarrierData(carrier)}>
            載入 {CARRIER_LABELS[carrier]} 數據
          </Button>
        </div>
      )
    }

    // Build zone × weight matrix from rate_sample
    const zones = [...new Set(data.rate_sample.map(r => r.zone))].sort((a, b) => a - b)
    const weights = [...new Set(data.rate_sample.map(r => r.weight_oz_max))].sort((a, b) => a - b)
    const rateMap = new Map<string, number>()
    for (const r of data.rate_sample) {
      rateMap.set(`${r.weight_oz_max}-${r.zone}`, r.price_usd)
    }

    // ZIP search
    const filteredZip = zipSearch.trim()
      ? data.zip_zone_sample.filter(z =>
          z.zip_prefix.startsWith(zipSearch.trim())
        )
      : data.zip_zone_sample

    return (
      <div className="space-y-4">
        {/* Status cards */}
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
        </div>

        {/* Rate table preview */}
        {data.rate_sample.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">費率預覽（Zone × 重量，前 50 筆）</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>重量上限(oz)</TableHead>
                      {zones.map(z => (
                        <TableHead key={z} className="text-center">Zone {z}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weights.map(w => (
                      <TableRow key={w}>
                        <TableCell className="font-mono text-sm">{w}</TableCell>
                        {zones.map(z => {
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
                <label htmlFor="zip-search-input" className="text-sm whitespace-nowrap">
                  ZIP 碼前綴
                </label>
                <Input
                  id="zip-search-input"
                  type="text"
                  placeholder="如：900"
                  value={zipSearch}
                  onChange={e => setZipSearch(e.target.value)}
                  className="w-40"
                />
                {zipSearch && (
                  <span className="text-xs text-muted-foreground">
                    找到 {filteredZip.length} 筆
                  </span>
                )}
              </div>
              {filteredZip.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
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
                          <TableCell className="font-mono text-sm">{z.zip_prefix}</TableCell>
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
          <p className="text-sm text-muted-foreground">
            尚無 {CARRIER_LABELS[carrier]} 數據，請先匯入費率。
          </p>
        )}
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => {
            if (isDirty && !window.confirm('有未儲存的變更，確定要離開？')) return
            router.push('/cost')
          }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回成本參數
        </button>
        {isDirty && <span className="text-xs text-amber-600">• 有未儲存的變更</span>}
      </div>

      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">📦 D段 尾程費率管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理各承運商尾程費率及 ZIP 分區映射
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            匯出模板
          </Button>
          <Button size="sm" onClick={handleOpenImportDialog}>
            匯入費率
          </Button>
        </div>
      </div>

      {/* Carrier Tabs */}
      <Tabs
        value={activeCarrier}
        onValueChange={(v) => handleTabChange(v as CarrierName)}
      >
        <TabsList>
          {ALL_CARRIERS.map(c => (
            <TabsTrigger key={c} value={c}>
              {CARRIER_LABELS[c]}
            </TabsTrigger>
          ))}
        </TabsList>
        {ALL_CARRIERS.map(c => (
          <TabsContent key={c} value={c} className="mt-4">
            {renderCarrierContent(c)}
          </TabsContent>
        ))}
      </Tabs>

      {/* Import Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>匯入尾程費率</DialogTitle>
            <DialogDescription>
              請上傳含有各承運商費率的 Excel 檔案。系統將解析並預覽，確認後才寫入資料庫。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <ExcelDropZone
              onFile={handleFileSelected}
              label="拖放費率 Excel 至此，或點擊選擇"
              sublabel="支援 .xlsx 格式"
            />

            {parsing && (
              <p className="text-sm text-muted-foreground text-center">解析中...</p>
            )}

            {preview && (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                  <p className="font-medium">解析預覽</p>
                  <p className="text-muted-foreground text-xs">工作表：{preview.sheets.join('、')}</p>
                  <div className="space-y-1">
                    {preview.carriers.map(c => (
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
                    {preview.carriers.map(c => (
                      <label
                        key={c}
                        htmlFor={`carrier-check-${c}`}
                        className="flex items-center gap-2 cursor-pointer text-sm"
                      >
                        <Checkbox
                          id={`carrier-check-${c}`}
                          checked={selectedCarriers.includes(c)}
                          onCheckedChange={(checked) => {
                            setSelectedCarriers(prev =>
                              checked
                                ? [...prev, c]
                                : prev.filter(x => x !== c)
                            )
                          }}
                        />
                        {CARRIER_LABELS[c]}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCloseDialog}>
              取消
            </Button>
            {preview && (
              <Button
                onClick={handleConfirmImport}
                disabled={importing || selectedCarriers.length === 0}
              >
                {importing
                  ? '匯入中...'
                  : `確認匯入 ${selectedCarriers.length} 個承運商`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
