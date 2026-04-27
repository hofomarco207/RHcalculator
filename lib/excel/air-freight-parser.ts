import * as XLSX from 'xlsx'
import type { GatewayCode } from '@/types'

export interface ParsedAirFreightRow {
  port_code: GatewayCode
  cargo_type: string
  week_label: string
  raw_price_hkd_per_kg: number
}

const VALID_PORTS: GatewayCode[] = ['LAX', 'JFK', 'ORD', 'DFW', 'MIA']

/**
 * Parse the "HKG直飞空运价格" sheet from an Excel workbook.
 * Expected layout:
 *   Row 1: headers — col A empty, col B "Airport", col C "Cargo Type", col D "Key", col E+ week labels
 *   Row 2+: data — B=port, C=cargo_type, D=concat key, E+=prices per week
 */
export function parseAirFreightExcel(buffer: ArrayBuffer): {
  records: ParsedAirFreightRow[]
  weeks: string[]
  ports: string[]
  cargoTypes: string[]
} {
  const wb = XLSX.read(buffer, { type: 'array' })

  // Try the expected sheet name, fall back to first sheet
  const sheetName = wb.SheetNames.find(n => n.includes('空运价格')) ?? wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error('找不到空運報價 sheet')

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
  if (rows.length < 2) throw new Error('Sheet 數據不足')

  // Row 0 is header: find week columns (starting from col index 4, i.e. column E)
  const headerRow = rows[0] as (string | undefined)[]
  const weeks: string[] = []
  const weekColIndices: number[] = []

  for (let col = 4; col < headerRow.length; col++) {
    const val = String(headerRow[col] ?? '').trim()
    if (val && /\d/.test(val)) {
      weeks.push(val)
      weekColIndices.push(col)
    }
  }

  // Parse data rows
  const records: ParsedAirFreightRow[] = []
  const portsSet = new Set<string>()
  const cargoTypesSet = new Set<string>()

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as (string | number | undefined)[]
    if (!row || row.length < 5) continue

    const portRaw = String(row[1] ?? '').trim().toUpperCase()
    const cargoType = String(row[2] ?? '').trim()

    if (!VALID_PORTS.includes(portRaw as GatewayCode) || !cargoType) continue

    const port_code = portRaw as GatewayCode
    portsSet.add(port_code)
    cargoTypesSet.add(cargoType)

    for (let w = 0; w < weekColIndices.length; w++) {
      const price = parseFloat(String(row[weekColIndices[w]] ?? ''))
      if (!isNaN(price) && price > 0) {
        records.push({
          port_code,
          cargo_type: cargoType,
          week_label: weeks[w],
          raw_price_hkd_per_kg: price,
        })
      }
    }
  }

  return {
    records,
    weeks,
    ports: Array.from(portsSet),
    cargoTypes: Array.from(cargoTypesSet),
  }
}
