// ─── 匯率 ───────────────────────────────────────────────
export interface ExchangeRates {
  id?: string
  usd_hkd: number
  hkd_rmb: number
  usd_rmb: number
  jpy_hkd?: number
  twd_hkd?: number
  updated_at?: string
  is_current?: boolean
}

// DB-driven: widened to string for multi-country extensibility
export type GatewayCode = string
export const US_GATEWAYS = ['LAX', 'JFK', 'ORD', 'DFW', 'MIA'] as const

export type ProductType = 'economy' | 'premium'
// DB-driven: widened to string for multi-country extensibility
export type CarrierName = string
export const US_CARRIERS = ['GOFO', 'OSM', 'USPS', 'UNI'] as const

export interface CarrierProportion {
  id?: string
  product_type: ProductType
  weight_min_kg: number
  weight_max_kg: number
  gofo_pct: number
  osm_pct: number
  usps_pct: number
  uniuni_pct: number
  updated_at?: string
  is_current?: boolean
}

export interface LastMileRate {
  id?: string
  carrier: CarrierName
  zone: number
  weight_oz_min: number
  weight_oz_max: number
  price_usd: number
  vendor_id?: string
  imported_at?: string
}

export interface ZipZoneMapping {
  id?: string
  carrier: CarrierName
  gateway: GatewayCode
  zip_prefix: string
  zone: number
  zone_raw: string
}

export interface ImportBatch {
  id?: string
  filename: string
  record_count: number
  imported_at?: string
}

export interface HistoricalShipment {
  id?: string
  batch_id: string
  gateway: GatewayCode
  zip_code: string
  weight_kg: number
  shipment_date?: string
}

export interface ComputedDistributions {
  id?: string
  batch_id: string
  port_proportions: Partial<Record<GatewayCode, number>>
  weight_distribution: Array<{
    bracket: string
    weight_min: number
    weight_max: number
    proportion: number
    ticket_count: number
  }>
  zone_distribution: {
    [carrier in CarrierName]?: {
      [gateway in GatewayCode]?: Record<number, number>
    }
  }
  computed_at?: string
}

export interface RateCardBracket {
  weight_range: string
  weight_min_kg: number
  weight_max_kg: number
  representative_weight_kg: number
  cost_hkd: number
  freight_rate_hkd_per_kg: number
  reg_fee_hkd: number
  revenue_hkd: number
  actual_margin: number
  is_manually_adjusted?: boolean
}

export interface RateCard {
  id?: string
  name: string
  product_type: ProductType
  target_margin: number
  brackets: RateCardBracket[]
  scenario_id?: string
  country_code?: string
  created_at?: string
  updated_at?: string
}

// ─── Global rate card types (Phase 2) ────────────────────────────────────────

export interface ApiCountryBracket {
  weight_min: number
  weight_max: number
  rate_per_kg: number
  reg_fee: number
  cost_hkd?: number
}

export interface RateCardCountryBracket {
  id?: string
  rate_card_id?: string
  country_code: string
  country_name_en: string
  country_name_zh?: string | null
  brackets: ApiCountryBracket[]
  created_at?: string
}

export interface GlobalRateCard {
  id?: string
  product_code: string
  product_name: string
  scenario_id?: string | null
  source: 'scenario' | 'manual'
  currency: string
  fuel_surcharge_pct: number
  weight_step: number
  version: number
  valid_from?: string
  valid_to?: string | null
  is_current: boolean
  deleted_at?: string | null
  created_at?: string
  updated_at?: string
  country_brackets?: RateCardCountryBracket[]
}

export interface CompetitorRate {
  id?: string
  product_code: string
  weight_min_kg: number
  weight_max_kg: number
  freight_rate_hkd: number
  reg_fee_hkd: number
  imported_at?: string
}

// ─── Air Freight History ─────────────────────────────────────────────
export interface AirFreightHistoryRecord {
  id?: string
  port_code: GatewayCode
  cargo_type: string
  week_label: string
  week_start?: string
  week_end?: string
  raw_price_hkd_per_kg: number
  discount_hkd_per_kg: number
  net_price_hkd_per_kg?: number  // generated column
  imported_at?: string
}

export interface AirFreightImportConfig {
  id?: string
  default_cargo_type: string
  discount_hkd_per_kg: number
  updated_at?: string
}

export type ComputeStrategy = 'latest' | 'avg4w' | 'avg8w' | 'custom'

export interface AirFreightSuggestion {
  port_code: GatewayCode
  net_price: number
  source_weeks: string[]
}

export interface WeightPoint {
  range: string
  min: number
  max: number
  representative: number
}

