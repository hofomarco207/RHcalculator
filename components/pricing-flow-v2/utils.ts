import type {
  CompetitorGroup,
  BracketRow,
  CellValue,
  SlotDef,
  DraftBracket,
  CompetitorRateCard,
  GlobalRateCard,
} from '@/types/pricing-flow'

// ─── Country name ↔ ISO code mapping ─────────────────────────────────────────
// Mirrors the competitor importer's COUNTRY_CODE_MAP so we can double-index
// competitor cards by BOTH ISO code and country_name_en, handling the case
// where country_code is stored as null in the DB.
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'United States': 'US',
  'United Kingdom': 'GB',
  'United Kindgom': 'GB',
  'France': 'FR',
  'Germany': 'DE',
  'Italy': 'IT',
  'Spain': 'ES',
  'Netherlands': 'NL',
  'Belgium': 'BE',
  'Luxembourg': 'LU',
  'Ireland': 'IE',
  'Portugal': 'PT',
  'Denmark': 'DK',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Finland': 'FI',
  'Switzerland': 'CH',
  'Canada': 'CA',
  'Singapore': 'SG',
  'New Zealand': 'NZ',
  'Greece': 'GR',
  'Israel': 'IL',
  'United Arab Emirates': 'AE',
  'Saudi Arabia': 'SA',
  'Austria': 'AT',
  'Bulgaria': 'BG',
  'Croatia': 'HR',
  'Hungary': 'HU',
  'Poland': 'PL',
  'Czech Republic': 'CZ',
  'Romania': 'RO',
  'Estonia': 'EE',
  'Latvia': 'LV',
  'Slovakia': 'SK',
  'Slovenia': 'SI',
  'Lithuania': 'LT',
  'Cyprus': 'CY',
  'Malta': 'MT',
  'Brazil': 'BR',
  'Chile': 'CL',
  'Mexico': 'MX',
  'Colombia': 'CO',
  'Japan': 'JP',
  'HongKong': 'HK',
  'Hong Kong': 'HK',
  'Peru': 'PE',
  'South Africa': 'ZA',
  'Thailand': 'TH',
  'Malaysia': 'MY',
  'Philippines': 'PH',
  'Indonesia': 'ID',
  'Vietnam': 'VN',
  'Taiwan': 'TW',
  'Korea': 'KR',
  'South Korea': 'KR',
  'Australia': 'AU',
}

// ─── Verification weights ─────────────────────────────────────────────────────

export const VERIFY_WEIGHTS = [
  0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30,
]

export function makeVerifyRows(): BracketRow[] {
  return VERIFY_WEIGHTS.map((w) => ({
    weight_min: 0,
    weight_max: w,
    representative_weight: w,
    label: `${w} kg`,
  }))
}

// ─── Competitor grouping ──────────────────────────────────────────────────────

export function buildCompetitorGroups(cards: CompetitorRateCard[]): CompetitorGroup[] {
  const map = new Map<string, CompetitorGroup>()
  for (const c of cards) {
    const groupKey = `${c.competitor_name}||${c.service_code}`
    if (!c.country_name_en) continue
    if (!map.has(groupKey)) {
      map.set(groupKey, {
        groupKey,
        competitor_name: c.competitor_name,
        service_code: c.service_code,
        label: (c.vendor_label?.trim() || `${c.competitor_name} ${c.service_code}`),
        currency: c.currency ?? 'TWD',
        fuel_surcharge_pct: c.fuel_surcharge_pct ?? 0,
        weight_step: c.weight_step ?? 0,
        cardsByCountry: {},
        countryOptions: [],
      })
    }
    const g = map.get(groupKey)!

    // Effective ISO code: stored country_code, or inferred from the name map
    const effectiveIso = c.country_code || COUNTRY_NAME_TO_CODE[c.country_name_en] || null

    // Double-index: by ISO code AND by country_name_en so lookups work with either
    if (effectiveIso) g.cardsByCountry[effectiveIso] = c
    g.cardsByCountry[c.country_name_en] = c

    // Primary key for countryOptions: ISO when available, name otherwise
    const primaryKey = effectiveIso || c.country_name_en
    if (!g.countryOptions.find((o) => o.code === primaryKey)) {
      const label = c.country_name_zh?.trim() || c.country_name_en || primaryKey
      g.countryOptions.push({ code: primaryKey, labelZh: label })
    }
  }
  for (const g of map.values()) {
    g.countryOptions.sort((a, b) => a.labelZh.localeCompare(b.labelZh, 'zh-TW'))
  }
  return [...map.values()]
}

// ─── Reference bracket rows ───────────────────────────────────────────────────

export function makeBracketLabel(min: number, max: number): string {
  return `${min}–${max} kg`
}

