/**
 * Parse weight break Excel data.
 * Expects columns: weight_kg (or weight / 重量) and order_count (or orders / 票數 / 件數)
 */
export interface ParsedWeightBreakEntry {
  weight_kg: number
  order_count: number
}

export function parseWeightBreakExcel(buffer: ArrayBuffer): ParsedWeightBreakEntry[] {
  // Dynamic import to avoid loading xlsx at module level
  const XLSX = require('xlsx')
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('Excel file has no sheets')

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName])
  if (rows.length === 0) throw new Error('Sheet is empty')

  // Auto-detect column names
  const firstRow = rows[0]
  const keys = Object.keys(firstRow)

  const weightKey = keys.find((k) => {
    const low = k.toLowerCase()
    return low.includes('weight') || low.includes('重量') || low === 'kg' || low === 'weight_kg'
  })

  const countKey = keys.find((k) => {
    const low = k.toLowerCase()
    return low.includes('order') || low.includes('count') || low.includes('票數') ||
           low.includes('件數') || low.includes('數量') || low === 'order_count' || low === 'orders'
  })

  if (!weightKey) throw new Error(`Cannot find weight column. Available columns: ${keys.join(', ')}`)
  if (!countKey) throw new Error(`Cannot find order count column. Available columns: ${keys.join(', ')}`)

  const entries: ParsedWeightBreakEntry[] = []

  for (const row of rows) {
    const weight = parseFloat(String(row[weightKey]))
    const count = parseInt(String(row[countKey]), 10)

    if (isNaN(weight) || isNaN(count)) continue
    if (weight <= 0 || count <= 0) continue

    entries.push({ weight_kg: weight, order_count: count })
  }

  if (entries.length === 0) {
    throw new Error('No valid entries found. Ensure weight > 0 and order_count > 0.')
  }

  // Sort by weight
  entries.sort((a, b) => a.weight_kg - b.weight_kg)

  return entries
}
