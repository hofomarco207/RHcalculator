import * as XLSX from 'xlsx'
import { InvoiceInfo, TransactionRow } from './types'

type RawRow = Record<string, string | number | null | undefined>

function str(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number' && !isNaN(v)) {
    // Excel may store date as serial number
    return String(v)
  }
  return String(v).trim()
}

function num(v: unknown): number {
  if (v == null) return 0
  const n = parseFloat(str(v).replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

// Excel date serial → YYYY/MM/DD
function excelDateToString(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'number') {
    const date = XLSX.SSF.parse_date_code(v)
    if (date) {
      const y = date.y
      const m = String(date.m).padStart(2, '0')
      const d = String(date.d).padStart(2, '0')
      return `${y}/${m}/${d}`
    }
  }
  const s = str(v).split(' ')[0].replace(/-/g, '/')
  return s
}

export interface ParseResult {
  invoiceMap: Map<string, InvoiceInfo>
  billMap: Map<string, TransactionRow[]>
}

export function parseImportFile(buffer: ArrayBuffer, fallbackDate: string): ParseResult {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false })

  // ─── invoice sheet ───────────────────────────────────────────────────────
  const invoiceMap = new Map<string, InvoiceInfo>()
  if (wb.SheetNames.includes('invoice')) {
    const ws = wb.Sheets['invoice']
    const rows: RawRow[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
    for (const row of rows) {
      const code = str(row['客戶代碼'])
      if (!code) continue
      const rawDate = row['開立日期']
      const invoiceDate = rawDate ? excelDateToString(rawDate) : fallbackDate
      invoiceMap.set(code, {
        clientCode: code,
        clientName: str(row['客戶姓名']),
        companyName: str(row['公司名稱']),
        address: str(row['客戶地址']),
        phone: str(row['客戶電話']),
        priceExTax: num(row['未稅價格']),
        invoiceDate,
      })
    }
  }

  // ─── bill_audit sheet ────────────────────────────────────────────────────
  const billMap = new Map<string, TransactionRow[]>()
  if (wb.SheetNames.includes('bill_audit')) {
    const ws = wb.Sheets['bill_audit']
    const rows: RawRow[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
    for (const row of rows) {
      const code = str(row['客戶代碼'])
      if (!code) continue
      const txn: TransactionRow = {
        clientCode: code,
        trackingNo: str(row['業務單號']),
        destination: str(row['目的地']),
        currency: 'TWD',
        chargeWeight: num(row['計費重']),
        freightA: num(row['A價_運費']),
        regFeeA: num(row['A價_掛號']),
        surchargeA: num(row['A價_附加費(TWD)']),
        totalA: num(row['A價總額(TWD)']),
        arrivalDate: excelDateToString(row['到貨時間']),
      }
      const list = billMap.get(code) ?? []
      list.push(txn)
      billMap.set(code, list)
    }
  }

  return { invoiceMap, billMap }
}