export function getBracketRows(
  slots: SlotDef[],
  groups: CompetitorGroup[],
  ownCards: GlobalRateCard[],
  country: string,
): BracketRow[] {
  // Priority: generated card > competitor card
  for (const slot of slots) {
    if (slot.source === 'generated' && slot.refId) {
      const card = ownCards.find((c) => c.id === slot.refId)
      const cb = card?.country_brackets?.find(
        (b) => b.country_code === country || b.country_name_en === country,
      )
      if (cb?.brackets?.length) {
        return cb.brackets.map((b) => ({
          weight_min: b.weight_min,
          weight_max: b.weight_max,
          representative_weight: getRepWeight(b.weight_min, b.weight_max),
          label: makeBracketLabel(b.weight_min, b.weight_max),
        }))
      }
    }
  }
  for (const slot of slots) {
    if (slot.source === 'competitor' && slot.refId) {
      const g = groups.find((g) => g.groupKey === slot.refId)
      // double-indexed, so works for both ISO and name lookup
      const card = g?.cardsByCountry[country]
      if (card?.brackets?.length) {
        return card.brackets.map((b) => ({
          weight_min: b.weight_min,
          weight_max: b.weight_max,
          representative_weight: getRepWeight(b.weight_min, b.weight_max),
          label: makeBracketLabel(b.weight_min, b.weight_max),
        }))
      }
    }
  }
  return []
}

function getRepWeight(min: number, max: number): number {
  if (max <= 0.5) return Math.round(((min + max) / 2) * 1000) / 1000
  if (max <= 2) return Math.min(min + 0.25, (min + max) / 2)
  return Math.min(min + 1, (min + max) / 2)
}

// ─── Price lookup ─────────────────────────────────────────────────────────────

export function priceFromCompetitorCard(
  card: CompetitorRateCard,
  repWeight: number,
): number | null {
  const bracket = card.brackets.find(
    (b) => repWeight > b.weight_min && repWeight <= b.weight_max,
  ) ?? (repWeight <= card.brackets[0]?.weight_max ? card.brackets[0] : card.brackets[card.brackets.length - 1])
  if (!bracket) return null
  return bracket.rate_per_kg * repWeight + bracket.reg_fee
}

export function priceFromOwnCard(
  card: GlobalRateCard,
  country: string,
  repWeight: number,
): number | null {
  // Match by ISO code or by country_name_en (handles mixed lookups)
  const cb = card.country_brackets?.find(
    (b) => b.country_code === country || b.country_name_en === country,
  )
  if (!cb?.brackets?.length) return null
  const bracket = cb.brackets.find(
    (b) => repWeight > b.weight_min && repWeight <= b.weight_max,
  ) ?? cb.brackets[cb.brackets.length - 1]
  if (!bracket) return null
  return bracket.rate_per_kg * repWeight + bracket.reg_fee
}

export function getCellValue(
  slot: SlotDef,
  groups: CompetitorGroup[],
  ownCards: GlobalRateCard[],
  country: string,
  repWeight: number,
  scenarioCostHkd: number | null | undefined,
  twdPerHkd: number,
): CellValue {
  if (slot.source === 'competitor') {
    const g = groups.find((g) => g.groupKey === slot.refId)
    // Double-indexed: works for both ISO code ('US') and country_name_en ('United States')
    const card = g?.cardsByCountry[country]
    if (!g || !card) return { value_twd: null, is_cost: false }
    const priceRaw = priceFromCompetitorCard(card, repWeight)
    if (priceRaw == null) return { value_twd: null, is_cost: false }
    // Convert to TWD if the competitor card is priced in HKD
    const priceTwd = g.currency === 'HKD' ? priceRaw * twdPerHkd : priceRaw
    return { value_twd: priceTwd, is_cost: false }
  }
  if (slot.source === 'generated') {
    const card = ownCards.find((c) => c.id === slot.refId)
    if (!card) return { value_twd: null, is_cost: false }
    const priceRaw = priceFromOwnCard(card, country, repWeight)
    if (priceRaw == null) return { value_twd: null, is_cost: false }
    // Convert to TWD if the own card is priced in HKD
    const priceTwd = card.currency === 'HKD' ? priceRaw * twdPerHkd : priceRaw
    return { value_twd: priceTwd, is_cost: false }
  }
  if (slot.source === 'scenario') {
    if (scenarioCostHkd == null) return { value_twd: null, is_cost: true }
    // twdPerHkd = ~4.098 (TWD per 1 HKD), so multiply to convert HKD → TWD
    return { value_twd: Math.round(scenarioCostHkd * twdPerHkd), is_cost: true }
  }
  return { value_twd: null, is_cost: false }
}

// ─── Comparison metric ────────────────────────────────────────────────────────

export interface ComparisonMetric {
  type: 'price_diff' | 'margin'
  pct: number   // positive = more expensive / better margin
  label: string // human readable
}

