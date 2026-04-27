import type { BracketCost } from './scenario'

// ─── Shared ─────────────────────────────────────────────────────────────────

export type PriceUnit = 'per_ticket' | 'per_kg'
export type Verdict = 'profitable' | 'marginal' | 'loss'

export function getVerdict(margin: number): Verdict {
  if (margin >= 0.20) return 'profitable'
  if (margin >= 0.05) return 'marginal'
  return 'loss'
}

export function getVerdictLabel(v: Verdict): string {
  return v === 'profitable' ? '可盈利' : v === 'marginal' ? '微利' : '虧損'
}

// ─── Tab 1: Evaluate (驗價) ─────────────────────────────────────────────────

export interface EvaluateInput {
  price: number
  price_unit: PriceUnit
  representative_weight: number
  scenario_id: string
}

export interface SegmentBreakdown {
  a: number
  b: number
  c: number
  d: number
  bc?: number
  b2?: number
  b2c?: number
}

export interface SensitivityPoint {
  weight: number
  cost: number
  revenue: number
  margin: number
}

export interface EvaluateResult {
  revenue: number
  cost: number
  margin: number
  verdict: Verdict
  segment_breakdown: SegmentBreakdown
  sensitivity: SensitivityPoint[]
  pricing_mode: 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c' | 'multi_b' | 'multi_b_b2c'
}

// ─── Tab 2: Scout (方案搜索) ────────────────────────────────────────────────

export interface ScoutInput {
  price: number
  price_unit: PriceUnit
  representative_weight: number
  country_code: string
  min_margin: number // default 0.15
  pricing_mode?: 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c'
}

export interface ScoutVendorInfo {
  id: string
  name: string
  service?: string
}

export interface ScoutCombination {
  vendors: {
    a: ScoutVendorInfo
    b?: ScoutVendorInfo
    c?: ScoutVendorInfo
    bc?: ScoutVendorInfo
    b2?: ScoutVendorInfo
    b2c?: ScoutVendorInfo
    d: ScoutVendorInfo
  }
  cost: number
  margin: number
  segment_breakdown: SegmentBreakdown
}

export interface ScoutResult {
  feasible_combinations: ScoutCombination[]
  total_combinations_checked: number
}

// ─── Tab 3: Compete (競價對比) ──────────────────────────────────────────────

/** Competitor rate card stored in DB */
export interface CompetitorRateCard {
  id: string
  competitor_name: string
  service_code: string
  country_name_en: string
  country_name_zh: string
  country_code: string | null
  brackets: Array<{
    weight_range: string
    weight_min: number
    weight_max: number
    rate_per_kg: number
    reg_fee: number
  }>
  pricing_formula: string
  currency: string
  effective_date: string | null
  fuel_surcharge_pct: number
  weight_step: number
  vendor_label?: string | null
  source_file?: string | null
  version?: number
  is_current?: boolean
  valid_to?: string | null
}

/** Get a reasonable representative weight for a bracket */
export function getRepresentativeWeight(min: number, max: number): number {
  if (max <= 1) return Math.round(((min + max) / 2) * 100) / 100
  if (max <= 5) return Math.round(Math.min(min + 1, (min + max) / 2) * 100) / 100
  return Math.round(Math.min(min + 3, (min + max) / 2) * 100) / 100
}

export interface CompetitorBracketPrice {
  weight_bracket: string
  weight_min: number
  weight_max: number
  representative_weight: number
  price: number // total price at representative weight = rate_per_kg × rep_weight + reg_fee
  rate_per_kg: number
  reg_fee: number
}

export interface CompeteInput {
  competitor_prices: CompetitorBracketPrice[]
  price_unit: PriceUnit
  scenario_id: string
  adjustment_pct: number // -0.03 = 便宜3%, 0 = 跟價, +0.05 = 加價5%
  manual_overrides?: Array<{
    weight_bracket: string
    override_price: number
  }>
  weight_distribution?: Array<{
    weight_bracket: string
    proportion: number
  }>
}

export interface CompeteBracketResult {
  weight_bracket: string
  representative_weight: number
  competitor_price: number
  competitor_rate_per_kg: number
  competitor_reg_fee: number
  my_price: number
  my_freight_rate: number  // per-kg rate
  my_freight: number       // = my_freight_rate × weight
  my_reg_fee: number       // kept from competitor or overridden
  is_manual_override: boolean
  my_cost: number
  margin_amount: number
  margin_pct: number
  verdict: Verdict
  segment_breakdown: SegmentBreakdown
}

export interface CompeteSummary {
  profitable_brackets: number
  marginal_brackets: number
  loss_brackets: number
  best_bracket: string
  worst_bracket: string
  total_manual_overrides: number
}

export interface CompeteResult {
  brackets: CompeteBracketResult[]
  weighted_margin: number | null
  summary: CompeteSummary
  pricing_mode: 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c' | 'multi_b' | 'multi_b_b2c'
  scenario_costs: BracketCost[] // raw costs for frontend recalc in Step 4
}

export interface CompeteSaveInput {
  name: string
  scenario_id: string
  country_code: string
  competitor_name?: string
  adjustment_pct: number
  brackets: CompeteBracketResult[]
  competitor_prices: CompetitorBracketPrice[]
}

// ─── Shared UI: MarginVerificationTable ─────────────────────────────────────

export interface MarginVerificationRow {
  weight_bracket: string
  representative_weight: number
  competitor_price?: number
  competitor_rate_per_kg?: number
  competitor_reg_fee?: number
  my_price: number
  my_freight: number
  my_reg_fee: number
  my_cost: number
  margin_amount: number
  margin_pct: number
  is_manual_override?: boolean
  segment_breakdown?: SegmentBreakdown
}

export interface MarginVerificationTableProps {
  rows: MarginVerificationRow[]
  mode: 'compete'
  editable?: boolean
  onFreightChange?: (index: number, newFreight: number) => void
  onRegFeeChange?: (index: number, newRegFee: number) => void
  onReset?: (index: number) => void
  weightedMargin?: number | null
  pricingMode?: 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c'
  displayCurrency?: string
  currencyMultiplier?: number
}
