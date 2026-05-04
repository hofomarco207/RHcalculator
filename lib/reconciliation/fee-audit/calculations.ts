import { COUNTRY_MAP } from './constants'

// ─── 國家名稱清洗 ─────────────────────────────────────────────────────────
export function cleanCountry(name: string | null | undefined): string {
  if (!name) return ''
  let s = String(name).trim()
  s = s.replace(/\(.*?\)/g, '')
  s = s.replace(/[a-zA-Z]/g, '').trim()
  return COUNTRY_MAP[s] ?? s
}

// ─── 重量範圍解析 ─────────────────────────────────────────────────────────
export function parseWeightRange(s: string | null | undefined): [number, number] {
  if (!s) return [0, 0]
  const cleaned = String(s)
    .replace(/KG/gi, '')
    .replace(/\s/g, '')
    .replace(/＜/g, '<')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/＞/g, '>')
  const nums = cleaned.match(/[-+]?\d*\.?\d+/g)
  if (!nums) return [0, 9999]
  if (nums.length >= 2) return [parseFloat(nums[0]), parseFloat(nums[1])]
  if (nums.length === 1) return [0, parseFloat(nums[0])]
  return [0, 9999]
}

// ─── 價卡資料行 ───────────────────────────────────────────────────────────
export interface PriceCardRow {
  countryEN: string
  countryCN: string
  weightRange: string
  rate: number
  regFee: number
  minWeight: number
  carry: string
  matchKey: string
  wMin: number
  wMax: number
}

// ─── 價卡查詢 ─────────────────────────────────────────────────────────────
export function lookupPrice(
  pcRows: PriceCardRow[] | undefined,
  matchKey: string,
  weight: number,
): { freight: number; regFee: number } {
  if (!pcRows || pcRows.length === 0) return { freight: 0, regFee: 0 }
  let match = pcRows.find((r) => r.matchKey === matchKey && r.wMin < weight && r.wMax >= weight)
  if (!match) match = pcRows.find((r) => r.matchKey === matchKey)
  if (!match) return { freight: 0, regFee: 0 }
  const effectiveWeight = Math.max(weight, match.minWeight)
  return { freight: effectiveWeight * match.rate, regFee: match.regFee }
}

// ─── 計算結果行 ───────────────────────────────────────────────────────────
export interface ResultRow {
  transitStatus: string
  customerCode: string
  trackingNo: string
  destination: string
  chargeWeight: number
  upsCubic: number
  arrivalTime: string
  aFreight: number
  aRegFee: number
  aSurcharge: number
  aTotal: number
  cTmsCost: number
  cCalcCost: number
  cDiff: number
  pickupAlloc: number
  transitAlloc: number
  handlingFee: number
  totalCost: number
  profit: number
}

export interface SummaryRow {
  customerCode: string
  normalCount: number
  totalWeight: number
  aTotal: number
  profit: number
}
