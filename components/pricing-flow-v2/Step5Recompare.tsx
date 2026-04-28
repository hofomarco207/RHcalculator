'use client'

import { useState, useEffect, useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import type { SlotDef, CompetitorGroup, GlobalRateCard, DraftCard, ScenarioCostCache } from '@/types/pricing-flow'
import { makeVerifyRows } from './utils'
import { CompareTable } from './CompareTable'

interface Props {
  slots: SlotDef[]
  groups: CompetitorGroup[]
  ownCards: GlobalRateCard[]
  draft: DraftCard
  twdPerHkd: number
}

const VERIFY_ROWS = makeVerifyRows()

export function Step5Recompare({ slots, groups, ownCards, draft, twdPerHkd }: Props) {
  const activeSlots = slots.filter((s) => s.refId)

  // Country list: draft countries (primary) + any extra from slots
  const allCountryOptions = useMemo(() => {
    const map = new Map<string, string>()
    draft.country_brackets.forEach((cb) => {
      map.set(cb.country_code, cb.country_name_zh || cb.country_name_en)
    })
    for (const slot of activeSlots) {
      if (slot.source === 'competitor') {
        const g = groups.find((g) => g.groupKey === slot.refId)
        g?.countryOptions.forEach((o) => map.set(o.code, o.labelZh))
      } else if (slot.source === 'generated') {
        const card = ownCards.find((c) => c.id === slot.refId)
        card?.country_brackets?.forEach((cb) => map.set(cb.country_code, cb.country_name_zh || cb.country_name_en))
      }
    }
    return [...map.entries()]
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-TW'))
  }, [activeSlots, groups, ownCards, draft])

  const [country, setCountry] = useState('')
  const [scenarioCosts, setScenarioCosts] = useState<ScenarioCostCache>({})
  const [loadingCosts, setLoadingCosts] = useState(false)

  useEffect(() => {
    if (allCountryOptions.length > 0 && !country) {
      const us = allCountryOptions.find((o) => o.code === 'US')
      setCountry(us?.code ?? allCountryOptions[0].code)
    }
  }, [allCountryOptions, country])

  const scenarioSlots = activeSlots.filter((s) => s.source === 'scenario')

  useEffect(() => {
    if (!country || scenarioSlots.length === 0) return
    setLoadingCosts(true)
    const updates: ScenarioCostCache = { ...scenarioCosts }

    Promise.all(
      scenarioSlots.map(async (slot) => {
        if (!slot.refId || updates[slot.key]?.[country]) return
        try {
          const res = await fetch('/api/pricing-flow/batch-costs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scenario_id: slot.refId,
              countries: [{ country_code: country, brackets: VERIFY_ROWS }],
            }),
          })
          if (!res.ok) return
          const data = await res.json()
          const result = data.results?.[0]
          const costs: Record<string, number | null> = {}
          ;(result?.bracket_costs ?? []).forEach((bc: { label: string; cost_hkd: number | null }) => {
            costs[bc.label] = bc.cost_hkd
          })
          updates[slot.key] = { ...updates[slot.key], [country]: costs }
        } catch { /* non-fatal */ }
      }),
    ).then(() => {
      setScenarioCosts(updates)
      setLoadingCosts(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, activeSlots.map((s) => s.key).join(',')])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">第 5 步：再比對</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          將新生成的價卡插入，與原有方案再次橫向對比
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Label className="text-xs shrink-0">目的國</Label>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="選擇目的國…" />
          </SelectTrigger>
          <SelectContent>
            {allCountryOptions.map((c) => (
              <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loadingCosts && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <Badge variant="default" className="text-[10px]">新價卡已插入</Badge>
      </div>

      <CompareTable
        slots={activeSlots}
        activeSlots={activeSlots}
        groups={groups}
        ownCards={ownCards}
        country={country}
        rows={VERIFY_ROWS}
        scenarioCosts={Object.fromEntries(
          Object.entries(scenarioCosts).map(([k, v]) => [k, v[country] ?? {}])
        )}
        twdPerHkd={twdPerHkd}
        draftCard={draft}
      />
    </div>
  )
}
