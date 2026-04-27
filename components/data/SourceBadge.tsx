import { Badge } from '@/components/ui/badge'

interface SourceBadgeProps {
  source: 'auto' | 'manual'
}

export function SourceBadge({ source }: SourceBadgeProps) {
  return source === 'auto' ? (
    <Badge variant="outline" className="border-blue-400 text-blue-600 text-[10px] px-1.5 py-0">
      自動
    </Badge>
  ) : (
    <Badge variant="outline" className="border-amber-400 text-amber-600 text-[10px] px-1.5 py-0">
      手動
    </Badge>
  )
}
