'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { ArrowDown, ArrowUp, Minus, Loader2 } from 'lucide-react'
import type { VendorBRate } from '@/types/vendor'
import type { ExchangeRates } from '@/types'
import { useExchangeRates } from '@/lib/context/exchange-rate-context'

interface VersionBlock {
  version: number
  valid_from: string | null
  valid_to: string | null
  is_current: boolean
  rates: VendorBRate[]
}

interface BRateCompareDialogProps {
  vendorId: string
  vendorName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function company(r: VendorBRate): string {
  const s = r.service_name ?? ''
  const idx = s.indexOf('-')
  return (idx > 0 ? s.slice(0, idx) : s).trim() || '—'
}

function toHkd(val: number, currency: string, rates: ExchangeRates): number {
  const c = (currency ?? 'HKD').toUpperCase()
  if (c === 'HKD') return val
  if (c === 'USD') return val * rates.usd_hkd
  if (c === 'RMB' || c === 'CNY') return val / rates.hkd_rmb
  if (c === 'JPY') return val * (rates.jpy_hkd ?? 0.052)
  return val
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

const LINE_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5',
]

export function BRateCompareDialog({
  vendorId,
  vendorName,
  open,
  onOpenChange,
}: BRateCompareDialogProps) {
  const { rates: exchangeRates } = useExchangeRates()
  const [loading, setLoading] = useState(false)
  const [versionBlocks, setVersionBlocks] = useState<VersionBlock[]>([])
  const [selectedVersions, setSelectedVersions] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!open || !vendorId) return
    setLoading(true)
    fetch(`/api/vendors/${vendorId}/b-rates/compare`)
      .then((r) => r.json())
      .then((data) => {
        const blocks: VersionBlock[] = Array.isArray(data.versions) ? data.versions : []
        setVersionBlocks(blocks)
        const defaultSel = new Set<number>(blocks.slice(0, 3).map((b) => b.version))
        setSelectedVersions(defaultSel)
      })
      .catch(() => setVersionBlocks([]))
      .finally(() => setLoading(false))
  }, [open, vendorId])

  const toggleVersion = (v: number) => {
    setSelectedVersions((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  }

  const orderedVersions = useMemo(
    () => [...versionBlocks].filter((b) => selectedVersions.has(b.version)).sort((a, b) => a.version - b.version),
    [versionBlocks, selectedVersions],
  )

  /** Chart: one line per gateway, value = median of HKD rate across all rates of that gateway in that version. */
  const chartData = useMemo(() => {
    const seriesKeys = new Set<string>()
    const perVersion = orderedVersions.map((block) => {
      const groups = new Map<string, number[]>()
      for (const r of block.rates) {
        const key = r.gateway_code
        seriesKeys.add(key)
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(toHkd(r.rate_per_kg, r.currency, exchangeRates))
      }
      const row: Record<string, number | string> = {
        versionLabel: `v${block.version}${block.valid_from ? ` · ${block.valid_from}` : ''}`,
      }
      for (const [key, arr] of groups) {
        row[key] = Number(median(arr).toFixed(2))
      }
      return row
    })
    return { rows: perVersion, keys: [...seriesKeys].sort() }
  }, [orderedVersions, exchangeRates])

  /** Table rows grouped by (gateway × tier); cell = median HKD across all rates in that cell. */
  const tableRows = useMemo(() => {
    const keyMap = new Map<
      string,
      {
        gateway: string
        tier: number
        perVersion: Map<number, VendorBRate[]>
      }
    >()
    for (const block of orderedVersions) {
      for (const r of block.rates) {
        const key = `${r.gateway_code}|${r.weight_tier_min_kg}`
        if (!keyMap.has(key)) {
          keyMap.set(key, {
            gateway: r.gateway_code,
            tier: r.weight_tier_min_kg,
            perVersion: new Map(),
          })
        }
        const row = keyMap.get(key)!
        if (!row.perVersion.has(block.version)) row.perVersion.set(block.version, [])
        row.perVersion.get(block.version)!.push(r)
      }
    }
    return [...keyMap.values()].sort((a, b) => {
      if (a.gateway !== b.gateway) return a.gateway.localeCompare(b.gateway)
      return a.tier - b.tier
    })
  }, [orderedVersions])

  const trendIndicator = (oldVal: number | null, newVal: number | null) => {
    if (oldVal == null && newVal == null) return null
    if (oldVal == null && newVal != null) {
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">新增</Badge>
    }
    if (oldVal != null && newVal == null) {
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">移除</Badge>
    }
    if (oldVal === newVal) {
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Minus className="h-3 w-3" /> 持平
        </span>
      )
    }
    const diff = (newVal as number) - (oldVal as number)
    const pct = ((diff / (oldVal as number)) * 100).toFixed(1)
    const up = diff > 0
    const Icon = up ? ArrowUp : ArrowDown
    const cls = up ? 'text-red-600' : 'text-emerald-600'
    return (
      <span className={`inline-flex items-center gap-1 font-mono ${cls}`}>
        <Icon className="h-3 w-3" />
        {diff > 0 ? '+' : ''}
        {diff.toFixed(2)} ({diff > 0 ? '+' : ''}
        {pct}%)
      </span>
    )
  }

  /** Render a cell with median + hover tooltip listing each (company/service → HKD rate + original currency). */
  const renderCell = (rates: VendorBRate[]) => {
    if (rates.length === 0) {
      return <span className="text-xs text-muted-foreground">—</span>
    }
    const hkdPerRate = rates.map((r) => ({
      r,
      hkd: toHkd(r.rate_per_kg, r.currency, exchangeRates),
    }))
    const med = median(hkdPerRate.map((x) => x.hkd))
    return (
      <div className="group relative inline-block">
        <div className="font-mono text-xs cursor-help">
          <div>{med.toFixed(2)}</div>
          {rates.length > 1 && (
            <div className="text-[10px] text-muted-foreground">中位數 ({rates.length} 筆)</div>
          )}
        </div>
        <div className="invisible group-hover:visible absolute z-50 left-0 top-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-lg p-3 min-w-[260px] text-xs space-y-1">
          <div className="font-medium border-b pb-1 mb-1">
            {rates[0].gateway_code} · {rates[0].weight_tier_min_kg}+ kg
          </div>
          {hkdPerRate.map(({ r, hkd }, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground truncate max-w-[150px]" title={r.service_name ?? ''}>
                {r.service_name || company(r)}
              </span>
              <span className="font-mono">
                {hkd.toFixed(2)}
                {r.currency !== 'HKD' && (
                  <span className="text-muted-foreground ml-1">
                    ({r.rate_per_kg} {r.currency})
                  </span>
                )}
              </span>
            </div>
          ))}
          <div className="border-t pt-1 mt-1 flex items-baseline justify-between font-medium">
            <span>中位數</span>
            <span className="font-mono">{med.toFixed(2)} HKD</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[60vw] w-[60vw] max-h-[92vh] overflow-hidden flex flex-col sm:!max-w-[60vw]">
        <DialogHeader>
          <DialogTitle>
            {vendorName} · B段費率版本比較（HKD）
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">選擇要比較的版本（預設最近 3 版；費率均換算為 HKD）：</div>
            <div className="flex flex-wrap gap-2">
              {versionBlocks.map((b) => {
                const active = selectedVersions.has(b.version)
                return (
                  <Button
                    key={b.version}
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => toggleVersion(b.version)}
                  >
                    v{b.version}
                    {b.valid_from && ` · ${b.valid_from}`}
                    {b.is_current && ' (最新)'}
                    <span className="ml-1 text-muted-foreground">({b.rates.length})</span>
                  </Button>
                )
              })}
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && orderedVersions.length < 2 && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              請至少選擇 2 個版本進行比較
            </div>
          )}

          {!loading && orderedVersions.length >= 2 && (
            <>
              <div className="rounded-md border p-3">
                <div className="text-sm font-medium mb-2">
                  rate_per_kg 中位數趨勢（HKD / 每個口岸 — 所有重量段與供應商的中位數）
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData.rows} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="versionLabel" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {chartData.keys.map((key, i) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-md border overflow-x-auto overflow-y-visible">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">口岸</TableHead>
                      <TableHead className="text-xs">重量段</TableHead>
                      {orderedVersions.map((b) => (
                        <TableHead key={b.version} className="text-xs font-mono">
                          v{b.version} (HKD)
                        </TableHead>
                      ))}
                      {orderedVersions.length >= 2 && (
                        <TableHead className="text-xs">
                          Δ（v{orderedVersions[0].version} → v{orderedVersions[orderedVersions.length - 1].version}）
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableRows.map((row, idx) => {
                      const firstVer = orderedVersions[0].version
                      const lastVer = orderedVersions[orderedVersions.length - 1].version
                      const firstRates = row.perVersion.get(firstVer) ?? []
                      const lastRates = row.perVersion.get(lastVer) ?? []
                      const firstVal = firstRates.length > 0
                        ? median(firstRates.map((r) => toHkd(r.rate_per_kg, r.currency, exchangeRates)))
                        : null
                      const lastVal = lastRates.length > 0
                        ? median(lastRates.map((r) => toHkd(r.rate_per_kg, r.currency, exchangeRates)))
                        : null
                      return (
                        <TableRow key={idx} className="align-top">
                          <TableCell className="text-xs font-mono">{row.gateway}</TableCell>
                          <TableCell className="text-xs font-mono">{row.tier}+ kg</TableCell>
                          {orderedVersions.map((b) => (
                            <TableCell key={b.version} className="text-xs">
                              {renderCell(row.perVersion.get(b.version) ?? [])}
                            </TableCell>
                          ))}
                          {orderedVersions.length >= 2 && (
                            <TableCell className="text-xs">{trendIndicator(firstVal, lastVal)}</TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
