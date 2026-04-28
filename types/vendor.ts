// ─── Versioning fields (shared across all rate tables) ──────────────────────

export interface VersioningFields {
  version?: number
  valid_from?: string
  valid_to?: string | null
  source?: string
  source_file?: string
}

// ─── A段 Vendor Rates (pickup & sorting) ────────────────────────────────────

export interface VendorARate extends VersioningFields {
  id?: string
  vendor_id: string
  pickup_hkd_per_kg: number
  sorting_hkd_per_kg: number
  include_sorting: boolean
  bubble_ratio?: number
  per_kg_currency?: string
  notes?: string
  is_current?: boolean
  created_at?: string
}

// ─── BC段 Vendor Rates (air freight + clearance combined) ───────────────────

export interface VendorBCRate extends VersioningFields {
  id?: string
  vendor_id: string
  rate_per_kg: number
  handling_fee: number        // per ticket
  service_name?: string
  currency: string
  notes?: string
  is_current?: boolean
  created_at?: string
}

// ─── D段 Vendor Rates (first weight / additional weight model) ──────────────

export interface VendorDRate extends VersioningFields {
  id?: string
  vendor_id: string
  country_code?: string
  country_name?: string
  zone?: string
  first_weight_kg: number
  first_weight_price: number
  additional_weight_kg: number
  additional_weight_price: number
  currency: string
  max_weight_kg?: number
  notes?: string
  is_current?: boolean
  created_at?: string
}

// ─── D-5: Tiered per-KG rates ───────────────────────────────────────────────

export interface VendorDTieredRate extends VersioningFields {
  id?: string
  vendor_id: string
  country_code: string
  country_name?: string
  weight_min_kg: number
  weight_max_kg: number
  rate_per_kg: number
  registration_fee: number
  currency: string
  min_chargeable_weight_kg?: number
  transit_days?: string
  is_current?: boolean
  created_at?: string
}

// ─── D-6: Lookup table rates (e.g. ECMS / 中華郵政) ────────────────────────

export interface VendorDLookupRate extends VersioningFields {
  id?: string
  vendor_id: string
  area_code: string
  area_name?: string
  weight_kg: number
  amount: number
  currency: string
  is_current?: boolean
  created_at?: string
}

export interface VendorDConfig {
  carrier_code: string
  display_name?: string
}

export interface VendorDLookupAreaCountry {
  id?: string
  vendor_id: string
  area_code: string
  country_code: string
}
