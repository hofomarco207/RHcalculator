'use client'

import { useEffect, useState, useCallback } from 'react'
import { useT } from '@/lib/i18n'
import { toast } from 'sonner'
import { read, utils } from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { generateShipmentTemplate } from '@/lib/excel/template-generator'
import { ExcelDropZone } from '@/components/data/ExcelDropZone'
import { FieldMapper } from '@/components/data/FieldMapper'
import { WeightBreakPanel } from '@/components/data/WeightBreakPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import type { GatewayCode, ComputedDistributions } from '@/types'
import { GATEWAYS } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportBatchRow {
  id: string
  filename: string
  record_count: number
  date_start: string | null
  date_end: string | null
  status: string | null
  created_at: string
}

// ─── System fields for FieldMapper ────────────────────────────────────────────

const SYSTEM_FIELDS = [
  { key: 'gateway',       label: '口岸 (Gateway)',      required: true  },
  { key: 'zip_code',      label: '郵遞區號 (Zip Code)',  required: true  },
  { key: 'weight_kg',     label: '重量 kg',              required: true  },
  { key: 'carrier',       label: '承運商 (Carrier)',     required: false },
  { key: 'shipment_date', label: '出貨日期',              required: false },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShipmentsPage() {
  const t = useT()

  // ── Batch list state ──────────────────────────────────────────────────────
  const [batches, setBatches] = useState<ImportBatchRow[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set())

  // ── Import dialog state ───────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false)
  // Phase 1: file selected + columns extracted
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [excelColumns, setExcelColumns] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)

  // ── Compute state ─────────────────────────────────────────────────────────
  const [computing, setComputing] = useState(false)
  const [distributions, setDistributions] = useState<ComputedDistributions | null>(null)

  // ── Apply state ───────────────────────────────────────────────────────────
  const [applyingPorts, setApplyingPorts] = useState(false)
  const [applyingZones, setApplyingZones] = useState(false)

  // ─── Load batches ──────────────────────────────────────────────────────────
  const loadBatches = useCallback(async () => {
    setLoadingBatches(true)
    try {
      const res = await fetch('/api/data/shipments')
      const json = await res.json()
      if (res.ok) {
        setBatches(json.batches ?? [])
      } else {
        toast.error(`載入批次失敗：${json.error ?? '未知錯誤'}`)
      }
    } catch {
      toast.error('載入批次失敗')
    } finally {
      setLoadingBatches(false)
    }
  }, [])

  useEffect(() => {
    loadBatches()
  }, [loadBatches])

  // ─── Template download ─────────────────────────────────────────────────────
  function handleDownloadTemplate() {
    try {
      const buffer = generateShipmentTemplate()
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'shipment_template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('模板下載失敗')
    }
  }

  // ─── Import: phase 1 — parse headers client-side ──────────────────────────
  async function handleFileSelected(file: File) {
    setSelectedFile(file)
    setExcelColumns([])
    setPreviewRows([])
    setMapping({})
    setParsing(true)
    try {
      const buffer = await file.arrayBuffer()
      const wb = read(buffer, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = utils.sheet_to_json<Record<string, unknown>>(sheet)
      if (rows.length === 0) {
        toast.error('Excel 檔案無資料')
        return
      }
      const cols = Object.keys(rows[0])
      setExcelColumns(cols)
      setPreviewRows(rows.slice(0, 5))

      // Auto-detect mapping by matching common column names
      const autoMap: Record<string, string> = {}
      for (const field of SYSTEM_FIELDS) {
        const match = cols.find((c) =>
          c.toLowerCase() === field.key.toLowerCase() ||
          c.toLowerCase().replace(/[_\s]/g, '') === field.key.toLowerCase().replace(/[_\s]/g, '')
        )
        if (match) autoMap[field.key] = match
      }
      setMapping(autoMap)
    } catch {
      toast.error('解析失敗，請確認 Excel 格式')
    } finally {
      setParsing(false)
    }
  }

  // ─── Import: phase 2 — confirm & POST ────────────────────────────────────
  async function handleConfirmImport() {
    if (!selectedFile) return

    // Validate required fields are mapped
    const requiredMissing = SYSTEM_FIELDS
      .filter((f) => f.required && (!mapping[f.key] || mapping[f.key] === '_none'))
      .map((f) => f.label)

    if (requiredMissing.length > 0) {
      toast.error(`請先對應必填欄位：${requiredMissing.join('、')}`)
      return
    }

    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('mapping', JSON.stringify(mapping))

      const res = await fetch('/api/data/shipments', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()

      if (res.ok) {
        toast.success(`匯入成功：${json.record_count} 筆記錄`)
        await loadBatches()
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

  function handleCloseDialog() {
    setDialogOpen(false)
    setSelectedFile(null)
    setExcelColumns([])
    setPreviewRows([])
    setMapping({})
  }

  // ─── Batch selection ────────────────────────────────────────────────────────
  function toggleBatch(id: string) {
    setSelectedBatchIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Delete batch ───────────────────────────────────────────────────────────
  async function handleDeleteBatch(batchId: string) {
    try {
      const res = await fetch(`/api/data/shipments?batch_id=${batchId}`, { method: 'DELETE' })
      const json = await res.json()
      if (res.ok) {
        toast.success('批次已刪除')
        setSelectedBatchIds((prev) => {
          const next = new Set(prev)
          next.delete(batchId)
          return next
        })
        await loadBatches()
      } else {
        toast.error(`刪除失敗：${json.error ?? '未知錯誤'}`)
      }
    } catch {
      toast.error('刪除失敗')
    }
  }

  // ─── Compute distributions ──────────────────────────────────────────────────
  async function handleCompute() {
    if (selectedBatchIds.size === 0) {
      toast.error('請先勾選至少一個批次')
      return
    }
    setComputing(true)
    setDistributions(null)
    try {
      const res = await fetch('/api/data/shipments/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_ids: [...selectedBatchIds] }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(`計算完成：${json.record_count} 筆記錄`)
        setDistributions(json.distributions)
      } else {
        toast.error(`計算失敗：${json.error ?? '未知錯誤'}`)
      }
    } catch {
      toast.error('計算失敗')
    } finally {
      setComputing(false)
    }
  }

  // ─── Apply port proportions to B段 ──────────────────────────────────────────
  async function handleApplyPorts() {
    if (!distributions?.port_proportions) return
    setApplyingPorts(true)
    const supabase = createClient()
    try {
      // Get current air freight setting
      const { data: currentSetting } = await supabase
        .from('air_freight_settings')
        .select('id')
        .eq('is_current', true)
        .limit(1)
        .single()

      if (!currentSetting) {
        toast.error('找不到當前 B段設定，請先建立空運成本設定')
        return
      }

      // Update proportions for each gateway
      for (const gw of GATEWAYS) {
        const proportion = distributions.port_proportions[gw] ?? 0
        await supabase
          .from('air_freight_ports')
          .update({ proportion })
          .eq('setting_id', currentSetting.id)
          .eq('port_code', gw)
      }

      toast.success('口岸佔比已套用到 B段')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '套用失敗'
      toast.error(`套用失敗：${msg}`)
    } finally {
      setApplyingPorts(false)
    }
  }

  // ─── Apply zone distribution to D段 ─────────────────────────────────────────
  async function handleApplyZones() {
    if (!distributions) return
    setApplyingZones(true)
    const supabase = createClient()
    try {
      const refBatchId = [...selectedBatchIds][0]
      await supabase
        .from('computed_distributions')
        .upsert(
          {
            batch_id: refBatchId,
            port_proportions: distributions.port_proportions,
            weight_distribution: distributions.weight_distribution,
            zone_distribution: distributions.zone_distribution,
          },
          { onConflict: 'batch_id' }
        )
      toast.success('Zone 分布已套用到 D段')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '套用失敗'
      toast.error(`套用失敗：${msg}`)
    } finally {
      setApplyingZones(false)
    }
  }

  // ─── Render helpers ────────────────────────────────────────────────────────
  const portProportions = distributions?.port_proportions ?? {}
  const weightDist = distributions?.weight_distribution ?? []

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* ── Page Header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>{t.pages.shipments.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t.pages.shipments.description}
          </p>
        </div>
      </div>

      <Tabs defaultValue="shipments">
        <TabsList>
          <TabsTrigger value="shipments">{t.pages.shipments.importRecords}</TabsTrigger>
          <TabsTrigger value="weight-break">{t.weightBreak.title}</TabsTrigger>
        </TabsList>

        <TabsContent value="weight-break">
          <WeightBreakPanel />
        </TabsContent>

        <TabsContent value="shipments">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div></div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            匯出模板
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            匯入出貨記錄
          </Button>

          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else setDialogOpen(true) }}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>匯入出貨記錄</DialogTitle>
                <DialogDescription>
                  上傳 Excel 檔案，然後對應欄位後確認匯入。
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Phase 1: Drop zone */}
                <ExcelDropZone
                  onFile={handleFileSelected}
                  label="拖放出貨 Excel 至此，或點擊選擇"
                  sublabel="支援 .xlsx 格式"
                />

                {parsing && (
                  <p className="text-sm text-muted-foreground text-center">解析中...</p>
                )}

                {/* Phase 2: Field mapping */}
                {excelColumns.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">欄位對應</p>
                    <FieldMapper
                      excelColumns={excelColumns}
                      systemFields={SYSTEM_FIELDS}
                      mapping={mapping}
                      onChange={setMapping}
                    />
                  </div>
                )}

                {/* Preview first 5 rows */}
                {previewRows.length > 0 && excelColumns.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">預覽（前 {previewRows.length} 筆）</p>
                    <div className="overflow-x-auto rounded-md border text-xs">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {SYSTEM_FIELDS.map((f) => (
                              <TableHead key={f.key} className="py-1 px-2 text-xs">
                                {f.label.split(' ')[0]}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewRows.map((row, idx) => (
                            <TableRow key={idx}>
                              {SYSTEM_FIELDS.map((f) => {
                                const col = mapping[f.key]
                                const val = col && col !== '_none' ? String(row[col] ?? '—') : '—'
                                return (
                                  <TableCell key={f.key} className="py-1 px-2 font-mono">
                                    {val}
                                  </TableCell>
                                )
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {selectedFile && !parsing && excelColumns.length === 0 && (
                  <p className="text-sm text-muted-foreground">已選擇：{selectedFile.name}</p>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={handleCloseDialog}
                >
                  取消
                </Button>
                {excelColumns.length > 0 && (
                  <Button
                    onClick={handleConfirmImport}
                    disabled={importing}
                  >
                    {importing ? '匯入中...' : '確認匯入'}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Batch List Table ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">匯入批次</CardTitle>
            <Button
              size="sm"
              disabled={selectedBatchIds.size === 0 || computing}
              onClick={handleCompute}
            >
              {computing ? '計算中...' : `計算分布（${selectedBatchIds.size} 批）`}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingBatches ? (
            <p className="text-sm text-muted-foreground">載入中...</p>
          ) : batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無批次，請先匯入出貨記錄。</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>檔案名稱</TableHead>
                    <TableHead className="text-right">筆數</TableHead>
                    <TableHead>日期範圍</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>匯入時間</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          id={`batch-${batch.id}`}
                          checked={selectedBatchIds.has(batch.id)}
                          onChange={() => toggleBatch(batch.id)}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </TableCell>
                      <TableCell>
                        <label htmlFor={`batch-${batch.id}`} className="text-sm cursor-pointer">
                          {batch.filename}
                        </label>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {batch.record_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {batch.date_start && batch.date_end
                          ? `${batch.date_start} ~ ${batch.date_end}`
                          : batch.date_start ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {batch.status ?? 'imported'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(batch.created_at).toLocaleString('zh-HK')}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteBatch(batch.id)}
                        >
                          刪除
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Computed Results Panel ── */}
      {distributions && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">計算結果</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleApplyPorts}
                  disabled={applyingPorts}
                >
                  {applyingPorts ? '套用中...' : '套用口岸佔比到 B段'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleApplyZones}
                  disabled={applyingZones}
                >
                  {applyingZones ? '套用中...' : '套用 Zone 分布到 D段'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Port proportions */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">口岸佔比</p>
              <div className="space-y-1.5">
                {GATEWAYS.map((gw) => {
                  const pct = (portProportions[gw as GatewayCode] ?? 0) * 100
                  return (
                    <div key={gw} className="flex items-center gap-3">
                      <span className="w-10 font-mono text-xs font-semibold">{gw}</span>
                      <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs font-mono">{pct.toFixed(1)}%</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Weight distribution */}
            {weightDist.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">重量分布</p>
                <div className="space-y-1.5">
                  {weightDist.map((b) => {
                    const pct = b.proportion * 100
                    return (
                      <div key={b.bracket} className="flex items-center gap-3">
                        <span className="w-28 font-mono text-xs">{b.bracket}</span>
                        <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-blue-500/60 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs font-mono">{pct.toFixed(1)}%</span>
                        <span className="w-16 text-right text-xs text-muted-foreground">
                          {b.ticket_count.toLocaleString()} 票
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Zone distribution summary */}
            {distributions.zone_distribution && Object.keys(distributions.zone_distribution).length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Zone 分布</p>
                <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                  {Object.entries(distributions.zone_distribution).map(([carrier, gwMap]) => (
                    <div key={carrier}>
                      <span className="font-semibold">{carrier}：</span>
                      {gwMap && Object.entries(gwMap).map(([gw, zones]) => (
                        <span key={gw} className="ml-2 text-muted-foreground">
                          {gw}[
                          {zones && Object.entries(zones)
                            .sort(([a], [b]) => Number(a) - Number(b))
                            .map(([zone, proportion]) => `Z${zone}:${(Number(proportion) * 100).toFixed(0)}%`)
                            .join(' ')}
                          ]
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
