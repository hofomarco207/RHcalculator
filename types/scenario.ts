import type { ExchangeRates } from './index'

// ─── Scenario Configuration ─────────────────────────────────────────────────

export interface Scenario {
  id?: string
  name: string
  country_code: string
  weekly_tickets?: number
  weekly_kg?: number
  flights_per_week?: number
  zip_source: 'historical' | 'custom'

  // A段
  vendor_a_id?: string
  seg_a: {
    /** Legacy hint, no longer used by calc — kept for back-compat. */
    a_pricing_mode?: 'per_kg' | 'per_piece'
    pickup_hkd_per_kg: number
    sorting_hkd_per_kg: number
    include_sorting: boolean
    /** Applies to per-kg portion. Default 1.0. */
    bubble_ratio?: number
    per_piece_fee?: number
    per_piece_currency?: string
  }

  // B段
  vendor_b_id?: string
  b_gateway_mode: 'optimized' | 'single' | 'manual'
  b_single_gateway?: string
  b_manual_proportions?: Record<string, number>
  b_bubble_rate: number
  /** Independent B1 bubble ratio for multi-leg modes. When null, falls back to b_bubble_rate. */
  b1_bubble_ratio?: number

  // C段
  vendor_c_id?: string
  c_overrides?: Record<string, number>

  // D段
  vendor_d_id?: string
  d_carrier_proportions?: Array<{ carrier: string; pct: number }>

  // B2段 (multi-leg air freight)
  vendor_b2_id?: string
  b2_service_name?: string
  b2_gateway_mode?: 'proportional' | 'single' | 'manual'
  b2_single_gateway?: string
  b2_manual_proportions?: Record<string, number>

  // BC段 (air freight + clearance combined)
  bc_bubble_ratio?: number
  pricing_mode?: 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c'
  vendor_bc_id?: string
  vendor_bcd_id?: string
  d_pricing_model?: 'zone_based' | 'first_additional' | 'weight_bracket' | 'simple' | 'per_piece' | 'tiered_per_kg' | 'lookup_table'

  // Multi-country support
  origin_warehouse?: string        // 出發倉庫 ('HK' | 'JP' | ...)
  destination_scope?: 'single' | 'multi'

  /**
   * B段中位數定價：對每個 gateway × tier 可選的 ≥2 家 service 取 rate / mawb_fixed
   * 的中位數，再乘 (1 + vendor.config.b_buffer_pct) 做保守估計。false 則退回
   * 「挑最便宜」邏輯。新方案 DB 預設 true，舊方案 false。
   */
  use_median_pricing?: boolean

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

