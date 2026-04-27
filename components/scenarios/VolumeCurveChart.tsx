'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { VolumeCurveData } from '@/lib/calculations/volume'

interface VolumeCurveChartProps {
  data: VolumeCurveData | null
  currentTickets: number
}

export function VolumeCurveChart({ data, currentTickets }: VolumeCurveChartProps) {
  if (!data || data.points.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">票量-成本曲線</CardTitle>
        <div className="flex flex-wrap gap-2 mt-1">
          {data.tierJumps.map((jump, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {jump.tickets.toLocaleString()}票 跳變 → 省 {jump.costDrop.toFixed(1)} HKD/票
            </Badge>
          ))}
          <Badge className="text-xs bg-green-600">
            最優門檻: {data.optimalMinTickets.toLocaleString()}+ 票/週
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.points} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="tickets"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => v >= 1000 ? `${v / 1000}K` : v}
                label={{ value: '週票量', position: 'insideBottom', offset: -2, fontSize: 10 }}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                label={{ value: 'HKD/票', angle: -90, position: 'insideLeft', fontSize: 10 }}
              />
              <Tooltip
                formatter={(value, name) => [
                  `${Number(value).toFixed(2)} HKD`,
                  name === 'costPerTicket' ? 'B+C 總成本' :
                  name === 'bCostPerTicket' ? 'B段' : 'C段',
                ]}
                labelFormatter={(v) => `${Number(v).toLocaleString()} 票/週`}
                contentStyle={{ fontSize: 11 }}
              />
              <Line
                type="stepAfter"
                dataKey="costPerTicket"
                stroke="#FF6B00"
                strokeWidth={2}
                dot={{ r: 2 }}
                name="costPerTicket"
              />
              <Line
                type="stepAfter"
                dataKey="bCostPerTicket"
                stroke="#f97316"
                strokeWidth={1}
                strokeDasharray="4 2"
                dot={false}
                name="bCostPerTicket"
              />
              <Line
                type="stepAfter"
                dataKey="cCostPerTicket"
                stroke="#a855f7"
                strokeWidth={1}
                strokeDasharray="4 2"
                dot={false}
                name="cCostPerTicket"
              />
              {/* Current volume marker */}
              <ReferenceLine
                x={currentTickets}
                stroke="#ef4444"
                strokeDasharray="3 3"
                label={{ value: '目前', position: 'top', fontSize: 10, fill: '#ef4444' }}
              />
              {/* Tier jump markers */}
              {data.tierJumps.map((jump, i) => (
                <ReferenceLine
                  key={i}
                  x={jump.tickets}
                  stroke="#22c55e"
                  strokeDasharray="2 2"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#FF6B00] inline-block" /> B+C 總成本</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block border-dashed" /> B段</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-400 inline-block" /> C段</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block border-dashed" /> 目前票量</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block" /> 階梯跳變</span>
        </div>
      </CardContent>
    </Card>
  )
}
