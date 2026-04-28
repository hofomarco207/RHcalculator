// ─── Shared types for the unified 6-step Pricing Flow ────────────────────────

import type { CompetitorRateCard } from '@/types/pricing-analysis'
import type { GlobalRateCard } from '@/types'

export type SlotSource = 'competitor' | 'generated' | 'scenario'
export type SlotKey = 'c0' | 'c1' | 'g0' | 'g1' | 's0' | 's1'
export type GenMode = 'battle' | 'adjust' | 'cost'

// ─── Step 1: Selection ────────────────────────────────────────────────────────

export interface SlotDef {
  key: SlotKey
  source: SlotSource
  refId: string | null   // competitorGroupKey | GlobalRateCard.id | Scenario.id
  label: string
}

export interface CompetitorGroup {
  groupKey: string   // `${competitor_name}||${service_code}`
  competitor_name: string
  service_code: string
  label: string
  currency: string
  fuel_surcharge_pct: number
  weight_step: number
  cardsByCountry: Record<string, CompetitorRateCard>  // key = country_code ?? country_name_en
  countryOptions: Array<{ code: string; labelZh: string }>
}

// ─── Step 2 / 5: Comparison table ────────────────────────────────────────────

export interface BracketRow {
  weight_min: number
  weight_max: number
  representative_weight: number
  label: string   // e.g. "0–0.1 kg"
}

export interface CellValue {
  value_twd: number | null  // null = 無提供
  is_cost: boolean           // true = scenario cost column
}

// Cached scenario costs after fetching
export interface ScenarioCostCache {
  // slotKey → countryCode → bracketLabel → cost_hkd (null = not serviceable)
  [slotKey: string]: {
    [countryCode: string]: {
      [bracketLabel: string]: number | null
    }
  }
}

// ─── Steps 3–6: Draft card ───────────────────────────────────────────────────

export interface DraftBracket {
  weight_min: number
  weight_max: number
  representative_weight: number
  label: string
  rate_per_kg: number            // TWD — editable in Step 4
  reg_fee: number                // TWD — editable in Step 4 (not scaled by % in Step 3)
  cost_twd?: number              // reference cost at representative weight (scenario basis)
  original_rate_per_kg?: number  // rate as generated in Step 3, used as % base in Step 4
}

export interface DraftCountryBrackets {
  country_code: string
  country_name_en: string
  country_name_zh?: string
  brackets: DraftBracket[]
}

export interface DraftCard {
  product_name: string
  product_code: string
  currency: 'TWD'
  country_brackets: DraftCountryBrackets[]
}

// ─── Re-exported for convenience ─────────────────────────────────────────────
export type { CompetitorRateCard, GlobalRateCard }