  /** Assumptions used in calculation, for display/audit */
  assumptions?: {
    avg_weight_kg: number
    bubble_rate: number
    weekly_tickets: number
    exchange_rates: { usd_hkd: number; hkd_rmb: number; usd_rmb: number; jpy_hkd?: number }
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
  seg_b2?: number
  seg_b2c?: number
  seg_c: number
  seg_d: number
  seg_bc?: number

  /** Detailed breakdown for tooltip display */
  detail?: BracketDetail
}

export interface BracketDetail {
  seg_a: {
    a_pricing_mode?: 'per_kg' | 'per_piece'
    pickup_rate: number      // HKD/kg
    sorting_rate: number     // HKD/kg
    include_sorting: boolean
    weight_kg: number
    /** Per-kg portion bubble. Default 1.0 */
    bubble_ratio?: number
    /** Per-kg sub-cost (after bubble), in HKD */
    per_kg_cost_hkd?: number
    per_piece_fee?: number
    per_piece_currency?: string
    exchange_rate?: number   // per_piece currency→HKD rate used
    /** Per-piece sub-cost in HKD (fee × exchange_rate) */
    per_piece_cost_hkd?: number
    cost_hkd?: number        // total (per_kg + per_piece)
  }
  seg_b: {
    gateways: Array<{
      gateway: string
      proportion: number
      rate_per_kg: number        // HKD/kg (after currency conversion)
      tier_label: string         // e.g. "300+"
      bubble_rate: number
      freight_cost: number       // rate × weight × bubble
      mawb_fixed_total: number   // total fixed fees in HKD
      tickets_per_mawb: number
      mawb_amortized: number     // fixed / tickets
      subtotal: number           // freight + amortized
      /** Services available at this gateway × tier (≥1). */
      service_count?: number
      /** True when rate was derived from median × (1+buffer) across ≥2 services. */
      is_median?: boolean
    }>
  }
  seg_c: {
    gateways: Array<{
      gateway: string
      proportion: number
      mawb_amortized: number    // per-MAWB fees / tickets_per_mawb, in HKD
      per_kg_cost: number       // per-kg fees × weight, in HKD
      per_hawb_cost: number     // per-HAWB fees, in HKD
      subtotal: number
    }>
  }
  seg_d: {
    gateways: Array<{
      gateway: string
      proportion: number
      weight_oz: number
      carriers: Array<{
        carrier: string
        pct: number              // original configured pct
        effective_pct: number    // reallocated pct after excluding carriers with cost_usd=0 for this weight
        cost_usd: number
      }>
      avg_cost_usd: number
      usd_hkd: number
      subtotal: number          // avg_cost_usd × usd_hkd
    }>
    /** Non-zone-based D model detail */
    pricing_detail?: {
      model: 'first_additional' | 'weight_bracket' | 'simple' | 'per_piece' | 'tiered_per_kg' | 'lookup_table'
      weight_kg: number
      cost_hkd: number
      zones?: Array<{
        zone?: string
        weight?: number  // zone distribution proportion (e.g., 0.408 for 40.8%)
        // first_additional fields
        first_weight_kg?: number
        first_weight_price?: number
        additional_weight_kg?: number
        additional_weight_price?: number
        additional_units?: number
        // weight_bracket fields
        matched_bracket_max?: number
        bracket_price?: number
        // common
        currency: string
        cost_in_currency: number
        exchange_rate_to_hkd: number
      }>
      // simple model fields
      rate_per_kg?: number
      currency?: string
      exchange_rate_to_hkd?: number
      // per_piece model fields (fixed fee, no weight)
      per_piece_fee?: number
      // tiered_per_kg fields (D-5)
      tiered?: {
        country_code: string
        weight_tier: string            // e.g. '0-0.5kg'
        rate_per_kg: number
        registration_fee: number
        chargeable_weight: number      // max(weight, min_chargeable)
        currency: string
        cost_in_currency: number
        exchange_rate_to_hkd: number
      }
      // lookup_table fields (D-6)
      lookup?: {
        country_code: string
        area_code: string
        area_name?: string
        weight_point: number           // 匹配的重量點
        amount: number                 // 絕對金額
        currency: string
        exchange_rate_to_hkd: number
      }
    }
  }
  seg_bc?: {
    rate_per_kg: number
    handling_fee: number
    currency: string
    weight_kg: number
    bubble_ratio: number
    cost_in_currency: number
    exchange_rate_to_hkd: number
  }
  seg_b2?: {
    gateways: Array<{
      gateway: string
      proportion: number
      rate_per_kg: number
      tier_label: string
      bubble_rate: number
      freight_cost: number
      mawb_fixed_total: number
      tickets_per_mawb: number
      mawb_amortized: number
      subtotal: number
      service_count?: number
      is_median?: boolean
    }>
  }
  seg_b2c?: {
    vendor_name?: string
    rate_per_kg: number
    handling_fee: number
    currency: string
    weight_kg: number
    bubble_ratio: number
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
  cost_at_tier: number     // average per-ticket cost at this tier
}

export interface MawbInfo {
  tickets_per_mawb: number
  kg_per_mawb: number
  tier: string
}
