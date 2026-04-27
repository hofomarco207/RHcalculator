'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Loader2, Trash2, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { getCountryFlag } from '@/lib/data/country-seed'
import { getMarginColorClass } from '@/lib/utils/margin'
import type { Scenario, BracketCost } from '@/types/scenario'
import type { RateCard, RateCardBracket } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScenarioRow {
  id: string
  name: string
  country_code: string
  pricing_mode?: string
  origin_warehouse?: string
  updated_at?: string
  created_at?: string
  results?: { cost_per_bracket?: BracketCost[]; avg_cost_per_ticket?: number }
}

interface RateCardRow {
  id: string
  name: string
  country_code: string
  product_type?: string
  target_margin?: number
  brackets: RateCardBracket[]
  scenario_id?: string | null
  created_at?: string
}

interface Country {
  code: string
  name_zh: string
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export default function LibraryPanel() {
  const [activeTab, setActiveTab] = useState<'scenarios' | 'rate-cards'>('scenarios')
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([])
  const [rateCards, setRateCards] = useState<RateCardRow[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [loading, setLoading] = useState(true)
  const [countryFilter, setCountryFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const [viewScenario, setViewScenario] = useState<Scenario | null>(null)
  const [viewRateCard, setViewRateCard] = useState<RateCardRow | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'scenario' | 'rate-card'; id: string; name: string } | null
  >(null)
  const [deleting, setDeleting] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [scRes, rcRes, cRes] = await Promise.all([
        fetch('/api/scenarios?country=all&limit=500'),
        fetch('/api/rate-cards?country_code=all&limit=500'),
        fetch('/api/countries'),
      ])
      if (scRes.ok) setScenarios(await scRes.json())
      if (rcRes.ok) setRateCards(await rcRes.json())
      if (cRes.ok) setCountries(await cRes.json())
    } catch {
      toast.error('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Filter helpers ──
  const availableCountries = useMemo(() => {
    const codes = new Set<string>()
    scenarios.forEach((s) => codes.add(s.country_code))
    rateCards.forEach((r) => codes.add(r.country_code))
    return countries.filter((c) => codes.has(c.code))
  }, [scenarios, rateCards, countries])

  const filteredScenarios = useMemo(() => {
    return scenarios.filter((s) => {
      if (countryFilter !== 'all' && s.country_code !== countryFilter) return false
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [scenarios, countryFilter, search])

  const filteredRateCards = useMemo(() => {
    return rateCards.filter((r) => {
      if (countryFilter !== 'all' && r.country_code !== countryFilter) return false
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [rateCards, countryFilter, search])

  // ── View handlers ──
  const handleViewScenario = useCallback(async (id: string) => {
    setViewLoading(true)
    try {
      const res = await fetch(`/api/scenarios/${id}`)
      if (res.ok) setViewScenario(await res.json())
      else toast.error('載入失敗')
    } finally {
      setViewLoading(false)
    }
  }, [])

  // ── Delete handler ──
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const url =
        deleteTarget.type === 'scenario'
          ? `/api/scenarios/${deleteTarget.id}`
          : `/api/rate-cards/${deleteTarget.id}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('已刪除')
      if (deleteTarget.type === 'scenario') {
        setScenarios((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      } else {
        setRateCards((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      }
      setDeleteTarget(null)
    } catch {
      toast.error('刪除失敗')
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget])

  // ── Totals for header ──
  const totals = useMemo(() => {
    const byCountry = new Map<string, { sc: number; rc: number }>()
    for (const s of scenarios) {
      const cur = byCountry.get(s.country_code) ?? { sc: 0, rc: 0 }
      byCountry.set(s.country_code, { ...cur, sc: cur.sc + 1 })
    }
    for (const r of rateCards) {
      const cur = byCountry.get(r.country_code) ?? { sc: 0, rc: 0 }
      byCountry.set(r.country_code, { ...cur, rc: cur.rc + 1 })
    }
    return {
      scenarioTotal: scenarios.length,
      rateCardTotal: rateCards.length,
      countryCount: byCountry.size,
      byCountry: Array.from(byCountry.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    }
  }, [scenarios, rateCards])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">資料總覽</h1>
          <p className="text-sm text-muted-foreground mt-0.5">集中管理各國方案與價卡</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
          {loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          重新整理
        </Button>
      </div>

      {/* Totals overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">總方案數</p>
          <p className="text-2xl font-bold font-mono">{totals.scenarioTotal}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">總價卡數</p>
          <p className="text-2xl font-bold font-mono">{totals.rateCardTotal}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">涉及國家</p>
          <p className="text-2xl font-bold font-mono">{totals.countryCount}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground mb-1">各國分布</p>
          <div className="flex flex-wrap gap-1">
            {totals.byCountry.slice(0, 8).map(([code, cnt]) => (
              <Badge key={code} variant="secondary" className="text-[10px] font-normal">
                {getCountryFlag(code)} {code} · {cnt.sc + cnt.rc}
              </Badge>
            ))}
            {totals.byCountry.length > 8 && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                +{totals.byCountry.length - 8}
              </Badge>
            )}
          </div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-center gap-3">
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部國家</SelectItem>
              {availableCountries.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {getCountryFlag(c.code)} {c.name_zh} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="搜尋名稱..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 h-8 text-sm"
          />
          <span className="text-xs text-muted-foreground ml-auto">
            方案 {filteredScenarios.length} · 價卡 {filteredRateCards.length}
          </span>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'scenarios' | 'rate-cards')}>
        <TabsList>
          <TabsTrigger value="scenarios">方案列表 ({filteredScenarios.length})</TabsTrigger>
          <TabsTrigger value="rate-cards">價卡列表 ({filteredRateCards.length})</TabsTrigger>
        </TabsList>

        {/* Scenarios */}
        <TabsContent value="scenarios">
          <Card>
            <CardContent className="pt-4">
              {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> 載入中
                </div>
              ) : filteredScenarios.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">無方案</p>
              ) : (
                <div className="overflow-auto max-h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>國家</TableHead>
                        <TableHead>名稱</TableHead>
                        <TableHead>定價模式</TableHead>
                        <TableHead>始發</TableHead>
                        <TableHead>更新時間</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredScenarios.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">
                            {getCountryFlag(s.country_code)} {s.country_code}
                          </TableCell>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>
                            {s.pricing_mode && <Badge variant="outline" className="text-[10px]">{s.pricing_mode}</Badge>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{s.origin_warehouse ?? '-'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => handleViewScenario(s.id)}
                                disabled={viewLoading}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteTarget({ type: 'scenario', id: s.id, name: s.name })}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rate Cards */}
        <TabsContent value="rate-cards">
          <Card>
            <CardContent className="pt-4">
              {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> 載入中
                </div>
              ) : filteredRateCards.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">無價卡</p>
              ) : (
                <div className="overflow-auto max-h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>國家</TableHead>
                        <TableHead>名稱</TableHead>
                        <TableHead>產品類型</TableHead>
                        <TableHead>目標毛利</TableHead>
                        <TableHead>段數</TableHead>
                        <TableHead>建立時間</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRateCards.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">
                            {getCountryFlag(r.country_code)} {r.country_code}
                          </TableCell>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.product_type ?? '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.target_margin != null ? `${(r.target_margin * 100).toFixed(0)}%` : '-'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.brackets?.length ?? 0}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => setViewRateCard(r)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteTarget({ type: 'rate-card', id: r.id, name: r.name })}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Scenario view dialog */}
      <Dialog open={!!viewScenario} onOpenChange={(o) => !o && setViewScenario(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {viewScenario && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {getCountryFlag(viewScenario.country_code)} {viewScenario.name}
                </DialogTitle>
                <DialogDescription>
                  {viewScenario.pricing_mode} · {viewScenario.country_code}
                  {viewScenario.origin_warehouse && ` · 始發 ${viewScenario.origin_warehouse}`}
                </DialogDescription>
              </DialogHeader>
              <ScenarioDetails scenario={viewScenario} />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Rate card view dialog */}
      <Dialog open={!!viewRateCard} onOpenChange={(o) => !o && setViewRateCard(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {viewRateCard && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {getCountryFlag(viewRateCard.country_code)} {viewRateCard.name}
                </DialogTitle>
                <DialogDescription>
                  {viewRateCard.product_type ?? '-'} · 目標毛利{' '}
                  {viewRateCard.target_margin != null ? `${(viewRateCard.target_margin * 100).toFixed(0)}%` : '-'}
                </DialogDescription>
              </DialogHeader>
              <RateCardDetails card={viewRateCard} />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認刪除</DialogTitle>
            <DialogDescription>
              {deleteTarget && `確定要刪除${deleteTarget.type === 'scenario' ? '方案' : '價卡'}「${deleteTarget.name}」嗎？`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ScenarioDetails({ scenario }: { scenario: Scenario }) {
  const costs = scenario.results?.cost_per_bracket
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="週票量" value={scenario.weekly_tickets?.toLocaleString() ?? '-'} />
        <Stat label="週重量" value={scenario.weekly_kg ? `${scenario.weekly_kg} kg` : '-'} />
        <Stat label="平均單票成本" value={scenario.results?.avg_cost_per_ticket ? `${scenario.results.avg_cost_per_ticket.toFixed(2)} HKD` : '-'} />
        <Stat label="B段泡比" value={scenario.b_bubble_rate?.toString() ?? '-'} />
      </div>

      {costs && costs.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">各重量段成本</p>
          <div className="border rounded-md overflow-auto max-h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>重量段</TableHead>
                  <TableHead className="text-right">代表重量</TableHead>
                  <TableHead className="text-right">成本 (HKD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.map((c) => (
                  <TableRow key={c.weight_range}>
                    <TableCell className="font-mono text-xs">{c.weight_range}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{c.representative_weight_kg} kg</TableCell>
                    <TableCell className="text-right font-mono text-xs">{c.cost_hkd.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">供應商配置</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <KV k="A段" v={scenario.vendor_a_id} />
          <KV k="B段" v={scenario.vendor_b_id} />
          <KV k="C段" v={scenario.vendor_c_id} />
          <KV k="D段" v={scenario.vendor_d_id} />
          {scenario.vendor_bc_id && <KV k="BC段" v={scenario.vendor_bc_id} />}
          {scenario.vendor_bcd_id && <KV k="BCD段" v={scenario.vendor_bcd_id} />}
          {scenario.vendor_b2_id && <KV k="B2段" v={scenario.vendor_b2_id} />}
        </div>
      </div>
    </div>
  )
}

function RateCardDetails({ card }: { card: RateCardRow }) {
  const avgMargin = useMemo(() => {
    if (!card.brackets?.length) return 0
    return card.brackets.reduce((sum, b) => sum + b.actual_margin, 0) / card.brackets.length
  }, [card.brackets])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="段數" value={card.brackets.length.toString()} />
        <Stat label="平均毛利" value={`${(avgMargin * 100).toFixed(1)}%`} valueClass={getMarginColorClass(avgMargin)} />
        <Stat label="國家" value={`${getCountryFlag(card.country_code)} ${card.country_code}`} />
        <Stat label="建立時間" value={card.created_at ? new Date(card.created_at).toLocaleDateString() : '-'} />
      </div>

      <div className="border rounded-md overflow-auto max-h-96">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>重量段</TableHead>
              <TableHead className="text-right">成本</TableHead>
              <TableHead className="text-right">運費 /kg</TableHead>
              <TableHead className="text-right">掛號費</TableHead>
              <TableHead className="text-right">報價</TableHead>
              <TableHead className="text-right">毛利</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {card.brackets.map((b) => (
              <TableRow key={b.weight_range}>
                <TableCell className="font-mono text-xs">{b.weight_range}</TableCell>
                <TableCell className="text-right font-mono text-xs">{b.cost_hkd.toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{b.freight_rate_hkd_per_kg.toFixed(1)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{b.reg_fee_hkd.toFixed(0)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{b.revenue_hkd.toFixed(2)}</TableCell>
                <TableCell className={`text-right font-mono text-xs ${getMarginColorClass(b.actual_margin)}`}>
                  {(b.actual_margin * 100).toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-md border p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium font-mono mt-0.5 ${valueClass ?? ''}`}>{value}</p>
    </div>
  )
}

function KV({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="flex gap-1.5">
      <span className="text-muted-foreground">{k}:</span>
      <span className="font-mono truncate">{v ?? '-'}</span>
    </div>
  )
}
