'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { SensitivityPoint } from '@/types/pricing-analysis'

interface SensitivityChartProps {
  data: SensitivityPoint[]
  representativeWeight: number
}

export function SensitivityChart({ data, representativeWeight }: SensitivityChartProps) {
  const chartData = data.map((p) => ({
    weight: p.weight,
    margin: Math.round(p.margin * 1000) / 10, // to percentage with 1 decimal
    cost: Math.round(p.cost * 100) / 100,
    revenue: Math.round(p.revenue * 100) / 100,
  }))

  return (
    <div className="w-full h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="weight"
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${v}kg`}
            label={{ value: '重量 (KG)', position: 'insideBottom', offset: -2, fontSize: 11 }}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
            label={{ value: '毛利率', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => {
              const v = Number(value)
              const n = String(name)
              if (n === 'margin') return [`${v.toFixed(1)}%`, '毛利率']
              return [`HKD ${v.toFixed(2)}`, n === 'cost' ? '成本' : '收入']
            }}
            labelFormatter={(v: unknown) => `${v} KG`}
          />
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
          <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="3 3" opacity={0.5} />
          <ReferenceLine
            x={representativeWeight}
            stroke="#6366f1"
            strokeDasharray="3 3"
            label={{ value: '代表重量', fontSize: 10, fill: '#6366f1' }}
          />
          <Line
            type="monotone"
            dataKey="margin"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
