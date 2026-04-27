import * as XLSX from 'xlsx'

export interface ParsedCompetitorCard {
  competitor_name: string
  service_code: string
  country_name_en: string
  country_name_zh: string
  country_code?: string
  brackets: Array<{
    weight_range: string
    weight_min: number
    weight_max: number
    rate_per_kg: number
    reg_fee: number
  }>
  pricing_formula: string
  currency: string
  effective_date?: string
  fuel_surcharge_pct?: number
  weight_step?: number
  vendor_label?: string
}

/** One product sheet detected in a Yuntu workbook. */
export interface YuntuProductSheet {
  sheet_name: string
  product_name_zh: string
  service_code: string
  effective_date?: string
  cards: ParsedCompetitorCard[]
}

// Map common Yuntu country names to our country codes
const COUNTRY_CODE_MAP: Record<string, string> = {
  'United States': 'US',
  'United Kindgom': 'GB', // typo in their sheet
  'United Kingdom': 'GB',
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
}

/**
 * Parse rows from one Yuntu product sheet into ParsedCompetitorCard[].
 * Expects columns: Country, 國家, 重量(KG), 運費(HKD/KG), 掛號費(HKD/Parcel).
 * `data` is the already-unwrapped sheet_to_json result (header:1 mode).
 */
function parseYuntuSheetData(
  data: unknown[][],
  serviceCode: string,
  competitorName = '雲途',
): ParsedCompetitorCard[] {
  const cards: ParsedCompetitorCard[] = []
  let current: ParsedCompetitorCard | null = null

  for (let i = 2; i < data.length; i++) {
    const row = data[i]
    if (!row || !Array.isArray(row) || row.length < 4) continue

    // Skip header rows for different pricing sections
    const col0 = String(row[0] ?? '')
    if (col0.includes('Countries') || col0.includes('Areas')) continue

    // New country row
    if (row[0] != null && col0.trim() !== '') {
      const nameEn = col0.trim()
      const nameZh = String(row[1] ?? '').trim()
      // Skip zone-specific entries (like "Australia (Metro)\nZone1")
      const cleanNameEn = nameEn.split('\n')[0].replace(/\s*\(.*?\)\s*/, '').trim()
      const cleanNameZh = nameZh.split('\n')[0].trim()

      current = {
        competitor_name: competitorName,
        service_code: serviceCode,
        country_name_en: cleanNameEn,
        country_name_zh: cleanNameZh,
        country_code: COUNTRY_CODE_MAP[cleanNameEn] || COUNTRY_CODE_MAP[nameEn],
        brackets: [],
        pricing_formula: 'per_kg_plus_reg',
        currency: 'HKD',
      }
      cards.push(current)
    }

    if (!current) continue

    // Parse bracket
    const rangeRaw = String(row[2] ?? '')
    const rateVal = row[3]
    if (!rangeRaw || rateVal == null) continue

    // Parse weight range: "0<W≤0.1" or "0＜W≤0.3" etc
    const rangeClean = rangeRaw.replace(/KG/gi, '').trim()
    const m = rangeClean.match(/([0-9.]+)\s*[<＜]\s*W\s*[≤]\s*([0-9.]+)/)
    if (!m) continue

    const weightMin = parseFloat(m[1])
    const weightMax = parseFloat(m[2])
    const ratePerKg = typeof rateVal === 'number' ? rateVal : parseFloat(String(rateVal))
    const regFee = typeof row[4] === 'number' ? row[4] : parseFloat(String(row[4] ?? '0'))

    if (isNaN(ratePerKg)) continue

    current.brackets.push({
      weight_range: rangeClean,
      weight_min: weightMin,
      weight_max: weightMax,
      rate_per_kg: ratePerKg,
      reg_fee: isNaN(regFee) ? 0 : regFee,
    })
  }

  // Filter out countries with no brackets
  return cards.filter((c) => c.brackets.length > 0)
}

/**
 * Detect whether a sheet is a Yuntu product price sheet by inspecting the header row.
 * Product sheets share the same header at row index 2:
 *   "Countries / Areas" | "國家 / 地區" | "重量(KG)…" | "運費(HKD/KG)…" | "掛號費(HKD/Parcel)…"
 * Also extract service_code and product_name_zh from row 0.
 */
