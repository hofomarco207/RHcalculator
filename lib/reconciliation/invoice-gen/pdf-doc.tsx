'use client'
// NOTE: This file must only be imported inside a dynamic import (client-side only)
// to avoid SSR issues with @react-pdf/renderer.

import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer'
import { InvoiceInfo, TransactionRow } from './types'

// ─── Chinese font (Traditional Chinese subset via CDN) ────────────────────
// Registered once on first call; @react-pdf caches it internally.
let fontRegistered = false
function ensureFont() {
  if (fontRegistered) return
  fontRegistered = true
  Font.register({
    family: 'NotoSansTC',
    fonts: [
      {
        src: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.0.12/files/noto-sans-tc-chinese-traditional-400-normal.woff2',
        fontWeight: 400,
      },
      {
        src: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.0.12/files/noto-sans-tc-chinese-traditional-700-normal.woff2',
        fontWeight: 700,
      },
    ],
  })
}

// ─── Styles ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansTC',
    fontSize: 9,
    padding: 36,
    color: '#111',
  },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 2 },
  company: { fontSize: 9, color: '#555', marginBottom: 16 },

  row: { flexDirection: 'row', marginBottom: 2 },
  col: { flex: 1 },
  colR: { flex: 1, alignItems: 'flex-end' },

  sectionLabel: { fontSize: 8, color: '#888', marginBottom: 2 },
  bold: { fontWeight: 700 },

  divider: { borderBottomWidth: 1, borderBottomColor: '#e0e0e0', marginVertical: 8 },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 2,
    marginTop: 8,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  th: { fontSize: 8, fontWeight: 700, color: '#555' },
  td: { fontSize: 8 },

  // column widths
  cDesc: { flex: 3 },
  cQty: { flex: 1, textAlign: 'center' },
  cPrice: { flex: 2, textAlign: 'right' },
  cTotal: { flex: 2, textAlign: 'right' },

  totalRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  totalLabel: { flex: 5, textAlign: 'right', color: '#555', fontSize: 8 },
  totalVal: { flex: 2, textAlign: 'right', fontSize: 8 },
  grandLabel: { flex: 5, textAlign: 'right', fontWeight: 700 },
  grandVal: { flex: 2, textAlign: 'right', fontWeight: 700 },

  footer: { marginTop: 24, fontSize: 8, color: '#888' },
  thankYou: { marginTop: 16, fontSize: 9, fontWeight: 700, color: '#333', textAlign: 'center' },
})

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

// ─── Invoice Document ─────────────────────────────────────────────────────

export function InvoicePDF({ info }: { info: InvoiceInfo }) {
  ensureFont()
  const safeDate = info.invoiceDate.replace(/\//g, '')
  const invoiceNo = `${info.clientCode}${safeDate}`
  const vat = Math.round(info.priceExTax * 0.05)
  const total = info.priceExTax + vat

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <Text style={s.title}>INVOICE</Text>
        <Text style={s.company}>香港商偉業技術有限公司台灣分公司</Text>

        <View style={s.divider} />

        {/* Bill To + Invoice meta */}
        <View style={s.row}>
          {/* Left: Bill To */}
          <View style={s.col}>
            <Text style={s.sectionLabel}>BILL TO</Text>
            <Text style={s.bold}>{info.clientName || info.clientCode}</Text>
            {info.companyName ? <Text>{info.companyName}</Text> : null}
            {info.address ? <Text style={{ color: '#555' }}>{info.address}</Text> : null}
            {info.phone ? <Text style={{ color: '#555' }}>{info.phone}</Text> : null}
          </View>
          {/* Right: Invoice details */}
          <View style={{ flex: 1 }}>
            <View style={s.row}>
              <Text style={[s.sectionLabel, { flex: 2 }]}>Invoice No</Text>
              <Text style={{ flex: 3 }}>{invoiceNo}</Text>
            </View>
            <View style={s.row}>
              <Text style={[s.sectionLabel, { flex: 2 }]}>Date</Text>
              <Text style={{ flex: 3 }}>{info.invoiceDate}</Text>
            </View>
            <View style={s.row}>
              <Text style={[s.sectionLabel, { flex: 2 }]}>Customer ID</Text>
              <Text style={{ flex: 3 }}>{info.clientCode}</Text>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        {/* Service table */}
        <View style={s.tableHeader}>
          <Text style={[s.th, s.cDesc]}>Description</Text>
          <Text style={[s.th, s.cQty]}>Qty</Text>
          <Text style={[s.th, s.cPrice]}>Price (TWD)</Text>
          <Text style={[s.th, s.cTotal]}>Line Total (TWD)</Text>
        </View>
        <View style={s.tableRow}>
          <Text style={[s.td, s.cDesc]}>Directline Shipping Fee</Text>
          <Text style={[s.td, s.cQty]}>1</Text>
          <Text style={[s.td, s.cPrice]}>{fmt(info.priceExTax)}</Text>
          <Text style={[s.td, s.cTotal]}>{fmt(info.priceExTax)}</Text>
        </View>

        {/* Totals */}
        <View style={{ marginTop: 8 }}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal (excl. VAT)</Text>
            <Text style={s.totalVal}>{fmt(info.priceExTax)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>5%  V.A.T</Text>
            <Text style={s.totalVal}>{fmt(vat)}</Text>
          </View>
          <View style={[s.totalRow, { borderTopWidth: 1, borderTopColor: '#e0e0e0', marginTop: 2 }]}>
            <Text style={s.grandLabel}>Grand Total (TWD)</Text>
            <Text style={s.grandVal}>{fmt(total)}</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={s.thankYou}>THANK YOU FOR YOUR BUSINESS!</Text>
        <Text style={[s.footer, { marginTop: 8 }]}>Bank: 凱基銀行 瑞光分行</Text>
      </Page>
    </Document>
  )
}

// ─── Helper: generate PDF Blob ────────────────────────────────────────────

export async function generatePdfBlob(info: InvoiceInfo): Promise<Blob> {
  // Dynamic import of pdf() to avoid SSR resolution
  const { pdf } = await import('@react-pdf/renderer')
  return pdf(<InvoicePDF info={info} />).toBlob()
}
