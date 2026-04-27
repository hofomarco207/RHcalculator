'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Loader2, ArrowDown, ArrowUp, Minus } from 'lucide-react'

interface Bracket {
  weight_range: string
  weight_min: number
  weight_max: number
  rate_per_kg: number
  reg_fee: number
}

interface CompareRow {
  id: string
  competitor_name: string
  service_code: string
  country_code: string | null
  country_name_en: string
  country_name_zh: string
  version: number
  valid_from: string | null
  valid_to: string | null
  is_current: boolean
  currency: string
  brackets: Bracket[]
}

interface CompetitorCompareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  competitorName: string
  serviceCode: string
  productLabel?: string
}

const LINE_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5',
  '#0e7490', '#be123c', '#4d7c0f', '#c2410c', '#6d28d9',
]

const MAX_CHART_LINES = 20

function avgRatePerKg(brackets: Bracket[]): number {
  if (!brackets?.length) return 0
  const sum = brackets.reduce((s, b) => s + (b.rate_per_kg || 0), 0)
  return sum / brackets.length
}

interface BracketDiff {
  weight_range: string
  old_rate: number | null
  new_rate: number | null
  old_reg: number | null
  new_reg: number | null
}

function computeDiff(current: Bracket[] | undefined, previous: Bracket[] | undefined): BracketDiff[] {
  if (!current || !previous) return []
  const prevMap = new Map(previous.map((b) => [b.weight_range, b]))
  const curMap = new Map(current.map((b) => [b.weight_range, b]))
  const ranges = new Set<string>([...prevMap.keys(), ...curMap.keys()])
  const diffs: BracketDiff[] = []
  for (const range of ranges) {
    const p = prevMap.get(range)
    const c = curMap.get(range)
    const oldRate = p?.rate_per_kg ?? null
    const newRate = c?.rate_per_kg ?? null
    const oldReg = p?.reg_fee ?? null
    const newReg = c?.reg_fee ?? null
    if (oldRate === newRate && oldReg === newReg) continue
    diffs.push({ weight_range: range, old_rate: oldRate, new_rate: newRate, old_reg: oldReg, new_reg: newReg })
  }
  diffs.sort((a, b) => {
    const getMin = (r: string) => parseFloat(r.match(/^([0-9.]+)/)?.[1] ?? '0')
    return getMin(a.weight_range) - getMin(b.weight_range)
  })
  return diffs
}

