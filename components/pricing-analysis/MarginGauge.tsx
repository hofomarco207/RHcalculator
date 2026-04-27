'use client'

import { getMarginColorClass } from '@/lib/utils/margin'
import { getVerdictLabel } from '@/types/pricing-analysis'
import type { Verdict } from '@/types/pricing-analysis'

interface MarginGaugeProps {
  margin: number
  verdict: Verdict
  label?: string
}

export function MarginGauge({ margin, verdict, label }: MarginGaugeProps) {
  const pct = (margin * 100).toFixed(1)
  const colorClass = getMarginColorClass(margin)

  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
      <div className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 ${colorClass}`}>
        <span className="text-2xl font-bold tabular-nums">{pct}%</span>
      </div>
      <span className="text-xs text-muted-foreground">{getVerdictLabel(verdict)}</span>
    </div>
  )
}
