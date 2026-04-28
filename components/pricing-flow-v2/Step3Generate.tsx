'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Sparkles } from 'lucide-react'
import type { SlotDef, CompetitorGroup, GlobalRateCard, DraftCard, DraftCountryBrackets, GenMode } from '@/types/pricing-flow'
import {
  draftFromCompetitorCard, draftFromOwnCard, draftFromScenarioCosts,
  getBracketRows, makeBracketLabel,
} from './utils'

interface Props {
  slots: SlotDef[]
  groups: CompetitorGroup[]
  ownCards: GlobalRateCard[]
  twdPerHkd: number
  onDraftReady: (draft: DraftCard) => void
}

export function Step3Generate({ slots, groups, ownCards, twdPerHkd, onDraftReady }: Props) {
  const activeSlots = slots.filter((s) => s.refId)
  const [basisSlotKey, setBasisSlotKey] = useState<string>('')
  const [adjPct, setAdjPct] = useState<number>(0)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const basisSlot = activeSlots.find((s) => s.key === basisSlotKey) ?? null
  const genMode: GenMode | null = basisSlot
    ? basisSlot.source === 'competitor' ? 'battle'
    : basisSlot.source === 'generated' ? 'adjust'
    : 'cost'
    : null

  // Countries to generate: union of all selected card countries
  const allCountries = useMemo(() => {
    const map = new Map<string, { code: string; nameEn: string; nameZh?: string }>()
    for (const slot of activeSlots) {
      if (slot.source === 'competitor') {
        const g = groups.find((g) => g.groupKey === slot.refId)
        if (g) g.countryOptions.forEach((opt) => {
          const card = g.cardsByCountry[opt.code]
          if (card) map.set(opt.code, { code: opt.code, nameEn: card.country_name_en, nameZh: card.country_name_zh ?? undefined })
        })
      } else if (slot.source === 'generated') {
        const card = ownCards.find((c) => c.id === slot.refId)
        card?.country_brackets?.forEach((cb) => {
          map.set(cb.country_code, { code: cb.country_code, nameEn: cb.country_name_en, nameZh: cb.country_name_zh ?? undefined })
        })
      }
    }
    return [...map.values()].sort((a, b) => (a.nameZh ?? a.nameEn).localeCompare(b.nameZh ?? b.nameEn, 'zh-TW'))
  }, [activeSlots, groups, ownCards])

  const modeLabel: Record<GenMode, string> = {
    battle: '戰價：以競對為基準，調整我的價格',
    adjust: '調價：以現行價卡為基準，全局漲降',
    cost: '成本定價：以成本方案為基準，Mark up 利潤',
  }

  const adjLabel: Record<GenMode, string> = {
    battle: '比競對貴/便宜 (%)',
    adjust: '全局漲/降 (%)',
    cost: 'Mark up (%)',
  }

  async function handleGenerate() {
    if (!basisSlot || !basisSlot.refId) return
    setGenerating(true)
    setError(null)

    try {
      let draft: DraftCard

      if (genMode === 'battle') {
        const g = groups.find((gr) => gr.groupKey === basisSlot.refId)
        if (!g) throw new Error('找不到競對價卡')
        const country_brackets: DraftCountryBrackets[] = g.countryOptions.map((opt) => {
          const card = g.cardsByCountry[opt.code]
          if (!card) return null
          return {
            country_code: opt.code,
            country_name_en: card.country_name_en,
            country_name_zh: card.country_name_zh ?? undefined,
            brackets: draftFromCompetitorCard(card, adjPct / 100, g.currency, twdPerHkd),
          }
        }).filter((x): x is NonNullable<typeof x> => x !== null)
        draft = { product_name: '', product_code: '', currency: 'TWD', country_brackets }

      } else if (genMode === 'adjust') {
        const card = ownCards.find((c) => c.id === basisSlot.refId)
        if (!card?.country_brackets) throw new Error('找不到已生成價卡')
        const country_brackets: DraftCountryBrackets[] = card.country_brackets.map((cb) => ({
          country_code: cb.country_code,
          country_name_en: cb.country_name_en,
          country_name_zh: cb.country_name_zh ?? undefined,
          brackets: draftFromOwnCard(cb.brackets, adjPct / 100, card.currency, twdPerHkd),
        }))
        draft = { product_name: '', product_code: '', currency: 'TWD', country_brackets }

      } else {
        // scenario basis: fetch batch costs for all countries
        // Use a standard bracket template from the first selected non-scenario card
        const refSlot = activeSlots.find((s) => s.source !== 'scenario')
        const bracketTemplate = refSlot
          ? getBracketRows([refSlot], groups, ownCards, allCountries[0]?.code ?? '')
          : []

        if (bracketTemplate.length === 0) throw new Error('無法確定重量區間，請先選取競對或已生成價卡')

        const countriesReq = allCountries.map((c) => ({
          country_code: c.code,
          brackets: bracketTemplate,
        }))

        const res = await fetch('/api/pricing-flow/batch-costs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario_id: basisSlot.refId, countries: countriesReq }),
        })
        if (!res.ok) throw new Error('成本計算失敗')
        const { results } = await res.json()

        const country_brackets: DraftCountryBrackets[] = results.map((r: {
          country_code: string
          bracket_costs: Array<{ label: string; cost_hkd: number | null }>
        }) => {
          const info = allCountries.find((c) => c.code === r.country_code)
          const costsHkd = bracketTemplate.map((b, i) => r.bracket_costs[i]?.cost_hkd ?? null)
          return {
            country_code: r.country_code,
            country_name_en: info?.nameEn ?? r.country_code,
            country_name_zh: info?.nameZh,
            brackets: draftFromScenarioCosts(bracketTemplate, costsHkd, adjPct / 100, twdPerHkd),
          }
        })
        draft = { product_name: '', product_code: '', currency: 'TWD', country_brackets }
      }

      onDraftReady(draft)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失敗')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">第 3 步：生成</h2>
        <p className="text-xs text-muted-foreground mt-0.5">選擇定價基準，設定調整幅度</p>
      </div>

      {activeSlots.length === 0 && (
        <p className="text-sm text-muted-foreground">請先在第 1 步選取至少一個價卡或方案</p>
      )}

      {/* Basis selector */}
      <div className="space-y-2">
        <Label className="text-sm">選擇定價基準</Label>
        <RadioGroup value={basisSlotKey} onValueChange={setBasisSlotKey}>
          <div className="grid gap-2">
            {activeSlots.map((slot) => (
              <label
                key={slot.key}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors
                  ${basisSlotKey === slot.key ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              >
                <RadioGroupItem value={slot.key} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{slot.label}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {slot.source === 'competitor' ? '競對' : slot.source === 'generated' ? '現行卡' : '成本'}
                    </Badge>
                  </div>
                  {basisSlotKey === slot.key && genMode && (
                    <p className="text-xs text-muted-foreground mt-0.5">{modeLabel[genMode]}</p>
                  )}
                </div>
              </label>
            ))}
          </div>
        </RadioGroup>
      </div>

      {/* Adjustment input */}
      {genMode && (
        <div className="space-y-2">
          <Label className="text-sm">{adjLabel[genMode]}</Label>
          <div className="flex items-center gap-3 max-w-xs">
            <Input
              type="number"
              step={0.1}
              value={adjPct}
              onChange={(e) => setAdjPct(parseFloat(e.target.value) || 0)}
              className="w-32 text-sm"
              placeholder="0"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {genMode === 'battle' && '負數 = 比競對便宜，正數 = 比競對貴'}
            {genMode === 'adjust' && '負數 = 降價，正數 = 漲價'}
            {genMode === 'cost' && '例如輸入 25，表示在成本上 Mark up 25%'}
          </p>
          {genMode === 'cost' && (
            <p className="text-xs text-muted-foreground">
              涵蓋國家：{allCountries.length} 個（根據第 1 步所選價卡/方案的服務範圍）
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button
        onClick={handleGenerate}
        disabled={!basisSlot || generating}
        className="gap-2"
      >
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {generating ? '生成中…' : '生成初步價卡'}
      </Button>
    </div>
  )
}
