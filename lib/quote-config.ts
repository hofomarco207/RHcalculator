export type WeightBracket = '0～1KG' | '1～2KG' | '2～5KG' | '5KG～'

export const WEIGHT_BRACKET_OPTIONS: WeightBracket[] = ['0～1KG', '1～2KG', '2～5KG', '5KG～']

// Verification weights per bracket — read vertically from Excel columns F-I
export const BRACKET_WEIGHTS: Record<WeightBracket, number[]> = {
  '0～1KG':  [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  '1～2KG':  [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2],
  '2～5KG':  [2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4, 4.2, 4.4, 4.6, 4.8, 5],
  '5KG～':   [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
}

export type Sensitivity = '時效' | '價格'

export interface LookupEntry {
  country: string         // display label shown in dropdown
  countryCode: string     // ISO code used for rate card lookup
  isApproximate: boolean  // show "約" prefix + disclaimer
  cargoType: string       // key used for matching
  sensitivity: Sensitivity | null  // null = no sensitivity choice
  productName: string     // matches rate_cards.product_name (ILIKE)
  productCode: string     // matches rate_cards.product_code
}

// Cargo type display labels
export const CARGO_LABELS: Record<string, string> = {
  '普貨':     '普貨（球員卡、汽機車/腳踏車零配件、非電/液體/化妝品）',
  '帶電特貨': '帶電特貨（含電池商品，非行動電源/替換電池）',
  '化妝品':   '化妝品',
}

export const COUNTRY_OPTIONS = ['美國', '英國', '澳洲', '歐洲', '其他'] as const
export type CountryOption = typeof COUNTRY_OPTIONS[number]

// Lookup table: (country, cargoType, sensitivity) → product
// Duplicates removed — first match is used.
// 歐洲 uses FR as representative; 其他 uses BR. Both marked isApproximate.
export const LOOKUP_TABLE: LookupEntry[] = [
  // ── 美國 US ────────────────────────────────────────────────────────────────
  { country: '美國', countryCode: 'US', isApproximate: false, cargoType: '普貨',     sensitivity: '時效', productName: '雲途精選專線服務 HK-ASS-PF',     productCode: 'HK-ASS-PF' },
  { country: '美國', countryCode: 'US', isApproximate: false, cargoType: '帶電特貨', sensitivity: '時效', productName: '雲途精選專線服務 HK-ASS-PF',     productCode: 'HK-ASS-PF' },
  { country: '美國', countryCode: 'US', isApproximate: false, cargoType: '化妝品',   sensitivity: null,   productName: '全球化妝品類專線服務 HKMUZXR',   productCode: 'HKMUZXR'   },
  { country: '美國', countryCode: 'US', isApproximate: false, cargoType: '普貨',     sensitivity: '價格', productName: '全球專線服務 HKTHZXR',            productCode: 'HKTHZXR'  },
  { country: '美國', countryCode: 'US', isApproximate: false, cargoType: '帶電特貨', sensitivity: '價格', productName: '全球專線服務 HKTHZXR',            productCode: 'HKTHZXR'  },
  // ── 英國 GB ────────────────────────────────────────────────────────────────
  { country: '英國', countryCode: 'GB', isApproximate: false, cargoType: '普貨',     sensitivity: '時效', productName: '全球專線服務-標快 HKBKZXR',       productCode: 'HKBKZXR'  },
  { country: '英國', countryCode: 'GB', isApproximate: false, cargoType: '帶電特貨', sensitivity: '時效', productName: '全球專線服務-標快 HKBKZXR',       productCode: 'HKBKZXR'  },
  { country: '英國', countryCode: 'GB', isApproximate: false, cargoType: '化妝品',   sensitivity: null,   productName: '全球化妝品類專線服務 HKMUZXR',   productCode: 'HKMUZXR'   },
  { country: '英國', countryCode: 'GB', isApproximate: false, cargoType: '普貨',     sensitivity: '價格', productName: '全球專線服務 HKTHZXR',            productCode: 'HKTHZXR'  },
  { country: '英國', countryCode: 'GB', isApproximate: false, cargoType: '帶電特貨', sensitivity: '價格', productName: '全球專線服務 HKTHZXR',            productCode: 'HKTHZXR'  },
  // ── 澳洲 AU ────────────────────────────────────────────────────────────────
  { country: '澳洲', countryCode: 'AU', isApproximate: false, cargoType: '普貨',     sensitivity: '時效', productName: '全球專線服務-標快 HKBKZXR',       productCode: 'HKBKZXR'  },
  { country: '澳洲', countryCode: 'AU', isApproximate: false, cargoType: '帶電特貨', sensitivity: '時效', productName: '全球專線服務-標快 HKBKZXR',       productCode: 'HKBKZXR'  },
  { country: '澳洲', countryCode: 'AU', isApproximate: false, cargoType: '化妝品',   sensitivity: null,   productName: '全球化妝品類專線服務 HKMUZXR',   productCode: 'HKMUZXR'   },
  { country: '澳洲', countryCode: 'AU', isApproximate: false, cargoType: '普貨',     sensitivity: '價格', productName: '全球專線服務 HKTHZXR',            productCode: 'HKTHZXR'  },
  { country: '澳洲', countryCode: 'AU', isApproximate: false, cargoType: '帶電特貨', sensitivity: '價格', productName: '全球專線服務 HKTHZXR',            productCode: 'HKTHZXR'  },
  // ── 歐洲 → FR (approximate) ────────────────────────────────────────────────
  { country: '歐洲', countryCode: 'FR', isApproximate: true,  cargoType: '普貨',     sensitivity: '時效', productName: '雲途精選專線服務 HK-ASS-PF',     productCode: 'HK-ASS-PF' },
  { country: '歐洲', countryCode: 'FR', isApproximate: true,  cargoType: '帶電特貨', sensitivity: '時效', productName: '雲途精選專線服務 HK-ASS-PF',     productCode: 'HK-ASS-PF' },
  { country: '歐洲', countryCode: 'FR', isApproximate: true,  cargoType: '化妝品',   sensitivity: null,   productName: '全球化妝品類專線服務 HKMUZXR',   productCode: 'HKMUZXR'   },
  { country: '歐洲', countryCode: 'FR', isApproximate: true,  cargoType: '普貨',     sensitivity: '價格', productName: '全球專線服務 HKTHZXR',            productCode: 'HKTHZXR'  },
  { country: '歐洲', countryCode: 'FR', isApproximate: true,  cargoType: '帶電特貨', sensitivity: '價格', productName: '全球專線服務 HKTHZXR',            productCode: 'HKTHZXR'  },
  // ── 其他 → BR (approximate, no sensitivity distinction) ───────────────────
  { country: '其他', countryCode: 'BR', isApproximate: true,  cargoType: '普貨',     sensitivity: null,   productName: '全球專線服務 HKTHZXR',            productCode: 'HKTHZXR'  },
  { country: '其他', countryCode: 'BR', isApproximate: true,  cargoType: '帶電特貨', sensitivity: null,   productName: '全球專線服務 HKTHZXR',            productCode: 'HKTHZXR'  },
  { country: '其他', countryCode: 'BR', isApproximate: true,  cargoType: '化妝品',   sensitivity: null,   productName: '全球化妝品類專線服務 HKMUZXR',   productCode: 'HKMUZXR'   },
]

export function lookupEntry(
  country: string,
  cargoType: string,
  sensitivity: string | null,
): LookupEntry | null {
  return LOOKUP_TABLE.find(
    (e) => e.country === country && e.cargoType === cargoType && e.sensitivity === sensitivity,
  ) ?? null
}

/** Countries where sensitivity dropdown should be hidden (no 時效/價格 choice) */
export function hasSensitivityChoice(country: string, cargoType: string): boolean {
  if (cargoType === '化妝品') return false
  if (country === '其他') return false
  return true
}