export const WEIGHT_BRACKETS: readonly WeightPoint[] = [
  { range: '0<W≤0.1', min: 0, max: 0.1, representative: 0.1 },
  { range: '0.1<W≤0.2', min: 0.1, max: 0.2, representative: 0.2 },
  { range: '0.2<W≤0.45', min: 0.2, max: 0.45, representative: 0.45 },
  { range: '0.45<W≤0.7', min: 0.45, max: 0.7, representative: 0.7 },
  { range: '0.7<W≤2', min: 0.7, max: 2, representative: 2.0 },
  { range: '2<W≤30', min: 2, max: 30, representative: 30.0 },
]

// 24 個成本驗算重量點（方案分析用）
export const SCENARIO_VERIFICATION_WEIGHTS: WeightPoint[] = [
  0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30,
].map((w, i, arr) => ({
  range: `${w}kg`,
  min: i === 0 ? 0 : arr[i - 1],
  max: w,
  representative: w,
}))

/** @deprecated Use UNIFIED_WEIGHT_POINTS for new pricing flow components */
export const GATEWAYS: GatewayCode[] = ['LAX', 'JFK', 'ORD', 'DFW', 'MIA']

/** v3.1 unified 24-point weight brackets — used by all new pricing flow components */
export const UNIFIED_WEIGHT_POINTS: readonly WeightPoint[] = [
  0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30,
].map((w, i, arr) => ({
  range: `${w}kg`,
  min: i === 0 ? 0 : arr[i - 1],
  max: w,
  representative: w,
}))

export const DEFAULT_EXCHANGE_RATES: ExchangeRates = {
  usd_hkd: 7.814,
  hkd_rmb: 0.934,
  usd_rmb: 7.295,
  jpy_hkd: 0.052,
  twd_hkd: 0.2440,
}

export const DEFAULT_CARRIER_PROPORTIONS: Omit<CarrierProportion, 'id' | 'updated_at' | 'is_current'>[] = [
  { product_type: 'economy', weight_min_kg: 0, weight_max_kg: 0.34, gofo_pct: 0.398, osm_pct: 0.125, usps_pct: 0.477, uniuni_pct: 0 },
  { product_type: 'economy', weight_min_kg: 0.34, weight_max_kg: 11.3, gofo_pct: 0.4475, osm_pct: 0.5433, usps_pct: 0.0092, uniuni_pct: 0 },
  { product_type: 'economy', weight_min_kg: 11.3, weight_max_kg: 30, gofo_pct: 0.273, osm_pct: 0.545, usps_pct: 0.182, uniuni_pct: 0 },
  { product_type: 'premium', weight_min_kg: 0, weight_max_kg: 30, gofo_pct: 0, osm_pct: 0, usps_pct: 1, uniuni_pct: 0 },
]

export const PRODUCT_LABELS: Record<ProductType, string> = {
  economy: '特惠普貨',
  premium: '精選產品',
}

// ─── Weight Distribution (for weighted margin) ─────────────────────────
export interface ShipmentWeightRecord {
  id?: string
  batch_id?: string
  billable_weight_kg: number
  product_type: ProductType
  carrier?: string
  shipment_date?: string
  created_at?: string
}

export interface WeightBracketDistribution {
  bracket: string
  weight_min: number
  weight_max: number
  count: number
  proportion: number
}

// VERIFICATION_WEIGHTS converted to WeightPoint[] for preview API calls
export const VERIFICATION_WEIGHT_POINTS: WeightPoint[] = (() => {
  const kgs = [
    0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45,
    0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95,
    1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2,
    2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3,
    3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4,
    4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5,
    6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
  ]
  return kgs.map((w, i) => ({
    range: `${w}kg`,
    min: i === 0 ? 0 : kgs[i - 1],
    max: w,
    representative: w,
  }))
})()

