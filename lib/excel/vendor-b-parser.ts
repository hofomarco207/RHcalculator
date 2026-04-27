import type { BSurcharge, VendorBRate } from '@/types/vendor'
import * as XLSX from 'xlsx'

/**
 * Parse a B段 vendor air freight quote Excel file.
 * Expected format: columns as per iMile 空運報價 template.
 *
 * Column layout (0-indexed):
 *  0: 供应商名称   5: 目的港(gateway)   7: 航司
 *  9: 时效        10: 重量段(kg)       11: 币种
 * 13: rate/kg    14: 计泡比
 * 15/16: 提货费 method / amount
 * 17/18: 过港费 method / amount
 * 19/20: 操作费 method / amount
 * 21/22: 文件费 method / amount
 * 23/24: 验电费 method / amount
 * 25/26: 报关费 method / amount
 * 27/28: 机场接驳费 method / amount
 * 29/30: 磁检费 method / amount
 * 31: 航频    32: 备注
 */

export interface ParsedBRateRow extends Omit<VendorBRate, 'id' | 'vendor_id' | 'is_current' | 'created_at'> {
  // service_name inherited from VendorBRate — we set it to `{供应商}-{航司}`
}

export interface ParsedBQuoteResult {
  rates: ParsedBRateRow[]
  services: string[]     // distinct service names (supplier-airline)
  gateways: string[]
  skippedRows: number
}

/** Parse "300+" → 300, "1000+" → 1000 */
function parseTierMinKg(tier: string): number {
  const match = String(tier).match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

/** Parse frequency → flights per week: "DAILY"→7, "D1235"→4, "D246"→3, etc. */
function parseFlightsPerWeek(freq: string): number {
  if (!freq) return 7
  const s = String(freq).toUpperCase().trim()
  if (s === 'DAILY') return 7
  const dMatch = s.match(/^D(\d+)$/)
  if (dMatch) return dMatch[1].length
  return 7
}

/**
 * Map 计泡比 rule text to scalar multiplier.
 * Assumes typical V/A = 1.5 (volumetric weight divisor).
 *   计1/3泡 ≈ weight × (1 + (1.5-1)×2/3) = 1.33
 *   计1/2泡 ≈ weight × (1 + (1.5-1)/2) = 1.25
 *   计全泡  = 1.5
 *   (空/其他) = 1.0
 */
function parseBubbleRatio(ruleText: string): number {
  const s = String(ruleText ?? '').trim()
  if (!s) return 1.0
  if (s.includes('全泡')) return 1.5
  if (s.includes('1/3')) return 1.33
  if (s.includes('1/2')) return 1.25
  return 1.0
}

/** Try to parse a cell as a plain number (returns null if not numeric). */
function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value
  const n = parseFloat(String(value).trim())
  return isNaN(n) ? null : n
}

/**
 * Parse a per-kg-with-min amount cell, e.g. "提货0.6/K MIN600" or "0.6/K MIN600".
 * Returns { name?, rate, min } or null.
 */
function parsePerKgWithMin(value: unknown): { name?: string; rate: number; min: number } | null {
  if (value == null) return null
  const s = String(value).trim()
  // Match: optional name prefix, rate (e.g. 0.6), /K, MIN NNN
  const m = s.match(/^(\D*?)\s*(\d+(?:\.\d+)?)\s*\/\s*[Kk]\s*MIN\s*(\d+(?:\.\d+)?)/i)
  if (!m) return null
  const name = m[1]?.trim() || undefined
  return { name, rate: parseFloat(m[2]), min: parseFloat(m[3]) }
}

/**
 * Convert a single (method, amount, feeName, currency) column pair to a BSurcharge.
 * Returns null if the pair is empty or unrecognized.
 */
