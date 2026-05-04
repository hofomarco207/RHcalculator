import * as XLSX from 'xlsx'
import { InvoiceInfo, TransactionRow } from './types'

// ─── 公司固定資訊 ─────────────────────────────────────────────────────────
const COMPANY_NAME = '香港商偉業技術有限公司台灣分公司'
const BANK_NAME = '凱基銀行 瑞光分行'

const COL_W = (w: number) => ({ wch: w })

// ─── Sheet 1: Service Invoice-Charges ────────────────────────────────────

function buildInvoiceSheet(info: InvoiceInfo): XLSX.WorkSheet {
  const safeDate = info.invoiceDate.replace(/\//g, '')
  const invoiceNo = `${info.clientCode}${safeDate}`
  const price = info.priceExTax
  const vat = Math.round(price * 0.05)
  const total = price + vat

  const fmtNum = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  // Build as array-of-arrays for precise layout
  const aoa: (string | number | null)[][] = [
    // row 1
    ['INVOICE', null, null, null, null, null, null],
    [COMPANY_NAME, null, null, null, null, null, null],
    [null, null, null, null, null, null, null],
    // row 4-8: Bill To + Invoice header
    ['Bill To:', null, null, null, null, 'Invoice No :', invoiceNo],
    [info.clientName, null, null, null, null, 'Date :', info.invoiceDate],
    [info.companyName, null, null, null, null, 'Customer ID :', info.clientCode],
    [info.address, null, null, null, null, null, null],
    [info.phone, null, null, null, null, null, null],
    [null, null, null, null, null, null, null],
    // row 10: table header
    ['Description', null, null, 'Qty', null, 'Price (TWD)', 'Line Total (TWD)'],
    // row 11: service line
    ['Directline Shipping Fee', null, null, 1, null, fmtNum(price), fmtNum(price)],
    // rows 12-19: blank
    ...Array(8).fill([null, null, null, null, null, null, null]),
    // row 20-22: totals
    [null, null, null, null, null, 'Subtotal (excl. VAT)', fmtNum(price)],
    [null, null, null, null, null, '5%  V.A.T', fmtNum(vat)],
    [null, null, null, null, null, 'Grand Total', fmtNum(total)],
    [null, null, null, null, null, null, null],
    // row 24: thank you
    ['THANK YOU FOR YOUR BUSINESS!', null, null, null, null, null, null],
    [null, null, null, null, null, null, null],
    // row 26: bank
    [BANK_NAME, null, null, null, null, null, null],
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Column widths: A B C D E F G
  ws['!cols'] = [COL_W(36), COL_W(6), COL_W(6), COL_W(8), COL_W(6), COL_W(22), COL_W(18)]

  return ws
}

// ─── Sheet 2: Transaction Record ─────────────────────────────────────────

function buildTransactionSheet(txns: TransactionRow[]): XLSX.WorkSheet {
  const data = txns.map((t) => ({
    'ClientCode': t.clientCode,
    'TrackingNumber': t.trackingNo,
    'DestinationCountry': t.destination,
    'Currency': t.currency,
    'ChargeWeight': t.chargeWeight,
    'Freight': t.freightA,
    'Tracking Fee': t.regFeeA,
    'AdditionalFee': t.surchargeA,
    'TotalCost': t.totalA,
    'ArrivalDate': t.arrivalDate,
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [
    COL_W(14), COL_W(22), COL_W(18), COL_W(8),
    COL_W(12), COL_W(10), COL_W(12), COL_W(14), COL_W(12), COL_W(14),
  ]
  return ws
}

// ─── Public: build full workbook ──────────────────────────────────────────

export function buildClientWorkbook(
  info: InvoiceInfo,
  txns: TransactionRow[],
): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildInvoiceSheet(info), 'Service Invoice-Charges')
  XLSX.utils.book_append_sheet(wb, buildTransactionSheet(txns), 'Transaction Record')
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}

// ─── Filename helper ──────────────────────────────────────────────────────

export function invoiceFilename(clientCode: string, invoiceDate: string): string {
  const safe = invoiceDate.replace(/\//g, '')
  return `${clientCode}_${safe}_invoice.xlsx`
}
