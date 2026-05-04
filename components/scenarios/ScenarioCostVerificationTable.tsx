'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  CostTooltip,
  scenarioSegATooltip,
  scenarioSegBTooltip,
  scenarioSegCTooltip,
  scenarioSegBCTooltip,
  scenarioSegDTooltip,
} from '@/components/rate-card/CostTooltip'
import { useExchangeRates } from '@/lib/context/exchange-rate-context'
import type { BracketCost } from '@/types/scenario'
import { invalidSegments, isCostValid, type PricingMode } from '@/lib/utils/cost-validation'

interface ScenarioCostVerificationTableProps {
  costs: BracketCost[]
  pricingMode?: PricingMode
}

// All displayed values are converted from internal HKD → TWD for the user.
function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals)
}

const INVALID_CELL = 'text-red-500 font-semibold'
const INVALID_UNDERLINE = 'cursor-help border-b border-dotted border-red-500'
const OK_UNDERLINE = 'cursor-help border-b border-dotted border-muted-foreground/40'

export function ScenarioCostVerificationTable({ costs, pricingMode }: ScenarioCostVerificationTableProps) {
  const { rates } = useExchangeRates()
  // Convert internal HKD costs → TWD for display. Fallback to 1/0.244 if rate missing.
  const twdPerHkd = rates.twd_hkd ? 1 / rates.twd_hkd : 4.098

  if (!costs || costs.length === 0) return null

  // Detect mode from data when prop not provided
  const isBCCombined = pricingMode === 'bc_combined'
    || (!pricingMode && costs.some((b) => b.seg_bc != null && b.detail?.seg_bc != null))
  const isBCDCombined = pricingMode === 'bcd_combined'
  const resolvedMode: PricingMode =
    pricingMode ??
    (isBCDCombined ? 'bcd_combined'
      : isBCCombined ? 'bc_combined'
      : 'segmented')

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">成本驗算表 <span className="text-xs text-muted-foreground font-normal">(TWD)</span></h3>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60">
              <TableHead className="w-20 text-center font-medium">KG</TableHead>
              <TableHead className="text-center font-medium text-blue-500">A段 攬收</TableHead>
              {isBCDCombined ? (
                <TableHead className="text-center font-medium text-teal-500">BCD 全段</TableHead>
              ) : isBCCombined ? (
                <TableHead className="text-center font-medium text-teal-500">BC 空運+清關</TableHead>
              ) : (
                <>
                  <TableHead className="text-center font-medium text-orange-500">B段 空運</TableHead>
                  <TableHead className="text-center font-medium text-purple-500">C段 清關</TableHead>
                </>
              )}
              {!isBCDCombined && (
                <TableHead className="text-center font-medium text-green-500">D段 尾程</TableHead>
              )}
              <TableHead className="text-center font-medium text-amber-600">總成本</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {costs.map((b, i) => {
              const w = b.representative_weight_kg
              const detail = b.detail
              const invalids = new Set(invalidSegments(b, resolvedMode))
              const valid = isCostValid(b, resolvedMode)
              const bad = (k: string) => invalids.has(k as never)

              return (
                <TableRow key={w} className={i % 2 === 1 ? 'bg-muted/10' : ''}>
                  <TableCell className="text-center font-mono text-xs font-semibold">{w}</TableCell>

                  {/* A段 */}
                  <TableCell className={`text-center font-mono text-xs ${bad('seg_a') ? INVALID_CELL : ''}`}>
                    <CostTooltip
                      content={detail
                        ? scenarioSegATooltip(detail.seg_a, b.seg_a, twdPerHkd, 'TWD')
                        : <span>{fmt(b.seg_a * twdPerHkd)} TWD</span>
                      }
                    >
                      <span className={bad('seg_a') ? INVALID_UNDERLINE : OK_UNDERLINE}>
                        {fmt(b.seg_a * twdPerHkd)}
                      </span>
                    </CostTooltip>
                  </TableCell>

                  {isBCDCombined ? (
                    /* BCD 全段 — cost stored in seg_d */
                    <TableCell className={`text-center font-mono text-xs ${bad('seg_d') ? INVALID_CELL : ''}`}>
                      <CostTooltip
                        content={detail
                          ? scenarioSegDTooltip(detail.seg_d, b.seg_d, twdPerHkd, 'TWD')
                          : <span>{fmt(b.seg_d * twdPerHkd)} TWD</span>
                        }
                      >
                        <span className={bad('seg_d') ? INVALID_UNDERLINE : OK_UNDERLINE}>
                          {fmt(b.seg_d * twdPerHkd)}
                        </span>
                      </CostTooltip>
                    </TableCell>
                  ) : isBCCombined ? (
                    /* BC 合併 */
                    <TableCell className={`text-center font-mono text-xs ${bad('seg_bc') ? INVALID_CELL : ''}`}>
                      <CostTooltip
                        content={detail?.seg_bc
                          ? scenarioSegBCTooltip(detail.seg_bc, b.seg_bc ?? 0, twdPerHkd, 'TWD')
                          : <><span className="text-teal-400 font-semibold">BC 空運+清關</span>{'\n'}<span className="text-amber-400">= {fmt((b.seg_bc ?? 0) * twdPerHkd)} TWD</span></>
                        }
                      >
                        <span className={bad('seg_bc') ? INVALID_UNDERLINE : OK_UNDERLINE}>
                          {fmt((b.seg_bc ?? 0) * twdPerHkd)}
                        </span>
                      </CostTooltip>
                    </TableCell>
                  ) : (
                    <>
                      {/* B段 */}
                      <TableCell className={`text-center font-mono text-xs ${bad('seg_b') ? INVALID_CELL : ''}`}>
                        <CostTooltip
                          content={detail
                            ? scenarioSegBTooltip(detail.seg_b, b.seg_b, undefined, twdPerHkd, 'TWD')
                            : <span>{fmt(b.seg_b * twdPerHkd)} TWD</span>
                          }
                        >
                          <span className={bad('seg_b') ? INVALID_UNDERLINE : OK_UNDERLINE}>
                            {fmt(b.seg_b * twdPerHkd)}
                          </span>
                        </CostTooltip>
                      </TableCell>
                      {/* C段 */}
                      <TableCell className={`text-center font-mono text-xs ${bad('seg_c') ? INVALID_CELL : ''}`}>
                        <CostTooltip
                          content={detail
                            ? scenarioSegCTooltip(detail.seg_c, b.seg_c, twdPerHkd, 'TWD')
                            : <span>{fmt(b.seg_c * twdPerHkd)} TWD</span>
                          }
                        >
                          <span className={bad('seg_c') ? INVALID_UNDERLINE : OK_UNDERLINE}>
                            {fmt(b.seg_c * twdPerHkd)}
                          </span>
                        </CostTooltip>
                      </TableCell>
                    </>
                  )}

                  {/* D段 — not shown for bcd_combined (already in BCD column) */}
                  {!isBCDCombined && (
                    <TableCell className={`text-center font-mono text-xs ${bad('seg_d') ? INVALID_CELL : ''}`}>
                      <CostTooltip
                        content={detail
                          ? scenarioSegDTooltip(detail.seg_d, b.seg_d, twdPerHkd, 'TWD')
                          : <span>{fmt(b.seg_d * twdPerHkd)} TWD</span>
                        }
                      >
                        <span className={bad('seg_d') ? INVALID_UNDERLINE : OK_UNDERLINE}>
                          {fmt(b.seg_d * twdPerHkd)}
                        </span>
                      </CostTooltip>
                    </TableCell>
                  )}

                  {/* 總成本 */}
                  <TableCell className="text-center font-mono text-xs font-semibold">
                    {valid ? fmt(b.cost_hkd * twdPerHkd) : <span className="text-red-500">計算錯誤</span>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">hover 各欄位可查看計算公式</p>
    </div>
  )
}
