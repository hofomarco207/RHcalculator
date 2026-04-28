'use client'

import { useState, useEffect, Suspense, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { exportScenarioComparison } from '@/lib/excel/scenario-exporter'
import { CostTooltip } from '@/components/rate-card/CostTooltip'
import type { ScenarioResults, BracketCost } from '@/types/scenario'
import { SCENARIO_VERIFICATION_WEIGHTS } from '@/types'
import { useT } from '@/lib/i18n'

interface CompareScenario {
  id: string
  name: string
  weekly_tickets: number
  pricing_mode: string | null
  vendor_b_name: string | null
  vendor_c_name: string | null
  vendor_d_name: string | null
  vendor_bc_name: string | null
  vendor_bcd_name: string | null
  b_gateway_mode: string
  b_single_gateway: string | null
  b_manual_proportions: Record<string, number> | null
  results: ScenarioResults | null
  weight_point_costs: BracketCost[] | null
}

const PRICING_MODE_LABELS: Record<string, string> = {
  segmented: 'A+B+C+D',
  bc_combined: 'A+BC+D',
  bcd_combined: 'A+BCD',
  multi_b: 'A+B1+B2+C+D',
  multi_b_b2c: 'A+B1+B2C+D',
}

function fmt(n: number | undefined, d = 2): string {
  return n != null ? n.toFixed(d) : '—'
}

/** Build tooltip content for a cost cell in the comparison table */
function buildCompareTooltip(bracket: BracketCost, pricingMode: string | null): ReactNode {
  const mode = pricingMode ?? 'segmented'
  const isBCCombined = mode === 'bc_combined'
  const isBCDCombined = mode === 'bcd_combined'

  return (
    <>
      <span className="font-semibold">{bracket.representative_weight_kg} kg 成本明細</span>
      {'\n'}──────────
      {'\n'}
      <span className="text-blue-400">A段 攬收:</span> {bracket.seg_a.toFixed(2)} HKD
      {isBCCombined ? (
        <>
          {'\n'}
          <span className="text-teal-400">BC 空運+清關:</span> {(bracket.seg_bc ?? 0).toFixed(2)} HKD
          {'\n'}
          <span className="text-blue-400">D段 尾程:</span> {bracket.seg_d.toFixed(2)} HKD
        </>
      ) : isBCDCombined ? (
        <>
          {'\n'}
          <span className="text-teal-400">BCD 全段:</span> {bracket.seg_d.toFixed(2)} HKD
        </>
      ) : (
        <>
          {'\n'}
          <span className="text-blue-400">B段 空運:</span> {bracket.seg_b.toFixed(2)} HKD
          {'\n'}
          <span className="text-blue-400">C段 清關:</span> {bracket.seg_c.toFixed(2)} HKD
          {'\n'}
          <span className="text-blue-400">D段 尾程:</span> {bracket.seg_d.toFixed(2)} HKD
        </>
      )}
      {'\n'}──────────
      {'\n'}
      <span className="text-amber-400 font-semibold">合計: {bracket.cost_hkd.toFixed(2)} HKD</span>
    </>
  )
}

export default function ComparePageWrapper() {
  return (
    <Suspense fallback={<div className="p-6"><p className="text-sm text-muted-foreground">載入中...</p></div>}>
      <ComparePage />
    </Suspense>
  )
}

function ComparePage() {
  const t = useT()
  const searchParams = useSearchParams()
  const [scenarios, setScenarios] = useState<CompareScenario[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ids = searchParams.get('ids')?.split(',').filter(Boolean)
    if (!ids || ids.length < 2) {
      setLoading(false)
      return
    }

    fetch('/api/scenarios/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setScenarios(data)
      })
      .catch(() => toast.error('載入比較數據失敗'))
      .finally(() => setLoading(false))
  }, [searchParams])

  const hasResults = scenarios.some((s) => s.weight_point_costs && s.weight_point_costs.length > 0)

  function handleExport() {
    try {
      exportScenarioComparison(scenarios)
      toast.success('已匯出比較報表')
    } catch {
      toast.error('匯出失敗')
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <PageHeader title={t.pages.compare.title} description="載入中..." />
      </div>
    )
  }

  if (scenarios.length < 2) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <PageHeader title={t.pages.compare.title} description="請從方案分析頁面選擇至少 2 個方案進行比較" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={t.pages.compare.title} description={`比較 ${scenarios.length} 個方案`} />
        <Button variant="outline" onClick={handleExport}>匯出 Excel</Button>
      </div>

      {/* Overview comparison */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">方案概覽</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-32 text-xs">指標</TableHead>
                  {scenarios.map((sc) => (
                    <TableHead key={sc.id} className="text-xs text-center min-w-[140px]">
                      {sc.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <CompareRow label="定價模式" values={scenarios.map((s) => PRICING_MODE_LABELS[s.pricing_mode ?? 'segmented'] ?? s.pricing_mode ?? '—')} />
                <CompareRow label="週票量" values={scenarios.map((s) => s.weekly_tickets?.toLocaleString() ?? '—')} />
                {scenarios.some((s) => s.vendor_b_name) && (
                  <CompareRow label="B段 空運" values={scenarios.map((s) => s.vendor_b_name ?? '—')} />
                )}
                {scenarios.some((s) => s.vendor_c_name) && (
                  <CompareRow label="C段 清關" values={scenarios.map((s) => s.vendor_c_name ?? '—')} />
                )}
                {scenarios.some((s) => s.vendor_bc_name) && (
                  <CompareRow label="BC 空運+清關" values={scenarios.map((s) => s.vendor_bc_name ?? '—')} />
                )}
                {scenarios.some((s) => s.vendor_bcd_name) && (
                  <CompareRow label="BCD 全段" values={scenarios.map((s) => s.vendor_bcd_name ?? '—')} />
                )}
                <CompareRow label="D段 尾程" values={scenarios.map((s) => s.vendor_d_name ?? '—')} />
                {scenarios.some((s) => s.b_gateway_mode) && (
                  <CompareRow
                    label="口岸分配"
                    values={scenarios.map((s) => {
                      if (s.b_gateway_mode === 'single') return s.b_single_gateway ?? '—'
                      const alloc = s.results?.gateway_allocation ?? s.b_manual_proportions
                      if (!alloc) return '—'
                      return Object.entries(alloc)
                        .filter(([, p]) => p > 0)
                        .map(([gw, p]) => `${gw} ${Math.round(Number(p) * 100)}%`)
                        .join(' / ')
                    })}
                  />
                )}
                <CompareRow
                  label="平均每票成本"
                  values={scenarios.map((s) => s.results ? `${fmt(s.results.avg_cost_per_ticket)} HKD` : '未計算')}
                  highlight
                />
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Per-weight cost comparison (24 points) */}
      {hasResults && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">各重量成本比較 (HKD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-16 text-xs text-center">KG</TableHead>
                    {scenarios.map((sc) => (
                      <TableHead key={sc.id} className="text-xs text-right min-w-[100px]">
                        {sc.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SCENARIO_VERIFICATION_WEIGHTS.map((wp, wi) => {
                    // Find matching bracket from server-computed weight_point_costs
                    const brackets = scenarios.map((sc) => {
                      if (!sc.weight_point_costs) return null
                      return sc.weight_point_costs.find(
                        (b) => Math.abs(b.representative_weight_kg - wp.representative) < 0.001
                      ) ?? null
                    })
                    const costs = brackets.map((b) => b ? b.cost_hkd : null)
                    const validCosts = costs.filter((c): c is number => c !== null && c > 0)
                    const minCost = validCosts.length > 0 ? Math.min(...validCosts) : 0

                    return (
                      <TableRow key={wp.representative} className={wi % 2 === 1 ? 'bg-muted/10' : ''}>
                        <TableCell className="text-center font-mono text-xs font-semibold">{wp.representative}</TableCell>
                        {scenarios.map((sc, si) => {
                          const bracket = brackets[si]
                          const cost = costs[si]
                          const isMin = cost !== null && validCosts.length > 1 && Math.abs(cost - minCost) < 0.01
                          const cellContent = (
                            <span className={`${isMin ? 'text-green-600 font-semibold' : ''}`}>
                              {cost !== null ? fmt(cost) : '—'}
                            </span>
                          )
                          return (
                            <TableCell
                              key={sc.id}
                              className="text-right font-mono text-xs"
                            >
                              {bracket ? (
                                <CostTooltip content={buildCompareTooltip(bracket, sc.pricing_mode)}>
                                  {cellContent}
                                </CostTooltip>
                              ) : cellContent}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              <span className="text-green-600 font-semibold">綠色</span> = 該重量最低成本
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function CompareRow({ label, values, highlight }: { label: string; values: string[]; highlight?: boolean }) {
  return (
    <TableRow>
      <TableCell className={`text-xs ${highlight ? 'font-semibold' : ''}`}>{label}</TableCell>
      {values.map((v, i) => (
        <TableCell key={i} className={`text-xs text-center ${highlight ? 'font-semibold font-mono' : ''}`}>
          {v}
        </TableCell>
      ))}
    </TableRow>
  )
}
