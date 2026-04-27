// ─── Versioning fields (shared across all rate tables) ──────────────────────

export interface VersioningFields {
  version?: number
  valid_from?: string
  valid_to?: string | null
  source?: string          // 'quote' | 'settlement' | etc.
  source_file?: string
}

// ─── A段 Vendor Rates (pickup & sorting) ────────────────────────────────────

export interface VendorARate extends VersioningFields {
  id?: string
  vendor_id: string
  pickup_hkd_per_kg: number
  sorting_hkd_per_kg: number
  include_sorting: boolean
  /** A段拋率 — applies to per-kg portion only. Default 1.0. */
  bubble_ratio?: number
  notes?: string
  is_current?: boolean
  created_at?: string
}

// ─── B段 Surcharge (JSONB structure) ────────────────────────────────────────

export type BSurchargeUnit = 'per_mawb' | 'per_kg' | 'per_kg_with_min' | 'per_hawb' | 'conditional'

export interface BSurcharge {
  name: string                  // 費用名稱（e.g. '提货费'）
  unit: BSurchargeUnit          // 計費方式
  amount: number | null         // 金額（per_mawb/per_hawb 時為固定金額）
  rate: number | null           // per_kg 費率（unit=per_kg/per_kg_with_min 時使用）
  min: number | null            // 最低收費（unit=per_kg_with_min 時使用）
  currency: string              // 該項費用的幣種（可能與主費率不同）
  condition: string | null      // 觸發條件描述（unit=conditional 時使用）
  from_notes: boolean           // ���否從備註欄提取
}

// ─── B段 Vendor Rates (volume-tiered, per gateway) ──────────────────────────

export interface VendorBRate extends VersioningFields {
  id?: string
  vendor_id: string
  service_name?: string       // 服務名稱（同一 vendor 下的不同航線/代理選項）
  gateway_code: string
  airline?: string
  weight_tier_min_kg: number
  rate_per_kg: number
  currency: 'USD' | 'RMB' | 'HKD'
  bubble_ratio: number
  transit_days?: string
  frequency?: string
  flights_per_week?: number
  // Per-MAWB fixed fees (in vendor's currency) — legacy columns, prefer surcharges
  pickup_fee: number
  handling_fee: number
  operation_fee: number
  document_fee: number
  battery_check_fee: number
  customs_fee: number
  airport_transfer_fee: number
  magnetic_check_fee: number
  // Reference info (non-calculation, for display)
  routing?: string          // 路由（如 HKG-ICN-LAX）
  service_type?: string     // 服務類型（門到港/港到港）
  // Structured surcharges (replaces fixed fee columns)
  surcharges?: BSurcharge[]
  additional_surcharge?: number   // 附加費/雜費（每單）
  notes?: string
  is_current?: boolean
  created_at?: string
}

/** Sum of all per-MAWB fixed fees for a B段 rate.
 *  If surcharges JSONB is populated, sums the per_mawb amounts from there.
 *  Otherwise falls back to the 6 legacy columns. */
export function totalBFixedFees(rate: VendorBRate): number {
  if (rate.surcharges && rate.surcharges.length > 0) {
    return rate.surcharges
      .filter(s => s.unit === 'per_mawb' && s.amount != null)
      .reduce((sum, s) => sum + (s.amount ?? 0), 0)
  }
  return (
    rate.pickup_fee +
    rate.handling_fee +
    rate.operation_fee +
    rate.document_fee +
    rate.battery_check_fee +
    rate.customs_fee +
    rate.airport_transfer_fee +
    rate.magnetic_check_fee
  )
}

// ─── C段 Vendor Rates (structured fee model) ────────────────────────────────

export type CFeeType = 'per_mawb' | 'per_kg' | 'per_hawb'

export interface VendorCRate extends VersioningFields {
  id?: string
  vendor_id: string
  fee_type: CFeeType
  fee_name: string
  gateway_code?: string   // null = applies to all gateways
  amount: number
  currency: string
  min_amount?: number
  additional_surcharge?: number   // 附加費/雜費（每單）
  notes?: string
  is_current?: boolean
  created_at?: string
}

// ─── BC段 Vendor Rates (air freight + clearance combined) ───────────────────

export interface VendorBCRate extends VersioningFields {
  id?: string
  vendor_id: string
  rate_per_kg: number
  handling_fee_per_unit: number
  additional_surcharge?: number   // 附加費/雜費（每單）
  currency: 'USD' | 'RMB' | 'HKD'
  notes?: string
  is_current?: boolean
  created_at?: string
}

// ─── D段 Vendor Rates (first weight / additional weight model) ──────────────

export interface VendorDRate extends VersioningFields {
  id?: string
  vendor_id: string
  zone?: string                    // 分區名（如 Tier1/Tier2/Tier3，對應不同口岸區域）
  first_weight_kg: number          // 首重重量（如 1.0 kg）
  first_weight_price: number       // 首重價格
  additional_weight_kg: number     // 續重單位（如每 1.0 kg）
  additional_weight_price: number  // 續重價格
  currency: 'USD' | 'RMB' | 'HKD'
  max_weight_kg?: number
  additional_surcharge?: number   // 附加費/雜費（每單）
  notes?: string
  is_current?: boolean
  created_at?: string
}

// ─── D-5: Tiered per-KG rates (e.g. Yuntu) ─────────────────────────────────

export interface VendorDTieredRate extends VersioningFields {
  id?: string
  vendor_id: string
  country_code: string             // 目的國 ISO code
  country_name?: string
  weight_min_kg: number            // 重量段下限（exclusive）
  weight_max_kg: number            // 重量段上限（inclusive）
  rate_per_kg: number              // per-kg rate
  registration_fee: number         // 掛號費 per ticket
  currency: string
  min_chargeable_weight_kg?: number
  transit_days?: string
  additional_surcharge?: number   // 附加費/雜費（每單）
  is_current?: boolean
  created_at?: string
}

// ─── D-6: Lookup table rates (e.g. ECMS / 中華郵政) ────────────────────────

export interface VendorDLookupRate extends VersioningFields {
  id?: string
  vendor_id: string
  area_code: string                // 區域代碼 (e.g., 'A', 'B', ... 'G')
  area_name?: string
  weight_kg: number                // 重量點
  amount: number                   // 該重量的絕對金額
  currency: string
  additional_surcharge?: number   // 附加費/雜費（每單）
  is_current?: boolean
  created_at?: string
}

export interface VendorDLookupAreaCountry {
  id?: string
  vendor_id: string
  area_code: string
  country_code: string
}

// ─── BCD 合併費率 (lookup table structure) ──────────────────────────────────

export interface VendorBCDRate extends VersioningFields {
  id?: string
  vendor_id: string
  area_code: string
  area_name?: string
  weight_kg: number
  amount: number
  currency: string
  fuel_surcharge_pct?: number      // 燃油附加費比例
  is_current?: boolean
  created_at?: string
}

// ─── D段 Vendor Config (links vendor to carriers) ───────────────────────────

export interface VendorDConfig extends VersioningFields {
  id?: string
  vendor_id: string
  carrier_code: string
  is_active: boolean
  created_at?: string
}
