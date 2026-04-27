'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface SaveBarProps {
  hasChanges: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}

export function SaveBar({ hasChanges, saving, onSave, onDiscard }: SaveBarProps) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border bg-background px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        {hasChanges && (
          <Badge variant="outline" className="border-amber-400 text-amber-600 text-xs">
            ● 有未儲存的變更
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {hasChanges && (
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
            取消變更
          </Button>
        )}
        <Button size="sm" onClick={onSave} disabled={!hasChanges || saving}>
          {saving ? '儲存中...' : '💾 儲存'}
        </Button>
      </div>
    </div>
  )
}
