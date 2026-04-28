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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Trash2, Eye } from 'lucide-react'
import { toast } from 'sonner'
import type { Scenario, BracketCost } from '@/types/scenario'
import type { GlobalRateCard, RateCardCountryBracket } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScenarioRow {
  id: string
  name: string
  pricing_mode?: string
  origin_warehouse?: string
  updated_at?: string
  created_at?: string
  results?: { cost_per_bracket?: BracketCost[]; avg_cost_per_ticket?: number }
}

type RateCardRow = GlobalRateCard & { country_count?: number }

// ─── Panel ───────────────────────────────────────────────────────────────────

export default function LibraryPanel() {
  const [activeTab, setActiveTab] = useState<'scenarios' | 'rate-cards'>('scenarios')
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([])
  const [rateCards, setRateCards] = useState<RateCardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAllVersions, setShowAllVersions] = useState(false)

  const [viewScenario, setViewScenario] = useState<Scenario | null>(null)
  const [viewRateCard, setViewRateCard] = useState<RateCardRow | null>(null)
  const [viewRateCardDetail, setViewRateCardDetail] = useState<(GlobalRateCard & { country_brackets: RateCardCountryBracket[] }) | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'scenario' | 'rate-card'; id: string; name: string } | null
  >(null)
  const [deleting, setDeleting] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const versionParam = showAllVersions ? '&is_current=0' : ''
      const [scRes, rcRes] = await Promise.all([
        fetch('/api/scenarios?country=all&limit=500'),
        fetch(`/api/rate-cards?limit=500${versionParam}`),
      ])
      if (scRes.ok) setScenarios(await scRes.json())
      if (rcRes.ok) setRateCards(await rcRes.json())
    } catch {
      toast.error('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [showAllVersions])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Filter helpers ──
  const filteredScenarios = useMemo(() => {
    if (!search) return scenarios
    const q = search.toLowerCase()
    return scenarios.filter((s) => s.name.toLowerCase().includes(q))
  }, [scenarios, search])

  const filteredRateCards = useMemo(() => {
    if (!search) return rateCards
    const q = search.toLowerCase()
    return rateCards.filter((r) =>
      r.product_name.toLowerCase().includes(q) || r.product_code.toLowerCase().includes(q)
    )
  }, [rateCards, search])

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

  const handleViewRateCard = useCallback(async (card: RateCardRow) => {
    setViewRateCard(card)
    setViewRateCardDetail(null)
    setViewLoading(true)
    try {
      const res = await fetch(`/api/rate-cards/${card.id}`)
      if (res.ok) setViewRateCardDetail(await res.json())
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

  // ── Totals ──
  const totals = useMemo(() => ({
    scenarioTotal: scenarios.length,
    rateCardTotal: rateCards.length,
    currentCards: rateCards.filter((r) => r.is_current).length,
    totalCountries: rateCards.reduce((sum, r) => sum + (r.country_count ?? 0), 0),
  }), [scenarios, rateCards])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">資料總覽</h1>
          <p className="text-sm text-muted-foreground mt-0.5">集中管理方案與全球價卡</p>
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
          <p className="text-xs text-muted-foreground">現行價卡</p>
          <p className="text-2xl font-bold font-mono">{totals.currentCards}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">全部價卡版本</p>
          <p className="text-2xl font-bold font-mono">{totals.rateCardTotal}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">涵蓋國家數（合計）</p>
          <p className="text-2xl font-bold font-mono">{totals.totalCountries}</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-center gap-3">
          <Input
            placeholder="搜尋名稱或代碼..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 h-8 text-sm"
          />
          <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAllVersions}
              onChange={(e) => setShowAllVersions(e.target.checked)}
              className="rounded"
            />
            顯示所有版本
          </label>
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
                        <TableHead>產品名稱</TableHead>
                        <TableHead>代碼</TableHead>
                        <TableHead>幣別</TableHead>
                        <TableHead>版本日期</TableHead>
                        <TableHead className="text-right">國家數</TableHead>
                        <TableHead>版本</TableHead>
                        <TableHead>狀態</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRateCards.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.product_name}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{r.product_code}</TableCell>
                          <TableCell className="text-xs">{r.currency}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.valid_from ?? '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {r.country_count ?? 0}
                          </TableCell>
                          <TableCell className="font-mono text-xs">v{r.version}</TableCell>
                          <TableCell>
                            {r.is_current ? (
                              <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">現行</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">已封存</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => handleViewRateCard(r)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteTarget({ type: 'rate-card', id: r.id!, name: r.product_name })}
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
                <DialogTitle>{viewScenario.name}</DialogTitle>
                <DialogDescription>
                  {viewScenario.pricing_mode}
                  {viewScenario.origin_warehouse && ` · 始發 ${viewScenario.origin_warehouse}`}
                </DialogDescription>
              </DialogHeader>
              <ScenarioDetails scenario={viewScenario} />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Rate card view dialog */}
      <Dialog open={!!viewRateCard} onOpenChange={(o) => !o && (setViewRateCard(null), setViewRateCardDetail(null))}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {viewRateCard && (
            <>
              <DialogHeader>
                <DialogTitle>{viewRateCard.product_name}</DialogTitle>
                <DialogDescription>
                  {viewRateCard.product_code} · {viewRateCard.currency} · v{viewRateCard.version}
                  {viewRateCard.valid_from && ` · 生效日 ${viewRateCard.valid_from}`}
                </DialogDescription>
              </DialogHeader>
              {viewLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> 載入中
                </div>
              ) : viewRateCardDetail ? (
                <RateCardDetails card={viewRateCardDetail} />
              ) : null}
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
        <Stat label="BC泡比" value={scenario.bc_bubble_ratio?.toString() ?? '-'} />
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
          <KV k="BC段" v={scenario.vendor_bc_id} />
          <KV k="D段" v={scenario.vendor_d_id} />
        </div>
      </div>
    </div>
  )
}

function RateCardDetails({ card }: { card: GlobalRateCard & { country_brackets: RateCardCountryBracket[] } }) {
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="來源" value={card.source} />
        <Stat label="幣別" value={card.currency} />
        <Stat label="涵蓋國家" value={`${card.country_brackets.length} 個`} />
        <Stat label="燃油附加費" value={`${((card.fuel_surcharge_pct ?? 0) * 100).toFixed(1)}%`} />
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">國家 / 地區價格</p>
        <div className="border rounded-md overflow-auto max-h-96">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>國家</TableHead>
                <TableHead className="text-right">重量段數</TableHead>
                <TableHead className="text-right">展開</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {card.country_brackets.map((cb) => (
                <>
                  <TableRow
                    key={cb.country_code}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedCountry(expandedCountry === cb.country_code ? null : cb.country_code)}
                  >
                    <TableCell className="font-medium text-sm">
                      {cb.country_name_zh || cb.country_name_en}
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">{cb.country_code}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{cb.brackets.length}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {expandedCountry === cb.country_code ? '▲' : '▼'}
                    </TableCell>
                  </TableRow>
                  {expandedCountry === cb.country_code && cb.brackets.map((b, i) => (
                    <TableRow key={i} className="bg-muted/20">
                      <TableCell colSpan={3} className="py-1 px-4">
                        <div className="grid grid-cols-4 text-xs font-mono gap-2">
                          <span>{b.weight_min}–{b.weight_max} kg</span>
                          <span>費率 {b.rate_per_kg}/kg</span>
                          <span>掛號 {b.reg_fee}</span>
                          {b.cost_hkd != null && <span className="text-muted-foreground">成本 {b.cost_hkd} HKD</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
        </div>
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
