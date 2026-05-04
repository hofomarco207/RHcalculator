// ─── 發票資訊（來自 invoice sheet）────────────────────────────────────────
export interface InvoiceInfo {
  clientCode: string
  clientName: string
  companyName: string
  address: string
  phone: string
  priceExTax: number   // 未稅價格 (TWD)
  invoiceDate: string  // YYYY/MM/DD — from sheet or fallback to UI date
}

// ─── 逐票交易記錄（來自 bill_audit sheet）──────────────────────────────────
export interface TransactionRow {
  clientCode: string
  trackingNo: string
  destination: string
  currency: string     // always 'TWD'
  chargeWeight: number
  freightA: number     // A價_運費
  regFeeA: number      // A價_掛號
  surchargeA: number   // A價_附加費(TWD)
  totalA: number       // A價總額(TWD)
  arrivalDate: string
}

// ─── 生成結果（每位客戶）────────────────────────────────────────────────
export interface ClientResult {
  clientCode: string
  clientName: string
  excelBuffer: ArrayBuffer
  invoiceDate: string
}
