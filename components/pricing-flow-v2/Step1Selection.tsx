'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import type { SlotDef, SlotKey, CompetitorGroup, GlobalRateCard } from '@/types/pricing-flow'

interface ScenarioOption { id: string; name: string }

interface Props {
  slots: SlotDef[]
  groups: CompetitorGroup[]
  ownCards: GlobalRateCard[]
  scenarios: ScenarioOption[]
  onChange: (slots: SlotDef[]) => void
}

type SectionConfig = {
  source: SlotDef['source']
  title: string
  subtitle: string
  keys: [SlotKey, SlotKey]
}

const SECTIONS: SectionConfig[] = [
  { source: 'competitor', title: '競對價卡', subtitle: '最多選 2 張', keys: ['c0', 'c1'] },
  { source: 'generated',  title: '已生成價卡', subtitle: '最多選 2 張', keys: ['g0', 'g1'] },
  { source: 'scenario',   title: '成本方案', subtitle: '最多選 2 個', keys: ['s0', 's1'] },
]

export function Step1Selection({ slots, groups, ownCards, scenarios, onChange }: Props) {
  function getSlot(key: SlotKey): SlotDef {
    return slots.find((s) => s.key === key) ?? { key, source: key[0] === 'c' ? 'competitor' : key[0] === 'g' ? 'generated' : 'scenario', refId: null, label: '' }
  }

  function setSlot(key: SlotKey, refId: string | null, label: string) {
    const source: SlotDef['source'] = key[0] === 'c' ? 'competitor' : key[0] === 'g' ? 'generated' : 'scenario'
    const updated = slots.filter((s) => s.key !== key)
    if (refId) updated.push({ key, source, refId, label })
    onChange(updated)
  }

  const activeCount = slots.filter((s) => s.refId).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">第 1 步：選對標</h2>
          <p className="text-xs text-muted-foreground mt-0.5">選擇要橫向比對的價卡或方案（共最多 6 個）</p>
        </div>
        <Badge variant="outline">{activeCount} / 6 已選</Badge>
      </div>

      <div className="grid gap-4">
        {SECTIONS.map((sec) => (
          <div key={sec.source} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{sec.title}</p>
                <p className="text-xs text-muted-foreground">{sec.subtitle}</p>
              </div>
              {sec.source === 'competitor' && (
                <Badge variant="secondary" className="text-[10px]">{groups.length} 組可選</Badge>
              )}
              {sec.source === 'generated' && (
                <Badge variant="secondary" className="text-[10px]">{ownCards.length} 張可選</Badge>
              )}
              {sec.source === 'scenario' && (
                <Badge variant="secondary" className="text-[10px]">{scenarios.length} 個可選</Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sec.keys.map((key) => {
                const slot = getSlot(key)
                return (
                  <SlotSelector
                    key={key}
                    slotKey={key}
                    slot={slot}
                    source={sec.source}
                    groups={groups}
                    ownCards={ownCards}
                    scenarios={scenarios}
                    slots={slots}
                    onSelect={(refId, label) => setSlot(key, refId, label)}
                    onClear={() => setSlot(key, null, '')}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Individual slot selector ─────────────────────────────────────────────────

interface SlotSelectorProps {
  slotKey: SlotKey
  slot: SlotDef
  source: SlotDef['source']
  groups: CompetitorGroup[]
  ownCards: GlobalRateCard[]
  scenarios: ScenarioOption[]
  slots: SlotDef[]
  onSelect: (refId: string, label: string) => void
  onClear: () => void
}

function SlotSelector({ slotKey, slot, source, groups, ownCards, scenarios, slots, onSelect, onClear }: SlotSelectorProps) {
  // Determine already-selected refIds for this source to avoid duplicates
  const usedRefIds = slots
    .filter((s) => s.source === source && s.key !== slotKey && s.refId)
    .map((s) => s.refId!)

  const isEmpty = !slot.refId

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <Select
          value={slot.refId ?? ''}
          onValueChange={(v) => {
            if (!v) return
            let label = v
            if (source === 'competitor') label = groups.find((g) => g.groupKey === v)?.label ?? v
            else if (source === 'generated') label = ownCards.find((c) => c.id === v)?.product_name ?? v
            else label = scenarios.find((s) => s.id === v)?.name ?? v
            onSelect(v, label)
          }}
        >
          <SelectTrigger className={`h-8 text-xs ${isEmpty ? 'text-muted-foreground border-dashed' : ''}`}>
            <SelectValue placeholder="— 點擊選取 —" />
          </SelectTrigger>
          <SelectContent>
            {source === 'competitor' && groups.map((g) => (
              <SelectItem key={g.groupKey} value={g.groupKey} disabled={usedRefIds.includes(g.groupKey)}>
                <div className="flex items-center gap-1.5">
                  <span>{g.label}</span>
                  <span className="text-muted-foreground text-[10px]">({Object.keys(g.cardsByCountry).length} 國)</span>
                </div>
              </SelectItem>
            ))}
            {source === 'generated' && ownCards.map((c) => (
              <SelectItem key={c.id} value={c.id!} disabled={usedRefIds.includes(c.id!)}>
                <div className="flex items-center gap-1.5">
                  <span>{c.product_name}</span>
                  <span className="text-muted-foreground text-[10px]">{c.product_code}</span>
                </div>
              </SelectItem>
            ))}
            {source === 'scenario' && scenarios.map((s) => (
              <SelectItem key={s.id} value={s.id} disabled={usedRefIds.includes(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!isEmpty && (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
