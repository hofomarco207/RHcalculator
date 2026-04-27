'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Camera, Loader2, GitCompare } from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

interface VersionInfo {
  version: number
  valid_from: string | null
  valid_to: string | null
  is_current: boolean
  count: number
  created_at: string | null
}

interface RateVersionBarProps {
  vendorId: string
  table: string
  /** Called after "New Version" is clicked and confirmed */
  onNewVersion?: () => void
  /** Trigger refetch of version data */
  refreshKey?: number
  /**
   * Called when "📸 存成新版本" is clicked. Returns a promise that resolves
   * once the snapshot write has completed. When provided, renders a snapshot
   * button that bumps the active version on the current state.
   */
  onSnapshot?: () => Promise<void>
  /**
   * Called when "版本比較" is clicked. When provided, renders a compare
   * button that's only enabled when there are ≥2 versions.
   */
  onCompare?: () => void
}

export function RateVersionBar({
  vendorId,
  table,
  onNewVersion,
  refreshKey,
  onSnapshot,
  onCompare,
}: RateVersionBarProps) {
  const t = useT()
  const [versions, setVersions] = useState<VersionInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [snapshotting, setSnapshotting] = useState(false)

  const fetchVersions = useCallback(async () => {
    if (!vendorId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/vendors/${vendorId}/rate-versions?table=${table}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) setVersions(data)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [vendorId, table])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions, refreshKey])

  const currentVersion = versions.find((v) => v.is_current || v.valid_to === null)
  const hasHistory = versions.length > 1

  if (versions.length === 0 && !loading) return null

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      {currentVersion && (
        <Badge variant="secondary" className="font-mono text-xs">
          v{currentVersion.version}
        </Badge>
      )}
      {currentVersion?.valid_from && (
        <span className="text-muted-foreground">
          {t.pages.vendors.validFrom}: {currentVersion.valid_from}
        </span>
      )}
      {currentVersion && (
        <span className="text-muted-foreground">
          ({currentVersion.count} {t.pages.vendors.records})
        </span>
      )}

      {onCompare && hasHistory && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onCompare}
        >
          <GitCompare className="h-3 w-3 mr-1" />
          版本比較
        </Button>
      )}

      {onNewVersion && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onNewVersion}
        >
          + {t.pages.vendors.newVersion}
        </Button>
      )}

      {onSnapshot && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={snapshotting}
          onClick={async () => {
            setSnapshotting(true)
            try {
              await onSnapshot()
              toast.success('已存成新版本')
              await fetchVersions()
            } catch (err) {
              toast.error(err instanceof Error ? err.message : '存版失敗')
            } finally {
              setSnapshotting(false)
            }
          }}
        >
          {snapshotting ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Camera className="h-3 w-3 mr-1" />
          )}
          存成新版本
        </Button>
      )}
    </div>
  )
}