function detectYuntuProduct(data: unknown[][]): {
  isProduct: boolean
  serviceCode?: string
  productName?: string
  effectiveDate?: string
} {
  if (!data || data.length < 4) return { isProduct: false }

  // Row 2 header check
  const header = data[2]
  if (!Array.isArray(header)) return { isProduct: false }
  const h0 = String(header[0] ?? '').toLowerCase()
  const h2 = String(header[2] ?? '')
  const h3 = String(header[3] ?? '')
  const h4 = String(header[4] ?? '')
  const looksLikeHeader =
    (h0.includes('countries') || h0.includes('areas')) &&
    h2.includes('重量') &&
    h3.includes('運費') &&
    h4.includes('掛號')
  if (!looksLikeHeader) return { isProduct: false }

  // Row 0 parse — service code lives in col 7 or so ("運輸代碼:\nHKTHZXR\n…"),
  // product name in col 2 ("香港雲途全球專線服務\nHK YunExp…"),
  // effective date in col 7 too ("生效日期:\n2026年04月06日…")
  const row0 = data[0] as unknown[]
  let serviceCode: string | undefined
  let productName: string | undefined
  let effectiveDate: string | undefined
  for (const cell of row0 ?? []) {
    const s = String(cell ?? '').trim()
    if (!s) continue
    if (s.includes('運輸代碼')) {
      const m = s.match(/運輸代碼[:：]?\s*([A-Za-z0-9-]+)/)
      if (m) serviceCode = m[1]
    }
    if (s.includes('生效日期')) {
      const m = s.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/)
      if (m) effectiveDate = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    }
    if (!productName && (s.includes('服務') || s.includes('專線') || s.includes('掛號'))) {
      productName = s.split('\n')[0].trim()
    }
  }
  return { isProduct: true, serviceCode, productName, effectiveDate }
}

/**
 * Scan a Yuntu workbook and extract all product price sheets.
 * Skips non-product sheets (version history, prohibited goods lists, zone tables, etc.)
 * by matching on the canonical header row 2 signature.
 */
export function parseYuntuWorkbook(
  file: ArrayBuffer,
  competitorName = '雲途',
): YuntuProductSheet[] {
  const wb = XLSX.read(file, { type: 'array' })
  const products: YuntuProductSheet[] = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
    const probe = detectYuntuProduct(data)
    if (!probe.isProduct) continue

    // Prefer service_code from header row 0, fallback to sheet name suffix
    const codeFromSheet = sheetName.match(/([A-Z][A-Z0-9-]{2,})\s*$/)?.[1]
    const serviceCode = probe.serviceCode ?? codeFromSheet ?? sheetName

    const cards = parseYuntuSheetData(data, serviceCode, competitorName)
    if (cards.length === 0) continue

    // Fill in effective_date on each card
    if (probe.effectiveDate) {
      for (const c of cards) c.effective_date = probe.effectiveDate
    }

    products.push({
      sheet_name: sheetName,
      product_name_zh: probe.productName ?? sheetName,
      service_code: serviceCode,
      effective_date: probe.effectiveDate,
      cards,
    })
  }
  return products
}

/**
 * Parse a Yuntu-format Excel file — single-sheet legacy API.
 * New code should use {@link parseYuntuWorkbook} instead.
 */
export function parseYuntuExcel(
  file: ArrayBuffer,
  sheetName: string,
  serviceCode: string,
): ParsedCompetitorCard[] {
  const wb = XLSX.read(file, { type: 'array' })
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`找不到工作表: ${sheetName}`)
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  return parseYuntuSheetData(data, serviceCode)
}

/**
 * Parse an ECMS-format Excel file.
 * Expects a sheet with columns: Kg, Sell/Price/Total — absolute amounts per weight point.
 * Prices are stored in original currency (JPY); conversion to HKD happens at analysis time.
 */
