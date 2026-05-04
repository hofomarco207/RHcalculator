import * as XLSX from 'xlsx'
import { PRODUCT_SHEET_MAP } from './constants'
import { PriceCardRow, parseWeightRange, cleanCountry } from './calculations'

// ─── 解析價卡 Excel ────────────────────────────────────────────────────────
export function parsePriceCardExcel(buffer: ArrayBuffer): Record<string, PriceCardRow[]> {
  const wb = XLSX.read(buffer, { type: 'array' })
  const result: Record<string, PriceCardRow[]> = {}

  for (const [product, sheetName] of Object.entries(PRODUCT_SHEET_MAP)) {
    if (!wb.SheetNames.includes(sheetName)) continue
    const ws = wb.Sheets[sheetName]
    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
    })
    const rows = processSheet(data)
    if (rows.length > 0) result[product] = rows
  }

  return result
}

function processSheet(data: (string | number | null)[][]): PriceCardRow[] {
  let headerIdx = -1
  for (let i = 0; i < data.length; i++) {
    const rowVals = data[i].map((x) => String(x ?? ''))
    if (rowVals.some((v) => v.includes('國家 / 地區'))) { headerIdx = i; break }
  }
  if (headerIdx < 0) return []

  const rows: PriceCardRow[] = []
  let lastCountryCN = ''

  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i]
    if (!row || row.length < 7) continue

    const countryEN = String(row[0] ?? '')
    let countryCN = String(row[1] ?? '')
    const weightRange = String(row[2] ?? '')
    const rate = parseFloat(String(row[3] ?? '0')) || 0
    const regFee = parseFloat(String(row[4] ?? '0')) || 0
    const minWeightStr = String(row[5] ?? '0')
    const carry = String(row[6] ?? '')

    if (countryCN && countryCN !== 'null' && countryCN.trim()) {
      lastCountryCN = countryCN
    } else {
      countryCN = lastCountryCN
    }

    const minMatch = minWeightStr.match(/(\d+\.?\d*)/)
    const minWeight = minMatch ? parseFloat(minMatch[1]) : 0

    const s = countryCN.replace(/\n/g, ' ')
    const zm = s.match(/分區\s*(\d)|Zone\s*(\d)/i)
    const bn = cleanCountry(s)
    const matchKey = bn.includes('澳洲') && zm ? `澳洲-${zm[1] || zm[2]}` : bn

    const [wMin, wMax] = parseWeightRange(weightRange)

    if (matchKey) {
      rows.push({ countryEN, countryCN, weightRange, rate, regFee, minWeight, carry, matchKey, wMin, wMax })
    }
  }

  return rows
}

// ─── TMS 數據行 ───────────────────────────────────────────────────────────
export type TmsRow = Record<string, string | number | null>

export function parseTmsFile(buffer: ArrayBuffer): TmsRow[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const data: TmsRow[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
  return data.map((row) => {
    const cleaned: TmsRow = {}
    for (const [key, val] of Object.entries(row)) cleaned[key.trim()] = val
    return cleaned
  })
}

// ─── 生成 Excel 報告 ──────────────────────────────────────────────────────
export function generateReport(
  summaryData: Record<string, unknown>[],
  detailData: Record<string, unknown>[],
): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  const ws1 = XLSX.utils.json_to_sheet(summaryData)
  ws1['!cols'] = Array(10).fill({ wch: 18 })
  XLSX.utils.book_append_sheet(wb, ws1, '客戶帳款匯總')

  const ws2 = XLSX.utils.json_to_sheet(detailData)
  ws2['!cols'] = Array(26).fill({ wch: 18 })
  XLSX.utils.book_append_sheet(wb, ws2, '運單計算明細(含驗算)')

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}
