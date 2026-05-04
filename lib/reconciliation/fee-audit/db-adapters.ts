import { PriceCardRow } from './calculations'

// ─── Types from DB ─────────────────────────────────────────────────────────

export interface DbBracket {
  weight_min: number
  weight_max: number
  rate_per_kg: number
  reg_fee: number
  cost_hkd?: number
}

export interface DbCountryBracket {
  rate_card_id?: string
  country_code: string
  country_name_zh: string | null
  country_name_en: string
  brackets: DbBracket[]
}

export interface DbRateCard {
  id: string
  product_name: string
  product_code: string
  currency: string
  valid_from: string
  country_brackets?: DbCountryBracket[]
}

export interface DbCompetitorRow {
  id: string
  competitor_name: string
  service_code: string
  vendor_label: string | null
  country_name_zh: string
  country_name_en: string
  country_code: string | null
  brackets: DbBracket[]
  currency: string
}

// Key used to identify a C-card group: "competitor_name||service_code"
export type CCardKey = string

export interface CCardGroup {
  key: CCardKey
  label: string      // display name, e.g. "雲途 — C價（批發）TWTHZXR"
  competitorName: string
  serviceCode: string
  vendorLabel: string | null
}

// ─── A card: rate_card_country_brackets → PriceCardRow[] ──────────────────

export function aCardToPriceRows(countryBrackets: DbCountryBracket[]): PriceCardRow[] {
  const rows: PriceCardRow[] = []
  for (const cb of countryBrackets) {
    const baseName = cb.country_name_zh || cb.country_name_en
    // Australia zone mapping: DB stores 'AU-1'/'AU-2'/'AU-3' in country_code
    // TMS generates matchKey '澳洲-1'/'澳洲-2'/'澳洲-3' from the 分区 column
    const auZone = cb.country_code.match(/^AU-(\d+)$/)
    const matchKey = auZone ? `澳洲-${auZone[1]}` : baseName
    for (const b of cb.brackets) {
      rows.push({
        countryEN: cb.country_name_en,
        countryCN: baseName,
        weightRange: `${b.weight_min}-${b.weight_max}`,
        rate: b.rate_per_kg,
        regFee: b.reg_fee,
        minWeight: b.weight_min,
        carry: '',
        matchKey,
        wMin: b.weight_min,
        wMax: b.weight_max,
      })
    }
  }
  return rows
}

// ─── C card: competitor_rate_cards rows (all countries for one service_code) → PriceCardRow[] ──

export function cCardToPriceRows(rows: DbCompetitorRow[]): PriceCardRow[] {
  const result: PriceCardRow[] = []
  for (const row of rows) {
    const matchKey = row.country_name_zh || row.country_name_en
    for (const b of row.brackets) {
      result.push({
        countryEN: row.country_name_en,
        countryCN: row.country_name_zh || row.country_name_en,
        weightRange: `${b.weight_min}-${b.weight_max}`,
        rate: b.rate_per_kg,
        regFee: b.reg_fee,
        minWeight: b.weight_min,
        carry: '',
        matchKey,
        wMin: b.weight_min,
        wMax: b.weight_max,
      })
    }
  }
  return result
}

// ─── Deduplicate competitor rows into card groups ──────────────────────────

export function groupCompetitorCards(rows: DbCompetitorRow[]): CCardGroup[] {
  const seen = new Map<CCardKey, CCardGroup>()
  for (const r of rows) {
    const key: CCardKey = `${r.competitor_name}||${r.service_code}`
    if (!seen.has(key)) {
      const label = [
        r.competitor_name,
        r.vendor_label ? `— ${r.vendor_label}` : '',
        r.service_code,
      ].filter(Boolean).join(' ')
      seen.set(key, {
        key,
        label,
        competitorName: r.competitor_name,
        serviceCode: r.service_code,
        vendorLabel: r.vendor_label,
      })
    }
  }
  return [...seen.values()]
}

// ─── localStorage mapping ──────────────────────────────────────────────────

export const MAPPING_STORAGE_KEY = 'rh-fee-audit-product-mapping'

export interface ProductMapping {
  aCardId: string      // rate_card.id
  cCardKey: CCardKey   // "competitor_name||service_code"
}

export function loadMappings(): Record<string, ProductMapping> {
  try {
    const raw = localStorage.getItem(MAPPING_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveMappings(mappings: Record<string, ProductMapping>) {
  localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(mappings))
}
