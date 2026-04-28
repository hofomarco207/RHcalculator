import type { ExchangeRates } from './index'

// ─── Scenario Configuration ─────────────────────────────────────────────────

export interface Scenario {
  id?: string
  name: string
  weekly_tickets?: number
  weekly_kg?: number | null

  // A段
  vendor_a_id?: string
  seg_a?: {
    pickup_hkd_per_kg: number
    sorting_hkd_per_kg: number
    include_sorting: boolean
    bubble_ratio?: number
    per_piece_fee?: number
    per_piece_currency?: string
  }

  // BC段 (air freight + clearance combined)
  vendor_bc_id?: string
  bc_bubble_ratio?: number

  // D段 (last-mile)
  vendor_d_id?: string
  d_pricing_model?: 'first_additional' | 'weight_bracket' | 'simple' | 'per_piece' | 'tiered_per_kg' | 'lookup_table'
  d_carrier_proportions?: Array<{ carrier: string; pct: number }>

  origin_warehouse?: string
  pricing_mode?: 'bc_combined'

  // Exchange rates snapshot
  exchange_rates?: ExchangeRates

  // Cached results
  results?: ScenarioResults

  created_at?: string
  updated_at?: string
}

// ─── Scenario Results ───────────────────────────────────────────────────────

export interface ScenarioResults {
  gateway_allocation: Record<string, number>
  cost_per_bracket: BracketCost[]
  avg_cost_per_ticket: number
  volume_analysis: VolumeAnalysis
  computed_at: string

  assumptions?: {
    avg_weight_kg: number
    weekly_tickets: number
    exchange_rates: { usd_hkd: number; hkd_rmb: number; usd_rmb: number; jpy_hkd?: number; twd_hkd?: number }
    gateway_mode: string
  }
}

export interface BracketCost {
  weight_range: string
  weight_min_kg: number
  weight_max_kg: number
  representative_weight_kg: number
  cost_hkd: number
  seg_a: number
  seg_b: number
  seg_c: number
  seg_d: number
  seg_bc?: number
  detail?: BracketDetail
}

export interface BracketDetail {
  seg_a: {
    pickup_rate: number
    sorting_rate: number
    include_sorting: boolean
    weight_kg: number
    bubble_ratio?: number
    per_kg_cost_hkd?: number
    per_piece_fee?: number
    per_piece_currency?: string
    exchange_rate?: number
    per_piece_cost_hkd?: number
    cost_hkd?: number
  }
  seg_b: { gateways: Array<{
    gateway: string
    proportion: number
    tier_label?: string
    is_median?: boolean
    service_count?: number
    rate_per_kg: number
    bubble_rate: number
    freight_cost: number
    mawb_fixed_total: number
    tickets_per_mawb: number
    mawb_amortized: number
    subtotal: number
  }> }
  seg_c: { gateways: Array<{
    gateway: string
    proportion: number
    mawb_amortized: number
    per_kg_cost: number
    per_hawb_cost: number
    subtotal: number
  }> }
  seg_d: {
    gateways: Array<{
      gateway: string
      proportion: number
      weight_oz: number
      carriers: Array<{ carrier: string; pct: number; effective_pct: number; cost_usd: number }>
      avg_cost_usd: number
      usd_hkd: number
      subtotal: number
    }>
    pricing_detail?: {
      model: 'first_additional' | 'weight_bracket' | 'simple' | 'per_piece' | 'tiered_per_kg' | 'lookup_table'
      weight_kg: number
      cost_hkd: number
      zones?: Array<{
        zone?: string
        weight?: number
        first_weight_kg?: number
        first_weight_price?: number
        additional_weight_kg?: number
        additional_weight_price?: number
        additional_units?: number
        matched_bracket_max?: number
        bracket_price?: number
        currency: string
        cost_in_currency: number
        exchange_rate_to_hkd: number
      }>
      rate_per_kg?: number
      currency?: string
      exchange_rate_to_hkd?: number
      per_piece_fee?: number
      tiered?: {
        country_code: string
        weight_tier: string
        rate_per_kg: number
        registration_fee: number
        chargeable_weight: number
        currency: string
        cost_in_currency: number
        exchange_rate_to_hkd: number
      }
      lookup?: {
        country_code: string
        area_code: string
        area_name?: string
        weight_point: number
        amount: number
        currency: string
        exchange_rate_to_hkd: number
      }
    }
  }
  seg_bc?: {
    rate_per_kg: number
    fuel_surcharge_pct?: number
    currency: string
    weight_kg: number
    cost_in_currency: number
    exchange_rate_to_hkd: number
  }
}

// ─── Volume Analysis ────────────────────────────────────────────────────────

export interface VolumeAnalysis {
  tier_breakpoints: TierBreakpoint[]
  current_tier: string
  mawb_breakdown: Record<string, MawbInfo>
}

export interface TierBreakpoint {
  tier_label: string
  min_weekly_tickets: number
  cost_at_tier: number
}

export interface MawbInfo {
  tickets_per_mawb: number
  kg_per_mawb: number
  tier: string
}