function surchargeFromColumnPair(
  method: unknown,
  amount: unknown,
  feeName: string,
  currency: string,
): BSurcharge | null {
  const methodStr = String(method ?? '').trim()
  if (!methodStr) {
    // No method → check if amount alone is a number (best-effort fallback = per_mawb)
    const n = asNumber(amount)
    if (n != null && n > 0) {
      return {
        name: feeName,
        unit: 'per_mawb',
        amount: n,
        rate: null,
        min: null,
        currency,
        condition: null,
        from_notes: false,
      }
    }
    return null
  }

  // 按主单 = per_mawb fixed amount
  if (methodStr.includes('按主单') || methodStr.includes('按主單')) {
    const n = asNumber(amount)
    if (n == null || n <= 0) return null
    return {
      name: feeName,
      unit: 'per_mawb',
      amount: n,
      rate: null,
      min: null,
      currency,
      condition: null,
      from_notes: false,
    }
  }

  // 按重量单价 = per_kg (possibly with min)
  if (methodStr.includes('按重量') || methodStr.includes('按公斤')) {
    const parsed = parsePerKgWithMin(amount)
    if (parsed) {
      return {
        name: feeName,
        unit: 'per_kg_with_min',
        amount: null,
        rate: parsed.rate,
        min: parsed.min,
        currency,
        condition: null,
        from_notes: false,
      }
    }
    // fallback: plain per-kg rate without min
    const n = asNumber(amount)
    if (n != null && n > 0) {
      return {
        name: feeName,
        unit: 'per_kg',
        amount: null,
        rate: n,
        min: null,
        currency,
        condition: null,
        from_notes: false,
      }
    }
    return null
  }

  // Unknown method, but has numeric amount → best-effort per_mawb
  const n = asNumber(amount)
  if (n != null && n > 0) {
    return {
      name: feeName,
      unit: 'per_mawb',
      amount: n,
      rate: null,
      min: null,
      currency,
      condition: null,
      from_notes: false,
    }
  }
  return null
}

/** Names of the 8 surcharge column pairs in order. */
const FEE_COLUMN_NAMES = [
  '提货费',
  '过港费',
  '操作费',
  '文件费',
  '验电费',
  '报关费',
  '机场接驳费',
  '磁检费',
] as const

/** Method col, amount col positions (0-indexed). */
const FEE_COLUMN_PAIRS: Array<[number, number]> = [
  [15, 16],
  [17, 18],
  [19, 20],
  [21, 22],
  [23, 24],
  [25, 26],
  [27, 28],
  [29, 30],
]

const CONDITIONAL_KEYWORDS = ['如果有', '实报实销', '實報實銷', '视情况', '視情況', 'TBD', '？', '?']
const ROUTING_RE = /\b([A-Z]{3}(?:\s*-\s*[A-Z]{3}){1,4})\b/

/**
 * Parse the 备注 column (col 32) into extra surcharges + residual notes.
 * Splits by common separators, classifies each segment:
 *  - contains conditional keywords → keep in notes
 *  - matches per_kg_with_min pattern → surcharge (from_notes=true)
 *  - matches fixed fee pattern (名称 + 幣種 + 數字) → surcharge per_mawb (from_notes=true)
 *  - routing pattern extracted separately
 *  - otherwise → keep in notes
 */
function parseNotesColumn(
  raw: string,
  defaultCurrency: string,
): { extras: BSurcharge[]; residualNotes: string; routing?: string } {
  const extras: BSurcharge[] = []
  const noteSegments: string[] = []
  let routing: string | undefined

  const text = String(raw ?? '').trim()
  if (!text) return { extras, residualNotes: '', routing }

  const segments = text.split(/[,，;；\n]+/).map(s => s.trim()).filter(Boolean)

  for (const seg of segments) {
    // Routing (e.g. HKG-ICN-LAX)
    if (!routing) {
      const rm = seg.match(ROUTING_RE)
      if (rm) {
        routing = rm[1].replace(/\s+/g, '')
        // If the segment is *only* a routing, drop it; otherwise keep remainder in notes
        const remainder = seg.replace(rm[0], '').trim().replace(/^[，,]+|[，,]+$/g, '')
        if (remainder) noteSegments.push(remainder)
        continue
      }
    }

    // Conditional → notes only
    if (CONDITIONAL_KEYWORDS.some(k => seg.includes(k))) {
      noteSegments.push(seg)
      continue
    }

    // per_kg_with_min pattern: "名称 0.5/K MIN500"
    const pkm = seg.match(/^(\S+?)\s*(\d+(?:\.\d+)?)\s*\/\s*[Kk]\s*MIN\s*(\d+(?:\.\d+)?)/)
    if (pkm) {
      extras.push({
        name: pkm[1].trim(),
        unit: 'per_kg_with_min',
        amount: null,
        rate: parseFloat(pkm[2]),
        min: parseFloat(pkm[3]),
        currency: defaultCurrency,
        condition: null,
        from_notes: true,
      })
      continue
    }

    // Fixed fee with optional currency: "登停费RMB180" / "分单费 50 RMB" / "操作费180"
    const fx = seg.match(/^(\S+?费)\s*(RMB|HKD|USD)?\s*(\d+(?:\.\d+)?)/)
    if (fx) {
      extras.push({
        name: fx[1].trim(),
        unit: 'per_mawb',
        amount: parseFloat(fx[3]),
        rate: null,
        min: null,
        currency: (fx[2] as string) || defaultCurrency,
        condition: null,
        from_notes: true,
      })
      continue
    }

    // Unrecognized → keep in notes
    noteSegments.push(seg)
  }

  return {
    extras,
    residualNotes: noteSegments.join(' | '),
    routing,
  }
}

