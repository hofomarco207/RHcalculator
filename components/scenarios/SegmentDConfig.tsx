'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CompetitorGroup {
  key: string // `${competitor_name}||${service_code}`
  competitor_name: string
  service_code: string
  label: string  // vendor_label or fallback
  country_count: number
  version: number | null
  valid_from: string | null   // YYYY-MM-DD
}

interface SegmentDConfigProps {
  selectedCompetitorKey?: string   // `${competitor_name}||${service_code}` or ''
  onCompetitorChange: (competitorName: string, serviceCode: string) => void
}

export function SegmentDConfig({
  selectedCompetitorKey,
  onCompetitorChange,
}: SegmentDConfigProps) {
  const [groups, setGroups] = useState<CompetitorGroup[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch('/api/competitor-rate-cards?is_current=true')
      .then((r) => r.json())
      .then((rows: Array<{
        competitor_name: string
        service_code: string
        vendor_label?: string | null
        country_code?: string | null
        country_name_en?: string | null
        version?: number | null
        valid_from?: string | null
        created_at?: string | null
      }>) => {
        if (!Array.isArray(rows)) return
        // Group by (competitor_name, service_code)
        const map = new Map<string, CompetitorGroup>()
        for (const row of rows) {
          const key = `${row.competitor_name}||${row.service_code}`
          if (!map.has(key)) {
            map.set(key, {
              key,
              competitor_name: row.competitor_name,
              service_code: row.service_code,
              label: row.vendor_label?.trim() || `${row.competitor_name} ${row.service_code}`,
              country_count: 0,
              version: row.version ?? null,
              // Prefer explicit valid_from, fall back to created_at if absent
              valid_from: (row.valid_from ?? row.created_at ?? null)?.slice(0, 10) ?? null,
            })
          }
          // Count by country_name_en (country_code may be null after import validation)
          if (row.country_name_en || row.country_code) {
            map.get(key)!.country_count++
          }
        }
        setGroups([...map.values()])
      })
      .catch(() => setGroups([]))
      .finally(() => setLoading(false))
  }, [])

  const selected = groups.find((g) => g.key === selectedCompetitorKey)

  function handleChange(key: string) {
    const g = groups.find((gr) => gr.key === key)
    if (g) onCompetitorChange(g.competitor_name, g.service_code)
  }

  return (
    <div className="space-y-3">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        D 段（尾程）
      </Label>

      <div className="space-y-1">
        <Label className="text-xs">選擇尾程價卡</Label>
        <Select
          value={selectedCompetitorKey ?? ''}
          onValueChange={handleChange}
          disabled={loading}
        >
          <SelectTrigger>
            <SelectValue placeholder={loading ? '載入中…' : '選擇競對價卡'} />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.key} value={g.key}>
                {g.label}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({g.country_count} 國)
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        <p className="text-xs text-muted-foreground">
          定價模型：<span className="font-medium">按重量階梯</span>
          ｜來源：{selected.competitor_name} {selected.service_code}
          {(selected.version != null || selected.valid_from) && (
            <>
              {' '}｜版本：
              {selected.version != null && <span className="font-medium">v{selected.version}</span>}
              {selected.valid_from && (
                <span className="ml-1">({selected.valid_from})</span>
              )}
            </>
          )}
        </p>
      )}
    </div>
  )
}