export function parseEcmsExcel(
  file: ArrayBuffer,
  _jpyToHkd?: number,
): ParsedCompetitorCard[] {
  const wb = XLSX.read(file, { type: 'array' })
  const cards: ParsedCompetitorCard[] = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

    // Detect country code from sheet name (e.g., "US DDP" → "US")
    const countryMatch = sheetName.match(/^([A-Z]{2})\b/)
    const countryCode = countryMatch?.[1] ?? ''

    // Find header row with "Kg" and "Sell" (base rate without FSC)
    let headerRow = -1
    let sellCol = -1
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const row = data[i]
      if (!row) continue
      const kgIdx = row.findIndex((c) => String(c ?? '').trim() === 'Kg')
      if (kgIdx === 0) {
        headerRow = i
        // Prefer "Sell" column (base rate without FSC), fallback to "Price", then "Total"
        sellCol = row.findIndex((c) => String(c ?? '').toLowerCase().startsWith('sell'))
        if (sellCol < 0) sellCol = row.findIndex((c) => String(c ?? '').toLowerCase().startsWith('price'))
        if (sellCol < 0) sellCol = row.findIndex((c) => String(c ?? '').toLowerCase().startsWith('total'))
        break
      }
    }
    if (headerRow < 0 || sellCol < 0) continue

    // Extract FSC percentage from the header row (e.g. "FSC (202602: 19%)")
    let fscPct = 0
    if (headerRow >= 0 && data[headerRow]) {
      const fscColIdx = data[headerRow].findIndex((c: unknown) =>
        String(c ?? '').toLowerCase().startsWith('fsc'),
      )
      if (fscColIdx >= 0) {
        const fscHeader = String(data[headerRow][fscColIdx] ?? '')
        const fscMatch = fscHeader.match(/(\d+(?:\.\d+)?)%/)
        if (fscMatch) fscPct = parseFloat(fscMatch[1])
      }
    }
    // Fallback: check cells before header for a decimal percentage (e.g. 0.19)
    if (fscPct === 0) {
      for (let i = 0; i < headerRow; i++) {
        const row = data[i]
        if (!row) continue
        for (const cell of row) {
          if (typeof cell === 'number' && cell > 0 && cell < 1) {
            fscPct = Math.round(cell * 10000) / 100
            break
          }
        }
        if (fscPct > 0) break
      }
    }

    // Build brackets from data rows
    const brackets: ParsedCompetitorCard['brackets'] = []
    let prevWeight = 0

    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i]
      if (!row) continue
      const weightKg = typeof row[0] === 'number' ? row[0] : parseFloat(String(row[0] ?? ''))
      const rawTotal = row[sellCol]
      const totalAmount = typeof rawTotal === 'number' ? rawTotal : parseFloat(String(rawTotal ?? ''))
      if (isNaN(weightKg) || isNaN(totalAmount) || weightKg <= 0) continue

      const weightMin = prevWeight
      const weightMax = weightKg

      // ECMS uses absolute pricing per weight step (0.5kg increments).
      // Store rate_per_kg in original currency (JPY) = amount / weightMax,
      // so that rate_per_kg * ceilingWeight = original amount.
      const ratePerKg = Math.round((totalAmount / weightMax) * 100) / 100

      brackets.push({
        weight_range: `${weightMin}<W≤${weightMax}`,
        weight_min: weightMin,
        weight_max: weightMax,
        rate_per_kg: ratePerKg,
        reg_fee: 0,
      })
      prevWeight = weightKg
    }

    if (brackets.length === 0) continue

    // Reverse-lookup country name from code
    const countryNameEn = Object.entries(COUNTRY_CODE_MAP).find(([, v]) => v === countryCode)?.[0] ?? countryCode
    const countryNameZh = countryCode === 'US' ? '美國' : countryCode === 'JP' ? '日本' : countryCode

    cards.push({
      competitor_name: 'ECMS',
      service_code: sheetName.replace(/\s+/g, '_'),
      country_name_en: countryNameEn,
      country_name_zh: countryNameZh,
      country_code: countryCode || undefined,
      brackets,
      pricing_formula: 'absolute_per_weight',
      currency: 'JPY',
      fuel_surcharge_pct: fscPct,
      weight_step: 0.5,
    })
  }

  return cards
}
