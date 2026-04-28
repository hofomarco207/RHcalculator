'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronRight, ChevronLeft, Loader2 } from 'lucide-react'
import { useExchangeRates } from '@/lib/context/exchange-rate-context'
import { buildCompetitorGroups } from './utils'
import { Step1Selection } from './Step1Selection'
import { Step2Compare } from './Step2Compare'
import { Step3Generate } from './Step3Generate'
import { Step4Finetune } from './Step4Finetune'
import { Step5Recompare } from './Step5Recompare'
import { Step6Output } from './Step6Output'
import type { SlotDef, CompetitorGroup, DraftCard } from '@/types/pricing-flow'
import type { GlobalRateCard } from '@/types'
import type { CompetitorRateCard } from '@/types/pricing-analysis'

const STEPS = [
  { label: '選對標', short: '1' },
  { label: '比對',   short: '2' },
  { label: '生成',   short: '3' },
  { label: '微調',   short: '4' },
  { label: '再比對', short: '5' },
  { label: '輸出',   short: '6' },
]

export function PricingFlowV2() {
  const { rates } = useExchangeRates()
  const twdPerHkd = rates.twd_hkd ? 1 / rates.twd_hkd : 4.098  // fallback 1/0.244

  const [step, setStep] = useState(0)
  const [slots, setSlots] = useState<SlotDef[]>([])
  const [draft, setDraft] = useState<DraftCard | null>(null)
  const [savedCardId, setSavedCardId] = useState<string | null>(null)

  // ── Data loading ──────────────────────────────────────────────────────────

  const [competitorCards, setCompetitorCards] = useState<CompetitorRateCard[]>([])
  const [ownCards, setOwnCards] = useState<GlobalRateCard[]>([])
  const [scenarios, setScenarios] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    await Promise.all([
      fetch('/api/competitor-rate-cards').then(async (r) => {
        if (r.ok) setCompetitorCards(await r.json())
      }).catch(() => {}),
      fetch('/api/rate-cards?with_brackets=1').then(async (r) => {
        if (r.ok) setOwnCards(await r.json())
      }).catch(() => {}),
      fetch('/api/scenarios').then(async (r) => {
        if (r.ok) {
          const data = await r.json()
          setScenarios(data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })))
        }
      }).catch(() => {}),
    ])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const groups: CompetitorGroup[] = useMemo(
    () => buildCompetitorGroups(competitorCards),
    [competitorCards],
  )

  // ── Navigation ────────────────────────────────────────────────────────────

  const canNext = useMemo(() => {
    if (step === 0) return slots.some((s) => s.refId)
    if (step === 1) return true
    if (step === 2) return draft != null
    if (step === 3) return draft != null
    if (step === 4) return draft != null
    return false
  }, [step, slots, draft])

  function goNext() { if (canNext) setStep((s) => Math.min(s + 1, STEPS.length - 1)) }
  function goPrev() { setStep((s) => Math.max(s - 1, 0)) }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">載入價卡資料中…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Step indicator */}
      <StepIndicator current={step} onNavigate={setStep} draft={draft} slots={slots} />

      {/* Step content */}
      <div className="min-h-[400px]">
        {step === 0 && (
          <Step1Selection
            slots={slots}
            groups={groups}
            ownCards={ownCards}
            scenarios={scenarios}
            onChange={setSlots}
          />
        )}
        {step === 1 && (
          <Step2Compare
            slots={slots}
            groups={groups}
            ownCards={ownCards}
            twdPerHkd={twdPerHkd}
          />
        )}
        {step === 2 && (
          <Step3Generate
            slots={slots}
            groups={groups}
            ownCards={ownCards}
            twdPerHkd={twdPerHkd}
            onDraftReady={(d) => { setDraft(d); setStep(3) }}
          />
        )}
        {step === 3 && draft && (
          <Step4Finetune
            draft={draft}
            onChange={setDraft}
          />
        )}
        {step === 4 && draft && (
          <Step5Recompare
            slots={slots}
            groups={groups}
            ownCards={ownCards}
            draft={draft}
            twdPerHkd={twdPerHkd}
          />
        )}
        {step === 5 && draft && (
          <Step6Output
            draft={draft}
            existingCards={ownCards}
            onSaved={(id) => { setSavedCardId(id); loadData() }}
          />
        )}
        {step === 3 && !draft && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            請先完成第 3 步生成初步價卡
          </p>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="outline" onClick={goPrev} disabled={step === 0} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" /> 上一步
        </Button>

        <div className="flex items-center gap-3">
          {savedCardId && step === 5 && (
            <span className="text-sm text-green-600 font-medium">已儲存</span>
          )}
          {step < STEPS.length - 1 && step !== 2 && (
            <Button onClick={goNext} disabled={!canNext} className="gap-1.5">
              {STEPS[step + 1].label} <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({
  current,
  onNavigate,
  draft,
  slots,
}: {
  current: number
  onNavigate: (step: number) => void
  draft: DraftCard | null
  slots: SlotDef[]
}) {
  function canNavigateTo(i: number): boolean {
    if (i === 0) return true
    if (i <= 1) return slots.some((s) => s.refId)
    if (i <= 4) return draft != null
    return draft != null
  }

  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => (
        <div key={i} className="flex items-center">
          <button
            onClick={() => canNavigateTo(i) && onNavigate(i)}
            disabled={!canNavigateTo(i)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
              ${current === i
                ? 'bg-primary text-primary-foreground'
                : canNavigateTo(i)
                  ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  : 'text-muted-foreground/40 cursor-not-allowed'
              }
            `}
          >
            <span className={`
              flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold
              ${current === i ? 'bg-primary-foreground/20' : 'bg-muted'}
            `}>
              {s.short}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
          {i < STEPS.length - 1 && (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 mx-0.5" />
          )}
        </div>
      ))}
    </div>
  )
}
