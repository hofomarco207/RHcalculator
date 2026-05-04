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
  version: number
  valid_from: string | null
  valid_to: string | null
  is_current: boolean
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
  version: number
  valid_from: string | null
  valid_to: string | null
  is_current: boolean
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

// A-card "product" group — same product_code may have multiple version rows
export interface ACardProductGroup {
  productCode: string
  productName: string
  versions: ACardVersion[]      // sorted desc by version
}

export interface ACardVersion {
  id: string                    // rate_cards.id
  version: number
  validFrom: string | null
  validTo: string | null
  isCurrent: boolean
}

export interface CCardGroupWithVersions extends CCardGroup {
  versions: CCardVersion[]
}

export interface CCardVersion {
  version: number
  validFrom: string | null
  validTo: string | null
  isCurrent: boolean
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

// ─── Group A cards by product_code (with full version history) ────────────

export function groupRateCardsWithVersions(cards: DbRateCard[]): ACardProductGroup[] {
  const map = new Map<string, ACardProductGroup>()
  for (const c of cards) {
    if (!map.has(c.product_code)) {
      map.set(c.product_code, {
        productCode: c.product_code,
        productName: c.product_name,
        versions: [],
      })
    }
    map.get(c.product_code)!.versions.push({
      id: c.id,
      version: c.version,
      validFrom: c.valid_from,
      validTo: c.valid_to,
      isCurrent: c.is_current,
    })
  }
  for (const g of map.values()) {
    g.versions.sort((a, b) => b.version - a.version)
  }
  return [...map.values()].sort((a, b) => a.productName.localeCompare(b.productName, 'zh-TW'))
}

// ─── Group C cards (with full version history) ────────────────────────────

export function groupCompetitorCardsWithVersions(rows: DbCompetitorRow[]): CCardGroupWithVersions[] {
  const groups = new Map<CCardKey, { group: CCardGroupWithVersions; seenVersions: Set<number> }>()
  for (const r of rows) {
    const key: CCardKey = `${r.competitor_name}||${r.service_code}`
    if (!groups.has(key)) {
      const label = [
        r.competitor_name,
        r.vendor_label ? `— ${r.vendor_label}` : '',
        r.service_code,
      ].filter(Boolean).join(' ')
      groups.set(key, {
        group: {
          key,
          label,
          competitorName: r.competitor_name,
          serviceCode: r.service_code,
          vendorLabel: r.vendor_label,
          versions: [],
        },
        seenVersions: new Set(),
      })
    }
    const g = groups.get(key)!
    if (!g.seenVersions.has(r.version)) {
      g.seenVersions.add(r.version)
      g.group.versions.push({
        version: r.version,
        validFrom: r.valid_from,
        validTo: r.valid_to,
        isCurrent: r.is_current,
      })
    } else {
      // Merge date ranges across the country rows of the same version
      const existing = g.group.versions.find((v) => v.version === r.version)!
      if (r.valid_from && (!existing.validFrom || r.valid_from < existing.validFrom)) {
        existing.validFrom = r.valid_from
      }
      if (existing.validTo && (!r.valid_to || r.valid_to > existing.validTo)) {
        existing.validTo = r.valid_to
      }
      if (r.is_current) existing.isCurrent = true
    }
  }
  for (const { group } of groups.values()) {
    group.versions.sort((a, b) => b.version - a.version)
  }
  return [...groups.values()]
    .map((g) => g.group)
    .sort((a, b) => a.label.localeCompare(b.label))
}

// ─── Per-product mapping (saved to localStorage) ──────────────────────────

export interface ProductMapping {
  aCardProductCode: string      // RH product (groups versions)
  cCardKey: CCardKey            // "competitor||service_code" (groups versions)
}

export const MAPPING_STORAGE_KEY = 'rh-fee-audit-product-mapping-v2'

export function loadMappings(): Record<string, ProductMapping> {
  try {
    const raw = localStorage.getItem(MAPPING_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveMappings(mappings: Record<string, ProductMapping>) {
  localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(mappings))
}

// ─── Master version applied to all cards in this batch ────────────────────

export interface BatchVersionChoice {
  aVersion: number | null       // null = latest (is_current); else use this version (or fallback closest <=)
  cVersion: number | null
}

// Resolve a chosen version against an A-product's version list.
// Returns the matched version row, with fallback rules:
//   1. exact match → use it
//   2. else: max version <= chosen → use it (allows "as-of an older state")
//   3. else: latest available (is_current) → use it
export function resolveACardVersion(
  product: ACardProductGroup,
  chosen: number | null,
): ACardVersion | null {
  if (product.versions.length === 0) return null
  if (chosen == null) {
    return product.versions.find((v) => v.isCurrent) ?? product.versions[0]
  }
  const exact = product.versions.find((v) => v.version === chosen)
  if (exact) return exact
  const earlier = product.versions
    .filter((v) => v.version <= chosen)
    .sort((a, b) => b.version - a.version)[0]
  if (earlier) return earlier
  return product.versions.find((v) => v.isCurrent) ?? product.versions[0]
}

export function resolveCCardVersion(
  group: CCardGroupWithVersions,
  chosen: number | null,
): CCardVersion | null {
  if (group.versions.length === 0) return null
  if (chosen == null) {
    return group.versions.find((v) => v.isCurrent) ?? group.versions[0]
  }
  const exact = group.versions.find((v) => v.version === chosen)
  if (exact) return exact
  const earlier = group.versions
    .filter((v) => v.version <= chosen)
    .sort((a, b) => b.version - a.version)[0]
  if (earlier) return earlier
  return group.versions.find((v) => v.isCurrent) ?? group.versions[0]
}
