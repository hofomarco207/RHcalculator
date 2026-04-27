'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'

interface VersionInfo {
  version: number
  valid_from: string | null
  valid_to: string | null
  is_current: boolean
  count: number
  created_at: string | null
}

interface VendorVersionInlineProps {
  vendorId?: string
  /** Rate table name, e.g. "vendor_b_rates". If null/undefined, nothing renders. */
  table?: string | null
  refreshKey?: number
}

/**
 * Compact one-line version indicator: `v2 · 2026-04-15 · 26 筆`
 * Shown above vendor selectors in scenario segment configs.
 */
export function VendorVersionInline({ vendorId, table, refreshKey }: VendorVersionInlineProps) {
  const [versions, setVersions] = useState<VersionInfo[]>([])

  useEffect(() => {
    if (!vendorId || !table) { setVersions([]); return }
    fetch(`/api/vendors/${vendorId}/rate-versions?table=${table}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setVersions(d) })
      .catch(() => setVersions([]))
  }, [vendorId, table, refreshKey])

  if (!vendorId || !table || versions.length === 0) return null
  const current = versions.find((v) => v.is_current || v.valid_to === null) ?? versions[0]
  if (!current) return null

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
      <Badge variant="secondary" className="font-mono h-4 px-1.5 text-[10px]">
        v{current.version}
      </Badge>
      {current.valid_from && <span>更新 {current.valid_from}</span>}
      <span>· {current.count} 筆</span>
    </div>
  )
}