export function parseVendorBExcel(buffer: ArrayBuffer): ParsedBQuoteResult {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

  const rates: ParsedBQuoteResult['rates'] = []
  const serviceSet = new Set<string>()
  const gatewaySet = new Set<string>()
  let skippedRows = 0

  // Skip header row (index 0), process data rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 14) { skippedRows++; continue }

    const supplierName = String(row[0] ?? '').trim()
    const gateway = String(row[5] ?? '').trim().toUpperCase()
    const airline = String(row[7] ?? '').trim()
    const transitDays = String(row[9] ?? '').trim()
    const tierStr = String(row[10] ?? '').trim()
    const currencyRaw = String(row[11] ?? '').trim().toUpperCase()
    const ratePerKg = typeof row[13] === 'number' ? row[13] : parseFloat(String(row[13] ?? ''))
    const bubbleRuleText = String(row[14] ?? '').trim()
    const frequency = String(row[31] ?? '').trim()
    const notesRaw = String(row[32] ?? '').trim()

    // Validate essential fields
    if (!supplierName || !gateway || isNaN(ratePerKg) || ratePerKg <= 0) {
      skippedRows++
      continue
    }

    const normalizedCurrency: 'HKD' | 'RMB' | 'USD' =
      currencyRaw === 'HKD' ? 'HKD' : currencyRaw === 'USD' ? 'USD' : 'RMB'

    // service_name = 供应商-航司
    const serviceName = airline ? `${supplierName}-${airline}` : supplierName

    // Bubble ratio auto-fill from col 14
    const bubbleRatio = parseBubbleRatio(bubbleRuleText)

    // Parse 8 surcharge column pairs
    const surcharges: BSurcharge[] = []
    for (let k = 0; k < FEE_COLUMN_PAIRS.length; k++) {
      const [methodCol, amountCol] = FEE_COLUMN_PAIRS[k]
      const sc = surchargeFromColumnPair(
        row[methodCol],
        row[amountCol],
        FEE_COLUMN_NAMES[k],
        normalizedCurrency,
      )
      if (sc) surcharges.push(sc)
    }

    // Parse notes col for extra surcharges + routing + residual text
    const { extras, residualNotes, routing } = parseNotesColumn(notesRaw, normalizedCurrency)
    surcharges.push(...extras)

    // Build final notes string: bubble rule + transit + routing remainder
    const noteParts: string[] = []
    if (bubbleRuleText) noteParts.push(`计泡: ${bubbleRuleText}`)
    if (transitDays) noteParts.push(`时效: ${transitDays}`)
    if (residualNotes) noteParts.push(residualNotes)
    const finalNotes = noteParts.join(' | ') || undefined

    serviceSet.add(serviceName)
    gatewaySet.add(gateway)

    rates.push({
      service_name: serviceName,
      gateway_code: gateway,
      airline: airline || undefined,
      weight_tier_min_kg: parseTierMinKg(tierStr),
      rate_per_kg: ratePerKg,
      currency: normalizedCurrency,
      bubble_ratio: bubbleRatio,
      transit_days: transitDays || undefined,
      frequency: frequency || undefined,
      flights_per_week: parseFlightsPerWeek(frequency),
      routing: routing,
      // Legacy per-MAWB fixed fee columns: all zero — everything now lives in surcharges JSONB
      pickup_fee: 0,
      handling_fee: 0,
      operation_fee: 0,
      document_fee: 0,
      battery_check_fee: 0,
      customs_fee: 0,
      airport_transfer_fee: 0,
      magnetic_check_fee: 0,
      surcharges,
      notes: finalNotes,
    })
  }

  return {
    rates,
    services: [...serviceSet],
    gateways: [...gatewaySet],
    skippedRows,
  }
}

/**
 * Group parsed rates by service name.
 */
export function groupRatesByService(
  result: ParsedBQuoteResult
): Map<string, ParsedBRateRow[]> {
  const map = new Map<string, ParsedBRateRow[]>()
  for (const rate of result.rates) {
    const key = rate.service_name ?? 'unknown'
    const existing = map.get(key) ?? []
    existing.push(rate)
    map.set(key, existing)
  }
  return map
}