export function CompetitorCompareDialog({
  open,
  onOpenChange,
  competitorName,
  serviceCode,
  productLabel,
}: CompetitorCompareDialogProps) {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<CompareRow[]>([])
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set())
  const [countrySearch, setCountrySearch] = useState('')

  const storageKey = `competitorCompareCountries:${competitorName}:${serviceCode}`

  useEffect(() => {
    if (!open || !competitorName || !serviceCode) return
    setLoading(true)
    const qs = new URLSearchParams({
      competitor_name: competitorName,
      service_code: serviceCode,
    })
    fetch(`/api/competitor-rate-cards/compare?${qs}`)
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [open, competitorName, serviceCode])

  const versions = useMemo(() => {
    const map = new Map<number, { version: number; valid_from: string | null; is_current: boolean }>()
    for (const r of rows) {
      if (!map.has(r.version)) {
        map.set(r.version, {
          version: r.version,
          valid_from: r.valid_from,
          is_current: r.is_current,
        })
      }
    }
    return [...map.values()].sort((a, b) => a.version - b.version)
  }, [rows])

  const countries = useMemo(() => {
    const map = new Map<string, { key: string; name_en: string; name_zh: string; code: string | null }>()
    for (const r of rows) {
      const key = r.country_code || r.country_name_en
      if (!map.has(key)) {
        map.set(key, {
          key,
          name_en: r.country_name_en,
          name_zh: r.country_name_zh,
          code: r.country_code,
        })
      }
    }
    return [...map.values()].sort((a, b) => a.name_en.localeCompare(b.name_en))
  }, [rows])

  // Restore / initialize country selection when country list resolves.
  useEffect(() => {
    if (!open || countries.length === 0) return
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null
    if (raw) {
      try {
        const saved = JSON.parse(raw) as string[]
        const allKeys = new Set(countries.map((c) => c.key))
        const valid = saved.filter((k) => allKeys.has(k))
        setSelectedCountries(new Set(valid.length > 0 ? valid : countries.slice(0, MAX_CHART_LINES).map((c) => c.key)))
        return
      } catch { /* fall through */ }
    }
    // Default: first MAX_CHART_LINES countries
    setSelectedCountries(new Set(countries.slice(0, MAX_CHART_LINES).map((c) => c.key)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, countries.length, storageKey])

  // Persist country selection
  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    if (selectedCountries.size === 0 && countries.length > 0) return
    window.localStorage.setItem(storageKey, JSON.stringify([...selectedCountries]))
  }, [selectedCountries, open, storageKey, countries.length])

  const lookup = useMemo(() => {
    const m = new Map<string, CompareRow>()
    for (const r of rows) {
      const countryKey = r.country_code || r.country_name_en
      m.set(`${countryKey}||${r.version}`, r)
    }
    return m
  }, [rows])

  const chartCountries = useMemo(
    () => countries.filter((c) => selectedCountries.has(c.key)),
    [countries, selectedCountries],
  )

  const chartData = useMemo(() => {
    return versions.map((v) => {
      const point: Record<string, number | string> = {
        versionLabel: `v${v.version}${v.valid_from ? ` · ${v.valid_from}` : ''}`,
      }
      for (const c of chartCountries) {
        const row = lookup.get(`${c.key}||${v.version}`)
        if (row) point[c.key] = Number(avgRatePerKg(row.brackets).toFixed(2))
      }
      return point
    })
  }, [versions, chartCountries, lookup])

  const filteredCountryOptions = useMemo(() => {
    if (!countrySearch.trim()) return countries
    const q = countrySearch.toLowerCase()
    return countries.filter(
      (c) =>
        c.name_en.toLowerCase().includes(q) ||
        c.name_zh.toLowerCase().includes(q) ||
        (c.code?.toLowerCase().includes(q) ?? false),
    )
  }, [countries, countrySearch])

  const trendIndicator = (oldVal: number | null, newVal: number | null) => {
    if (oldVal == null && newVal == null) return null
    if (oldVal == null && newVal != null) {
      return <span className="text-[10px] text-emerald-700">新增</span>
    }
    if (oldVal != null && newVal == null) {
      return <span className="text-[10px] text-red-700">移除</span>
    }
    if (oldVal === newVal) {
      return <Minus className="h-3 w-3 text-muted-foreground" />
    }
    const diff = (newVal as number) - (oldVal as number)
    const pct = ((diff / (oldVal as number)) * 100).toFixed(1)
    const up = diff > 0
    const Icon = up ? ArrowUp : ArrowDown
    const cls = up ? 'text-red-600' : 'text-emerald-600'
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono ${cls}`}>
        <Icon className="h-3 w-3" />
        {diff > 0 ? '+' : ''}
        {diff.toFixed(1)} ({diff > 0 ? '+' : ''}{pct}%)
      </span>
    )
  }

  const renderCell = (row: CompareRow | undefined) => {
    if (!row) return <span className="text-xs text-muted-foreground">—</span>
    const avg = avgRatePerKg(row.brackets)
    return (
      <div className="group relative inline-block">
        <div className="font-mono text-xs cursor-help">
          <div>{avg.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground">{row.brackets.length} 段</div>
        </div>
        <div className="invisible group-hover:visible absolute z-50 left-0 top-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-lg p-3 min-w-[280px] text-xs space-y-1">
          <div className="font-medium border-b pb-1 mb-1">
            {row.country_name_zh} ({row.country_name_en}) · v{row.version}
          </div>
          {row.brackets.map((b, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground font-mono">{b.weight_range}</span>
              <span className="font-mono">
                {b.rate_per_kg.toFixed(1)} / kg
                {b.reg_fee > 0 && (
                  <span className="text-muted-foreground ml-1">+ {b.reg_fee.toFixed(0)}</span>
                )}
              </span>
            </div>
          ))}
          <div className="border-t pt-1 mt-1 flex items-baseline justify-between font-medium">
            <span>平均 運費/KG</span>
            <span className="font-mono">{avg.toFixed(2)} {row.currency}</span>
          </div>
        </div>
      </div>
    )
  }

  function toggleCountry(key: string) {
    setSelectedCountries((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAll() {
    setSelectedCountries(new Set(countries.map((c) => c.key)))
  }

  function clearAll() {
    setSelectedCountries(new Set())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-[80vw] w-[80vw] sm:!max-w-[80vw] !p-0 !gap-0"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '92vh',
          maxHeight: '92vh',
          overflow: 'hidden',
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle>
            {productLabel ?? `${competitorName} - ${serviceCode}`} · 版本比較
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4" style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 載入中…
            </div>
          ) : versions.length < 2 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              此產品只有 {versions.length} 個版本，無法比較。再匯入一次新版本即可看到對比。
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3">
                <div className="rounded-md border p-3 bg-card flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium">國家選擇</span>
                    <span className="text-[10px] text-muted-foreground">
                      {selectedCountries.size} / {countries.length}
                    </span>
                  </div>
                  <Input
                    type="text"
                    placeholder="搜尋國家…"
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    className="h-7 text-xs mb-2"
                  />
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-[11px] underline text-blue-600 hover:text-blue-700"
                    >
                      全選
                    </button>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-[11px] underline text-red-600 hover:text-red-700"
                    >
                      清空
                    </button>
                  </div>
                  <div className="overflow-y-auto max-h-[280px] border rounded">
                    {filteredCountryOptions.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground text-center py-3">
                        沒有符合搜尋的國家
                      </div>
                    ) : (
                      filteredCountryOptions.map((c) => {
                        const checked = selectedCountries.has(c.key)
                        return (
                          <label
                            key={c.key}
                            className="flex items-center gap-2 px-2 py-1 hover:bg-muted/50 cursor-pointer text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCountry(c.key)}
                              className="h-3 w-3"
                            />
                            <span className="truncate">
                              {c.name_zh}
                              <span className="text-muted-foreground ml-1">
                                {c.name_en}
                                {c.code && ` · ${c.code}`}
                              </span>
                            </span>
                          </label>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-md border p-3 bg-card">
                  <div className="text-xs text-muted-foreground mb-2">
                    每個國家的 <span className="font-medium">平均運費/KG</span>（全部重量段均值）跨版本變化
                  </div>
                  {chartCountries.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-8 text-center">
                      請在左側選擇至少一個國家才會畫線
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: 320 }}>
                      <ResponsiveContainer>
                        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="versionLabel" fontSize={11} />
                          <YAxis fontSize={11} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          {chartCountries.slice(0, MAX_CHART_LINES).map((c, idx) => (
                            <Line
                              key={c.key}
                              type="monotone"
                              dataKey={c.key}
                              name={c.name_zh || c.name_en}
                              stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              connectNulls
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {chartCountries.length > MAX_CHART_LINES && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      為避免圖過密，只畫前 {MAX_CHART_LINES} 個；其餘仍呈現在下方表格。
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-md border overflow-hidden">
                <div className="max-h-[46vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="text-xs">國家</TableHead>
                        {versions.map((v) => (
                          <TableHead key={v.version} className="text-xs">
                            v{v.version}
                            {v.valid_from && <span className="text-muted-foreground ml-1">· {v.valid_from}</span>}
                            {v.is_current && <span className="text-emerald-700 ml-1">(最新)</span>}
                          </TableHead>
                        ))}
                        {versions.length >= 2 && (
                          <TableHead className="text-xs">最新 vs 前版（逐段）</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {countries.map((c) => {
                        const perVersion = versions.map((v) => {
                          const row = lookup.get(`${c.key}||${v.version}`)
                          return row ? avgRatePerKg(row.brackets) : null
                        })
                        const latest = perVersion[perVersion.length - 1]
                        const prev = perVersion.length >= 2 ? perVersion[perVersion.length - 2] : null

                        const latestRow = lookup.get(`${c.key}||${versions[versions.length - 1].version}`)
                        const prevRow = versions.length >= 2
                          ? lookup.get(`${c.key}||${versions[versions.length - 2].version}`)
                          : undefined
                        const diffs = computeDiff(latestRow?.brackets, prevRow?.brackets)

                        return (
                          <TableRow key={c.key}>
                            <TableCell className="text-xs">
                              <div>{c.name_zh}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {c.name_en} {c.code && `· ${c.code}`}
                              </div>
                            </TableCell>
                            {versions.map((v) => (
                              <TableCell key={v.version} className="text-xs">
                                {renderCell(lookup.get(`${c.key}||${v.version}`))}
                              </TableCell>
                            ))}
                            {versions.length >= 2 && (
                              <TableCell className="text-xs align-top">
                                {diffs.length === 0 ? (
                                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                                    {trendIndicator(prev, latest)}
                                    <span>無變化</span>
                                  </span>
                                ) : (
                                  <div className="space-y-0.5">
                                    <div className="mb-1">{trendIndicator(prev, latest)}</div>
                                    {diffs.map((d, i) => {
                                      const rateChanged = d.old_rate !== d.new_rate
                                      const regChanged = d.old_reg !== d.new_reg
                                      const diff = (d.new_rate ?? 0) - (d.old_rate ?? 0)
                                      const colorCls = diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-600' : 'text-muted-foreground'
                                      return (
                                        <div key={i} className="flex items-baseline gap-2 font-mono text-[10px]">
                                          <span className="text-muted-foreground w-20 shrink-0">{d.weight_range}</span>
                                          {rateChanged && (
                                            <span className={colorCls}>
                                              {d.old_rate == null ? '—' : d.old_rate.toFixed(1)}
                                              {' → '}
                                              {d.new_rate == null ? '—' : d.new_rate.toFixed(1)}
                                            </span>
                                          )}
                                          {regChanged && (
                                            <span className="text-muted-foreground">
                                              掛號 {d.old_reg == null ? '—' : d.old_reg.toFixed(0)}→{d.new_reg == null ? '—' : d.new_reg.toFixed(0)}
                                            </span>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>關閉</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
