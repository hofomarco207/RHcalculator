import * as XLSX from 'xlsx'
import type { ScenarioResults } from '@/types/scenario'

interface ExportScenario {
  id: string
  name: string
  weekly_tickets: number
  vendor_b_name: string | null
  vendor_c_name: string | null
  vendor_d_name: string | null
  results: ScenarioResults | null
}

/**
 * Export scenario comparison to a multi-sheet Excel file.
 */
export function exportScenarioComparison(scenarios: ExportScenario[]) {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Overview ─────────────────────────────────────────────
  const overviewData = [
    ['方案比較報表', '', ...scenarios.map(() => '')],
    ['匯出時間', new Date().toLocaleString('zh-TW')],
    [],
    ['指標', ...scenarios.map((s) => s.name)],
    ['週票量', ...scenarios.map((s) => s.weekly_tickets ?? '')],
    ['B段 供應商', ...scenarios.map((s) => s.vendor_b_name ?? '—')],
    ['C段 供應商', ...scenarios.map((s) => s.vendor_c_name ?? '—')],
    ['D段 供應商', ...scenarios.map((s) => s.vendor_d_name ?? '—')],
    ['口岸分配', ...scenarios.map((s) => {
      const alloc = s.results?.gateway_allocation
      if (!alloc) return '—'
      return Object.entries(alloc)
        .filter(([, p]) => p > 0)
        .map(([gw, p]) => `${gw} ${Math.round(Number(p) * 100)}%`)
        .join(' / ')
    })],
    ['平均每票成本 (HKD)', ...scenarios.map((s) =>
      s.results ? Math.round(s.results.avg_cost_per_ticket * 100) / 100 : '—'
    )],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(overviewData)
  XLSX.utils.book_append_sheet(wb, ws1, '概覽')

  // ── Sheet 2: Cost by Bracket ──────────────────────────────────────
  const brackets = scenarios[0]?.results?.cost_per_bracket ?? []
  const bracketHeaders = ['重量區間']
  for (const sc of scenarios) {
    bracketHeaders.push(`${sc.name} 總成本`, `${sc.name} A段`, `${sc.name} B段`, `${sc.name} C段`, `${sc.name} D段`)
  }

  const bracketData: (string | number)[][] = [bracketHeaders]
  for (const b of brackets) {
    const row: (string | number)[] = [b.weight_range]
    for (const sc of scenarios) {
      const scb = sc.results?.cost_per_bracket?.find((x) => x.weight_range === b.weight_range)
      if (scb) {
        row.push(
          Math.round(scb.cost_hkd * 100) / 100,
          Math.round(scb.seg_a * 100) / 100,
          Math.round(scb.seg_b * 100) / 100,
          Math.round(scb.seg_c * 100) / 100,
          Math.round(scb.seg_d * 100) / 100
        )
      } else {
        row.push('—', '—', '—', '—', '—')
      }
    }
    bracketData.push(row)
  }
  const ws2 = XLSX.utils.aoa_to_sheet(bracketData)
  XLSX.utils.book_append_sheet(wb, ws2, '成本明細')

  // ── Sheet 3: Volume Analysis ──────────────────────────────────────
  const volHeaders = ['週票量']
  for (const sc of scenarios) {
    volHeaders.push(`${sc.name} B+C成本`)
  }

  // Collect all ticket points from all scenarios
  const allPoints = new Set<number>()
  for (const sc of scenarios) {
    const vc = (sc.results as unknown as Record<string, unknown>)?.volume_curve as { points?: Array<{ tickets: number }> }
    vc?.points?.forEach((p) => allPoints.add(p.tickets))
  }
  const sortedPoints = [...allPoints].sort((a, b) => a - b)

  const volData: (string | number)[][] = [volHeaders]
  for (const tickets of sortedPoints) {
    const row: (string | number)[] = [tickets]
    for (const sc of scenarios) {
      const vc = (sc.results as unknown as Record<string, unknown>)?.volume_curve as { points?: Array<{ tickets: number; costPerTicket: number }> }
      const point = vc?.points?.find((p) => p.tickets === tickets)
      row.push(point ? Math.round(point.costPerTicket * 100) / 100 : '—')
    }
    volData.push(row)
  }
  const ws3 = XLSX.utils.aoa_to_sheet(volData)
  XLSX.utils.book_append_sheet(wb, ws3, '票量分析')

  // ── Download ──────────────────────────────────────────────────────
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `方案比較_${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export a single scenario's results.
 */
export function exportSingleScenario(name: string, results: ScenarioResults) {
  const wb = XLSX.utils.book_new()

  // Cost breakdown
  const data = [
    ['方案：' + name],
    ['計算時間', results.computed_at],
    ['平均每票成本 (HKD)', Math.round(results.avg_cost_per_ticket * 100) / 100],
    [],
    ['重量區間', 'A段 攬收', 'B段 空運', 'C段 清關', 'D段 尾程', '總成本'],
    ...results.cost_per_bracket.map((b) => [
      b.weight_range,
      Math.round(b.seg_a * 100) / 100,
      Math.round(b.seg_b * 100) / 100,
      Math.round(b.seg_c * 100) / 100,
      Math.round(b.seg_d * 100) / 100,
      Math.round(b.cost_hkd * 100) / 100,
    ]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, '成本明細')

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}_${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