/** Compute comparison between any two cell values. */
export function compareTwo(a: CellValue, b: CellValue): ComparisonMetric | null {
  if (a.value_twd == null || b.value_twd == null) return null
  if (!a.is_cost && !b.is_cost) {
    // price vs price → % diff (a vs b)
    const diff = (a.value_twd - b.value_twd) / b.value_twd
    return {
      type: 'price_diff',
      pct: diff,
      label: diff > 0 ? `A比B貴 ${fmt(diff)}` : `A比B便宜 ${fmt(-diff)}`,
    }
  }
  if (!a.is_cost && b.is_cost) {
    // a = price, b = cost → margin
    const margin = (a.value_twd - b.value_twd) / a.value_twd
    return { type: 'margin', pct: margin, label: `毛利 ${fmt(margin)}` }
  }
  if (a.is_cost && !b.is_cost) {
    const margin = (b.value_twd - a.value_twd) / b.value_twd
    return { type: 'margin', pct: margin, label: `毛利 ${fmt(margin)}` }
  }
  // cost vs cost → % diff
  const diff = (a.value_twd - b.value_twd) / b.value_twd
  return { type: 'price_diff', pct: diff, label: diff > 0 ? `A貴 ${fmt(diff)}` : `A便宜 ${fmt(-diff)}` }
}

function fmt(pct: number): string {
  return `${(pct * 100).toFixed(1)}%`
}

// ─── Draft card generation ────────────────────────────────────────────────────

/** Scale rate_per_kg only — reg_fee is NOT adjusted by % (only editable manually in Step 4) */
export function scaleByPct(brackets: DraftBracket[], adjPct: number): DraftBracket[] {
  return brackets.map((b) => {
    const rate = Math.round(b.rate_per_kg * (1 + adjPct) * 100) / 100
    return { ...b, rate_per_kg: rate, original_rate_per_kg: rate }
  })
}

/** Build draft bracket from competitor card brackets — only rate_per_kg is adjusted */
export function draftFromCompetitorCard(
  card: CompetitorRateCard,
  adjPct: number,
  currency = 'TWD',
  twdPerHkd = 1,
): DraftBracket[] {
  const toTwd = currency === 'HKD' ? twdPerHkd : 1
  return card.brackets.map((b) => {
    const rep = getRepWeight(b.weight_min, b.weight_max)
    // baseRate = source rate converted to TWD, rounded to integer (no markup)
    const baseRate = Math.round(b.rate_per_kg * toTwd)
    // current rate = base + Step 3 markup, also integer
    const rate = Math.round(baseRate * (1 + adjPct))
    return {
      weight_min: b.weight_min,
      weight_max: b.weight_max,
      representative_weight: rep,
      label: makeBracketLabel(b.weight_min, b.weight_max),
      rate_per_kg: rate,
      reg_fee: Math.round(b.reg_fee * toTwd),  // convert + round, no markup
      original_rate_per_kg: baseRate,           // pre-markup base — used to show % in Step 4
    }
  })
}

/** Build draft bracket from GlobalRateCard country brackets — only rate_per_kg is adjusted */
export function draftFromOwnCard(
  brackets: Array<{ weight_min: number; weight_max: number; rate_per_kg: number; reg_fee: number }>,
  adjPct: number,
  currency = 'TWD',
  twdPerHkd = 1,
): DraftBracket[] {
  const toTwd = currency === 'HKD' ? twdPerHkd : 1
  return brackets.map((b) => {
    const rep = getRepWeight(b.weight_min, b.weight_max)
    const baseRate = Math.round(b.rate_per_kg * toTwd)
    const rate = Math.round(baseRate * (1 + adjPct))
    return {
      weight_min: b.weight_min,
      weight_max: b.weight_max,
      representative_weight: rep,
      label: makeBracketLabel(b.weight_min, b.weight_max),
      rate_per_kg: rate,
      reg_fee: Math.round(b.reg_fee * toTwd),
      original_rate_per_kg: baseRate,
    }
  })
}

/** Build draft bracket from scenario costs (cost_hkd at each bracket) */
export function draftFromScenarioCosts(
  bracketRows: BracketRow[],
  costsHkd: Array<number | null>,
  markupPct: number,
  twdPerHkd: number,
): DraftBracket[] {
  return bracketRows.map((b, i) => {
    const costHkd = costsHkd[i] ?? null
    const costTwd = costHkd != null ? costHkd * twdPerHkd : null
    // baseRate = cost per kg (before markup), rounded to integer
    const baseRate = costTwd != null && b.representative_weight > 0
      ? Math.round(costTwd / b.representative_weight)
      : 0
    const rate = Math.round(baseRate * (1 + markupPct))
    return {
      ...b,
      rate_per_kg: rate,
      reg_fee: 0,
      cost_twd: costTwd != null ? Math.round(costTwd) : undefined,
      original_rate_per_kg: baseRate,  // pre-markup cost-based rate
    }
  })
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function fmtTwd(n: number | null): string {
  if (n == null) return '—'
  return `TWD ${n.toFixed(0)}`
}

export function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

export function marginColorClass(pct: number): string {
  if (pct >= 0.2) return 'text-green-600'
  if (pct >= 0.05) return 'text-yellow-600'
  return 'text-red-600'
}

export function diffColorClass(pct: number): string {
  if (pct <= -0.03) return 'text-green-600'  // cheaper is good
  if (pct >= 0.03) return 'text-red-500'     // more expensive
  return 'text-muted-foreground'
}