export const VERIFICATION_WEIGHTS: { kg: number; ozLb: number }[] = [
  { kg: 0.05, ozLb: 2 }, { kg: 0.1, ozLb: 4 }, { kg: 0.15, ozLb: 6 },
  { kg: 0.2, ozLb: 8 }, { kg: 0.25, ozLb: 9 }, { kg: 0.3, ozLb: 11 },
  { kg: 0.35, ozLb: 13 }, { kg: 0.4, ozLb: 15 }, { kg: 0.45, ozLb: 15.99 },
  { kg: 0.5, ozLb: 2 }, { kg: 0.55, ozLb: 2 }, { kg: 0.6, ozLb: 2 },
  { kg: 0.65, ozLb: 2 }, { kg: 0.7, ozLb: 2 }, { kg: 0.75, ozLb: 2 },
  { kg: 0.8, ozLb: 2 }, { kg: 0.85, ozLb: 2 }, { kg: 0.9, ozLb: 2 },
  { kg: 0.95, ozLb: 3 }, { kg: 1, ozLb: 3 }, { kg: 1.1, ozLb: 3 },
  { kg: 1.2, ozLb: 3 }, { kg: 1.3, ozLb: 3 }, { kg: 1.4, ozLb: 4 },
  { kg: 1.5, ozLb: 4 }, { kg: 1.6, ozLb: 4 }, { kg: 1.7, ozLb: 4 },
  { kg: 1.8, ozLb: 4 }, { kg: 1.9, ozLb: 5 }, { kg: 2, ozLb: 5 },
  { kg: 2.1, ozLb: 5 }, { kg: 2.2, ozLb: 5 }, { kg: 2.3, ozLb: 6 },
  { kg: 2.4, ozLb: 6 }, { kg: 2.5, ozLb: 6 }, { kg: 2.6, ozLb: 6 },
  { kg: 2.7, ozLb: 6 }, { kg: 2.8, ozLb: 7 }, { kg: 2.9, ozLb: 7 },
  { kg: 3, ozLb: 7 }, { kg: 3.1, ozLb: 7 }, { kg: 3.2, ozLb: 8 },
  { kg: 3.3, ozLb: 8 }, { kg: 3.4, ozLb: 8 }, { kg: 3.5, ozLb: 8 },
  { kg: 3.6, ozLb: 8 }, { kg: 3.7, ozLb: 9 }, { kg: 3.8, ozLb: 9 },
  { kg: 3.9, ozLb: 9 }, { kg: 4, ozLb: 9 }, { kg: 4.1, ozLb: 10 },
  { kg: 4.2, ozLb: 10 }, { kg: 4.3, ozLb: 10 }, { kg: 4.4, ozLb: 10 },
  { kg: 4.5, ozLb: 10 }, { kg: 4.6, ozLb: 11 }, { kg: 4.7, ozLb: 11 },
  { kg: 4.8, ozLb: 11 }, { kg: 4.9, ozLb: 11 }, { kg: 5, ozLb: 12 },
  { kg: 6, ozLb: 14 }, { kg: 7, ozLb: 16 }, { kg: 8, ozLb: 18 },
  { kg: 9, ozLb: 20 }, { kg: 10, ozLb: 23 }, { kg: 11, ozLb: 25 },
  { kg: 12, ozLb: 27 }, { kg: 13, ozLb: 29 }, { kg: 14, ozLb: 31 },
  { kg: 15, ozLb: 34 }, { kg: 16, ozLb: 36 }, { kg: 17, ozLb: 38 },
  { kg: 18, ozLb: 40 }, { kg: 19, ozLb: 42 }, { kg: 20, ozLb: 45 },
  { kg: 21, ozLb: 47 }, { kg: 22, ozLb: 49 }, { kg: 23, ozLb: 51 },
  { kg: 24, ozLb: 53 }, { kg: 25, ozLb: 56 }, { kg: 26, ozLb: 58 },
  { kg: 27, ozLb: 60 }, { kg: 28, ozLb: 62 }, { kg: 29, ozLb: 63 },
  { kg: 30, ozLb: 67 },
]

// ─── Foundation Entities (DB-driven) ──────────────────────────────────────

export type PricingMode = 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c'

export interface Country {
  code: string
  name_zh: string
  name_en?: string
  currency_code: string
  pricing_mode: PricingMode
  is_active: boolean
}

export interface Gateway {
  id: string
  code: string
  country_code: string
  name_zh?: string
  name_en?: string
  is_active: boolean
}

export interface Carrier {
  id: string
  code: string
  country_code: string
  name?: string
  is_active: boolean
}

export interface Vendor {
  id: string
  name: string
  segment: 'A' | 'B' | 'C' | 'D' | 'BC' | 'BCD'
  country_code: string
  notes?: string
  config?: { simple_rate?: boolean; rate_per_kg?: number; rate_currency?: string; warehouse?: string; [key: string]: unknown }
  is_active: boolean
  created_at?: string
}

// ─── Cost Estimate (price card interpreter output) ──────────────────────
export interface CostEstimate {
  id?: string
  vendor_id?: string
  segment: string
  country_code?: string
  route_origin?: string
  route_destination?: string
  estimate_data: Record<string, unknown>
  user_confirmed_values?: Record<string, unknown>
  source_file?: string
  interpreted_at?: string
  notes?: string
  created_at?: string
}

// ─── Import Quote Request (Skill Phase 3 output) ────────────────────────
export interface ImportQuoteRequest {
  meta: {
    source_file: string
    segment: 'B' | 'C' | 'D' | 'BC' | 'BCD'
    structure_type: string           // e.g. 'B-1', 'B-2', 'B-3', 'D-5', 'D-6', 'BCD-1'
    route: { origin: string; destinations: string[] }
    country_code?: string
  }
  vendor_quotes: Array<{
    vendor_name: string
    structure_type: string
    data: Record<string, unknown>
  }>
  cost_estimate: Record<string, unknown>
}
