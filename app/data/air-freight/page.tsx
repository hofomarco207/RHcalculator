'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { generateAirFreightTemplate } from '@/lib/excel/template-generator'
import type {
  AirFreightHistoryRecord,
  AirFreightImportConfig,
  AirFreightSuggestion,
  ComputeStrategy,
  GatewayCode,
} from '@/types'
import { GATEWAYS } from '@/types'
import { parseAirFreightExcel } from '@/lib/excel/air-freight-parser'
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
  Select,
  SelectContent,
  SelectItem,
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportPreview {
  recordCount: number
  weeks: string[]
  ports: string[]
  cargoTypes: string[]
}

// ─── Strategy options ─────────────────────────────────────────────────────────

const STRATEGY_OPTIONS: { value: ComputeStrategy; label: string }[] = [
  { value: 'latest', label: '最新一週' },
  { value: 'avg4w', label: '近4週平均' },
  { value: 'avg8w', label: '近8週平均' },
  { value: 'custom', label: '自定週期' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AirFreightPage() {
  const router = useRouter()
  const [isDirty, setIsDirty] = useState(false)

  // ── Config state ──────────────────────────────────────────────────────────
  const [config, setConfig] = useState<AirFreightImportConfig>({
    default_cargo_type: '特惠带电',
    discount_hkd_per_kg: 1.2,
  })
  const [configId, setConfigId] = useState<string | undefined>(undefined)
  const [editDiscount, setEditDiscount] = useState<string>('1.2')
  const [editCargoType, setEditCargoType] = useState<string>('特惠带电')
  const [savingConfig, setSavingConfig] = useState(false)

  // ── Import dialog state ───────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)

  // ── Strategy / Suggestions state ──────────────────────────────────────────
  const [strategy, setStrategy] = useState<ComputeStrategy>('latest')
  const [customWeeks, setCustomWeeks] = useState<string[]>([])
  const [suggestions, setSuggestions] = useState<AirFreightSuggestion[]>([])
  const [computing, setComputing] = useState(false)
  const [applying, setApplying] = useState(false)

  // ── History state ─────────────────────────────────────────────────────────
  const [history, setHistory] = useState<AirFreightHistoryRecord[]>([])
  const [historyCargoFilter, setHistoryCargoFilter] = useState<string>('特惠带电')
  const [loadingHistory, setLoadingHistory] = useState(false)

  // ─── Load config on mount ──────────────────────────────────────────────────
  useEffect(() => {
    async function loadConfig() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('air_freight_import_config')
        .select('*')
        .limit(1)
        .single()

      if (!error && data) {
        setConfig(data)
        setConfigId(data.id)
        setEditDiscount(String(data.discount_hkd_per_kg))
        setEditCargoType(data.default_cargo_type)
      }
    }
    loadConfig()
  }, [])

  // ─── Load history ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async (cargoType: string) => {
    setLoadingHistory(true)
    try {
      const res = await fetch(
        `/api/data/air-freight?cargo_type=${encodeURIComponent(cargoType)}`
      )
      const json = await res.json()
      if (res.ok) {
        setHistory(json.records ?? [])
      } else {
        toast.error(`載入記錄失敗：${json.error ?? '未知錯誤'}`)
      }
    } catch {
      toast.error('載入記錄失敗')
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    loadHistory(historyCargoFilter)
  }, [historyCargoFilter, loadHistory])

  // ─── Trigger compute when strategy changes ─────────────────────────────────
  const runCompute = useCallback(
    async (s: ComputeStrategy, cargoType: string) => {
      setComputing(true)
      setSuggestions([])
      try {
        const res = await fetch('/api/data/air-freight/compute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            strategy: s,
            cargo_type: cargoType,
            ...(s === 'custom' && customWeeks.length > 0 ? { custom_weeks: customWeeks } : {}),
          }),
        })
        const json = await res.json()
        if (res.ok) {
          setSuggestions(json.suggestions ?? [])
        } else {
          toast.error(`計算失敗：${json.error ?? '未知錯誤'}`)
        }
      } catch {
        toast.error('計算失敗')
      } finally {
        setComputing(false)
      }
    },
    [customWeeks]
  )

  useEffect(() => {
    if (strategy === 'custom' && customWeeks.length === 0) return
    runCompute(strategy, config.default_cargo_type)
  }, [strategy, config.default_cargo_type, customWeeks, runCompute])

  // ─── Template download ─────────────────────────────────────────────────────
  function handleDownloadTemplate() {
    try {
      const buffer = generateAirFreightTemplate()
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'air_freight_template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('模板下載失敗')
    }
  }

  // ─── Import dialog: file select (parse preview only, no DB write) ────────
  async function handleFileSelected(file: File) {
    setSelectedFile(file)
    setPreview(null)
    setParsing(true)
    try {
      const buffer = await file.arrayBuffer()
      const parsed = parseAirFreightExcel(buffer)
      if (parsed.records.length === 0) {
        toast.error('未能解析任何有效記錄，請確認格式')
        return
      }
      setPreview({
        recordCount: parsed.records.length,
        weeks: parsed.weeks,
        ports: parsed.ports,
        cargoTypes: parsed.cargoTypes,
      })
    } catch {
      toast.error('解析失敗，請確認 Excel 格式')
    } finally {
      setParsing(false)
    }
  }

  // ─── Import dialog: confirm import (write to DB) ──────────────────────────
  async function handleConfirmImport() {
    if (!selectedFile) return
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('discount', editDiscount)

      const res = await fetch('/api/data/air-freight', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()

      if (res.ok) {
        toast.success(`匯入成功：${json.record_count} 筆記錄`)
        setIsDirty(false)
        await loadHistory(historyCargoFilter)
        await runCompute(strategy, config.default_cargo_type)
        setDialogOpen(false)
        setSelectedFile(null)
        setPreview(null)
      } else {
        toast.error(`匯入失敗：${json.error ?? '未知錯誤'}`)
      }
    } catch {
      toast.error('匯入失敗')
    } finally {
      setImporting(false)
    }
  }

  // ─── Config save ───────────────────────────────────────────────────────────
  async function handleSaveConfig() {
    const discountVal = parseFloat(editDiscount)
    if (isNaN(discountVal)) {
      toast.error('扣減��格式不正確')
      return
    }
    setSavingConfig(true)
    const supabase = createClient()

    try {
      if (configId) {
        const { error } = await supabase
          .from('air_freight_import_config')
          .update({
            discount_hkd_per_kg: discountVal,
            default_cargo_type: editCargoType,
          })
          .eq('id', configId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('air_freight_import_config')
          .insert({
            discount_hkd_per_kg: discountVal,
            default_cargo_type: editCargoType,
          })
          .select()
          .single()
        if (error) throw error
        if (data) setConfigId(data.id)
      }

      setConfig((prev) => ({
        ...prev,
        discount_hkd_per_kg: discountVal,
        default_cargo_type: editCargoType,
      }))
      toast.success('匯入設定已儲存')
      setIsDirty(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '儲存失敗'
      toast.error(`儲存失敗：${msg}`)
    } finally {
      setSavingConfig(false)
    }
  }

  // ─── Apply suggestions ─────────────────────────────────────────────────────
  async function handleApplySuggestions() {
    if (suggestions.length === 0) return
    setApplying(true)
    const supabase = createClient()

    try {
      // Get existing ports proportions from current setting
      const { data: currentSetting } = await supabase
        .from('air_freight_settings')
        .select('id')
        .eq('is_current', true)
        .limit(1)
        .single()

      let existingProportions: Partial<Record<GatewayCode, number>> = {}

      if (currentSetting) {
        const { data: existingPorts } = await supabase
          .from('air_freight_ports')
          .select('port_code, proportion')
          .eq('setting_id', currentSetting.id)

        if (existingPorts) {
          for (const p of existingPorts) {
            existingProportions[p.port_code as GatewayCode] = p.proportion
          }
        }
      }

      // 1. Insert new air_freight_settings
      const { data: newSetting, error: insertErr } = await supabase
        .from('air_freight_settings')
        .insert({
          bubble_rate: 1.1,
          is_current: true,
        })
        .select()
        .single()

      if (insertErr || !newSetting) throw insertErr ?? new Error('無法建立設定記錄')

      // 2. Insert port records with suggested prices + existing proportions
      const portInserts = GATEWAYS.map((gw) => {
        const suggestion = suggestions.find((s) => s.port_code === gw)
        return {
          setting_id: newSetting.id,
          port_code: gw,
          price_hkd_per_kg: suggestion?.net_price ?? 0,
          proportion: existingProportions[gw] ?? 0,
        }
      })

      const { error: portsErr } = await supabase
        .from('air_freight_ports')
        .insert(portInserts)

      if (portsErr) throw portsErr

      // 3. Deactivate old settings
      const { error: updateErr } = await supabase
        .from('air_freight_settings')
        .update({ is_current: false })
        .eq('is_current', true)
        .neq('id', newSetting.id)

      if (updateErr) {
        console.warn('更新舊設定記錄時出錯:', updateErr)
      }

      toast.success('建議值已套用到成本參數')
      setIsDirty(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '套用失敗'
      toast.error(`套用失敗：${msg}`)
    } finally {
      setApplying(false)
    }
  }

  // ─── Derived values ─────────────────────────────────────────────────────────
  const validSuggestions = suggestions.filter(s => s.net_price > 0)
  const avgPrice = validSuggestions.length > 0
    ? validSuggestions.reduce((sum, s) => sum + s.net_price, 0) / validSuggestions.length
    : 0
  const compositeCost = avgPrice * 1.1

  const availableCargoTypes = [...new Set(history.map(r => r.cargo_type))]
  if (!availableCargoTypes.includes(historyCargoFilter)) {
    availableCargoTypes.unshift(historyCargoFilter)
  }

  // ─── Render ────────────────────────────────────────────────────────────────
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

      {/* ── Page Header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">✈️ B段 空運報價管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理空運原始報價數據、策略計算及成本參數套用
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            匯出模板
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            匯入報價
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>匯入空運報價</DialogTitle>
                <DialogDescription>
                  請上傳符合模板格式的 Excel 檔案，系統將自動解析並匯入記錄。
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <ExcelDropZone
                  onFile={handleFileSelected}
                  label="拖放空運報價 Excel 至此，或點擊選擇"
                  sublabel="支援 .xlsx 格式"
                />

                {parsing && (
                  <p className="text-sm text-muted-foreground text-center">
                    解析中...
                  </p>
                )}

                {preview && (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-sm">
                    <p className="font-medium">解析預覽</p>
                    <p>
                      <span className="text-muted-foreground">記錄筆數：</span>
                      <span className="font-semibold">{preview.recordCount}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">週次：</span>
                      {preview.weeks.join('、')}
                    </p>
                    <p>
                      <span className="text-muted-foreground">口岸：</span>
                      {preview.ports.join('、')}
                    </p>
                    <p>
                      <span className="text-muted-foreground">貨物類型：</span>
                      {preview.cargoTypes.join('、')}
                    </p>
                  </div>
                )}

                {selectedFile && !preview && !parsing && (
                  <p className="text-sm text-muted-foreground">
                    已選擇：{selectedFile.name}
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false)
                    setSelectedFile(null)
                    setPreview(null)
                  }}
                >
                  取消
                </Button>
                {preview && (
                  <Button
                    onClick={handleConfirmImport}
                    disabled={importing}
                  >
                    {importing ? '匯入中...' : `確認匯入 ${preview.recordCount} 筆`}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Import Config Card ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">匯入設定</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="discount-input" className="text-sm font-medium">扣減值（HKD/KG）</label>
              <Input
                id="discount-input"
                type="number"
                step="0.01"
                min="0"
                value={editDiscount}
                onChange={(e) => { setEditDiscount(e.target.value); setIsDirty(true) }}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                目前：{config.discount_hkd_per_kg} HKD/KG
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cargo-type-input" className="text-sm font-medium">預設貨物類型</label>
              <Input
                id="cargo-type-input"
                type="text"
                value={editCargoType}
                onChange={(e) => { setEditCargoType(e.target.value); setIsDirty(true) }}
                placeholder="如：特惠带电"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                目前：{config.default_cargo_type}
              </p>
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                onClick={handleSaveConfig}
                disabled={savingConfig}
              >
                {savingConfig ? '儲存中...' : '儲存設定'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Strategy Selector + Suggestion Panel ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">計算策略與建議值</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Strategy select */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium whitespace-nowrap">計算策略</span>
            <Select
              value={strategy}
              onValueChange={(val) => { if (val) { setStrategy(val as ComputeStrategy); setIsDirty(true) } }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {computing && (
              <span className="text-xs text-muted-foreground">計算中...</span>
            )}
          </div>

          {/* Custom week selector */}
          {strategy === 'custom' && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">選擇週次（點擊切換）：</p>
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const allWeeks = [...new Set(history.map(r => r.week_label))]
                  if (allWeeks.length === 0) return <span className="text-xs text-muted-foreground">無可用週次，請先匯入數據</span>
                  return allWeeks.map(w => (
                    <Badge
                      key={w}
                      variant={customWeeks.includes(w) ? 'default' : 'outline'}
                      className="cursor-pointer text-xs"
                      onClick={() => {
                        setCustomWeeks(prev =>
                          prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w]
                        )
                        setIsDirty(true)
                      }}
                    >
                      {w}
                    </Badge>
                  ))
                })()}
              </div>
            </div>
          )}

          {/* Suggestion panel */}
          {suggestions.length > 0 && (
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950/30 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                  建議值
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-green-400 text-green-700 hover:bg-green-100 dark:text-green-300 dark:hover:bg-green-900"
                  onClick={handleApplySuggestions}
                  disabled={applying}
                >
                  {applying ? '套用中...' : '套用到成本參數'}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {suggestions.map((s) => (
                  <div
                    key={s.port_code}
                    className="rounded-md bg-white dark:bg-green-900/30 border border-green-200 dark:border-green-700 p-2 text-center"
                  >
                    <Badge
                      variant="secondary"
                      className="font-mono text-xs mb-1"
                    >
                      {s.port_code}
                    </Badge>
                    <p className="text-sm font-bold text-green-700 dark:text-green-300">
                      {s.net_price.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">HKD/KG</p>
                  </div>
                ))}
              </div>

              {/* Composite cost */}
              <div className="rounded-md bg-green-100 dark:bg-green-900/50 px-3 py-2">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  綜合空運成本（加權平均 × 泡率 1.1）：
                  <span className="ml-2 text-lg font-bold">
                    {compositeCost.toFixed(2)}
                  </span>
                  <span className="ml-1 text-sm font-normal">HKD/KG</span>
                </p>
              </div>

              {/* Source info with cargo type */}
              {suggestions[0]?.source_weeks && suggestions[0].source_weeks.length > 0 && (
                <p className="text-xs text-green-600/70 dark:text-green-400/70">
                  數據來源：{config.default_cargo_type} · 週次 {suggestions[0].source_weeks.join('、')}
                </p>
              )}
            </div>
          )}

          {!computing && suggestions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              目前無報價數據，請先匯入空運報價。
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── History Table ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">匯入記錄</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                貨物類型
              </span>
              <Select
                value={historyCargoFilter}
                onValueChange={(val) => { if (val) setHistoryCargoFilter(val) }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCargoTypes.map((ct) => (
                    <SelectItem key={ct} value={ct}>{ct}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground">載入中...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              目前無記錄，請先匯入空運報價。
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>口岸</TableHead>
                    <TableHead>貨物類型</TableHead>
                    <TableHead>週次</TableHead>
                    <TableHead className="text-right">原始報價</TableHead>
                    <TableHead className="text-right">扣減</TableHead>
                    <TableHead className="text-right">淨價</TableHead>
                    <TableHead>匯入時間</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((rec, idx) => (
                    <TableRow key={rec.id ?? idx}>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {rec.port_code}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{rec.cargo_type}</TableCell>
                      <TableCell className="text-sm font-mono">
                        {rec.week_label}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono">
                        {rec.raw_price_hkd_per_kg.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono">
                        {rec.discount_hkd_per_kg.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono font-semibold">
                        {rec.net_price_hkd_per_kg != null
                          ? rec.net_price_hkd_per_kg.toFixed(2)
                          : (
                              rec.raw_price_hkd_per_kg - rec.discount_hkd_per_kg
                            ).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {rec.imported_at
                          ? new Date(rec.imported_at).toLocaleString('zh-HK')
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
