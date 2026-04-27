'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { SegmentBreakdown } from '@/types/pricing-analysis'

interface CostBreakdownBarProps {
  breakdown: SegmentBreakdown
  pricingMode: 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c'
  revenue?: number
}

export function CostBreakdownBar({ breakdown, pricingMode, revenue }: CostBreakdownBarProps) {
  const isBCCombined = pricingMode === 'bc_combined'
  const isMultiB = pricingMode === 'multi_b'
  const isMultiBB2C = pricingMode === 'multi_b_b2c'

  const data = [
    {
      name: '成本拆解',
      'A段': round(breakdown.a),
      ...(isBCCombined
        ? { 'BC段': round(breakdown.bc ?? 0) }
        : isMultiB
        ? { 'B1段': round(breakdown.b), 'B2段': round(breakdown.b2 ?? 0), 'C段': round(breakdown.c) }
        : isMultiBB2C
        ? { 'B1段': round(breakdown.b), 'B2C段': round(breakdown.b2c ?? 0) }
        : { 'B段': round(breakdown.b), 'C段': round(breakdown.c) }),
      'D段': round(breakdown.d),
      ...(revenue ? { '收入': round(revenue) } : {}),
    },
  ]

  const segments = isBCCombined
    ? [
        { key: 'A段', color: '#6366f1' },
        { key: 'BC段', color: '#f59e0b' },
        { key: 'D段', color: '#ef4444' },
      ]
    : isMultiB
    ? [
        { key: 'A段', color: '#6366f1' },
        { key: 'B1段', color: '#2563eb' },
        { key: 'B2段', color: '#60a5fa' },
        { key: 'C段', color: '#f59e0b' },
        { key: 'D段', color: '#ef4444' },
      ]
    : isMultiBB2C
    ? [
        { key: 'A段', color: '#6366f1' },
        { key: 'B1段', color: '#2563eb' },
        { key: 'B2C段', color: '#14b8a6' },
        { key: 'D段', color: '#ef4444' },
      ]
    : [
        { key: 'A段', color: '#6366f1' },
        { key: 'B段', color: '#3b82f6' },
        { key: 'C段', color: '#f59e0b' },
        { key: 'D段', color: '#ef4444' },
      ]

  return (
    <div className="w-full h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [`HKD ${Number(value).toFixed(2)}`, String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {segments.map(({ key, color }) => (
            <Bar key={key} dataKey={key} stackId="cost" fill={color} />
          ))}
          {revenue && (
            <Bar dataKey="收入" fill="#22c55e" opacity={0.3} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function round(n: number) {
  return Math.round(n * 100) / 100
}
