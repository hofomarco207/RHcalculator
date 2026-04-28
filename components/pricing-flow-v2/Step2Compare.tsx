'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import type { SlotDef, CompetitorGroup, GlobalRateCard, ScenarioCostCache } from '@/types/pricing-flow'
import { makeVerifyRows } from './utils'
import { CompareTable } from './CompareTable'

interface Props {
  slots: SlotDef[]
  groups: CompetitorGroup[]
  ownCards: GlobalRateCard[]
  twdPerHkd: number
  title?: string
  subtitle?: string
}

// Fixed verification weights as rows — constant, not derived from card brackets
const VERIFY_ROWS = makeVerifyRows()

export function Step2Compare({ slots, groups, ownCards, twdPerHkd, title, subtitle }: Props) {
  const activeSlots = slots.filter((s) => s.refId)

  // Build country list from the slot with the most countries
  const allCountryOptions = useMemo(() => {
    let best: Array<{ code: string; label: string }> = []
    for (const slot of activeSlots) {
      let opts: Array<{ code: string; label: string }> = []
      if (slot.source === 'competitor') {
        const g = groups.find((g) => g.groupKey === slot.refId)
        if (g) opts = g.countryOptions.map((o) => ({ code: o.code, label: o.labelZh }))
      } else if (slot.source === 'generated') {
        const card = ownCards.find((c) => c.id === slot.refId)
        if (card?.country_brackets) {
          opts = card.country_brackets.map((cb) => ({
            code: cb.country_code,
            label: cb.country_name_zh || cb.country_name_en,
          }))
        }
      }
      if (opts.length > best.length) best = opts
    }
    return best.sort((a, b) => a.label.localeCompare(b.label, 'zh-TW'))
  }, [activeSlots, groups, ownCards])

  const [country, setCountry] = useState('')
  const [scenarioCosts, setScenarioCosts] = useState<ScenarioCostCache>({})
  const [loadingCosts, setLoadingCosts] = useState(false)

  // Auto-select US, falling back to first available country
  useEffect(() => {
    if (allCountryOptions.length > 0 && !country) {
      const us = allCountryOptions.find((o) => o.code === 'US')
      setCountry(us?.code ?? allCountryOptions[0].code)
    }
  }, [allCountryOptions, country])

  const scenarioSlots = activeSlots.filter((s) => s.source === 'scenario')

  const fetchScenarioCosts = useCallback(async () => {
    if (!country || scenarioSlots.length === 0) return
    setLoadingCosts(true)
    const updates: ScenarioCostCache = { ...scenarioCosts }

    await Promise.all(
      scenarioSlots.map(async (slot) => {
        if (!slot.refId) return
        if (updates[slot.key]?.[country]) return  // already cached

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
    )

    setScenarioCosts(updates)
    setLoadingCosts(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, scenarioSlots, scenarioCosts])

  useEffect(() => {
    fetchScenarioCosts()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, activeSlots.map((s) => s.key).join(',')])

  if (activeSlots.length === 0) {
    return (
      <div className="space-y-3">
        <StepHeader title={title ?? '第 2 步：比對'} subtitle={subtitle} />
        <p className="text-sm text-muted-foreground py-8 text-center">請先在第 1 步選取至少一個價卡或方案</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <StepHeader title={title ?? '第 2 步：比對'} subtitle={subtitle} />

      {/* Country selector */}
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
      />
    </div>
  )
}

function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      {!subtitle && <p className="text-xs text-muted-foreground mt-0.5">選擇目的國，比對各方案在每個驗算重量的報價</p>}
    </div>
  )
}
