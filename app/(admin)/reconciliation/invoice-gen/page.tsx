'use client'

import { useState, useCallback, useRef } from 'react'
import { parseImportFile } from '@/lib/reconciliation/invoice-gen/parser'
import { buildClientWorkbook, invoiceFilename } from '@/lib/reconciliation/invoice-gen/excel-builder'
import type { InvoiceInfo, TransactionRow, ClientResult } from '@/lib/reconciliation/invoice-gen/types'

// ─── File drop zone ────────────────────────────────────────────────────────

function FileDropZone({ label, sublabel, loaded, onFile }: {
  label: string; sublabel: string; loaded: string; onFile: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragging(false)
        const f = e.dataTransfer.files[0]; if (f) onFile(f)
      }}
      className={`relative rounded-xl border-2 ${dragging ? 'border-indigo-400 border-solid' : 'border-dashed border-indigo-300'} bg-indigo-50 p-6 transition-all cursor-pointer hover:opacity-80`}
    >
      <input ref={ref} type="file" accept=".xlsx" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <p className="font-semibold text-sm text-indigo-700">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
      {loaded
        ? <span className="mt-2 inline-block text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">✓ {loaded}</span>
        : <span className="mt-2 inline-block text-xs text-gray-400">點擊或拖曳上傳 .xlsx</span>
      }
    </div>
  )
}

// ─── Client row ───────────────────────────────────────────────────────────

function ClientRow({
  result, txnCount, onDownloadExcel, onPreviewPdf,
}: {
  result: ClientResult
  txnCount: number
  onDownloadExcel: () => void
  onPreviewPdf: () => void
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-white rounded-xl border border-gray-200">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{result.clientCode}</p>
        <p className="text-xs text-gray-500 truncate">{result.clientName} · {txnCount} 筆 · {result.invoiceDate}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onPreviewPdf}
          className="px-3 py-1.5 text-xs border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
        >
          預覽發票
        </button>
        <button
          onClick={onDownloadExcel}
          className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          下載 Excel
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function InvoiceGenPage() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/')
  const [importName, setImportName] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today)
  const [results, setResults] = useState<ClientResult[]>([])
  const [billMap, setBillMap] = useState<Map<string, TransactionRow[]>>(new Map())
  const [invoiceMap, setInvoiceMap] = useState<Map<string, InvoiceInfo>>(new Map())
  const [processing, setProcessing] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState('')

  const addLog = useCallback((msg: string) => setLog((l) => [...l, msg]), [])

  // Handle import file upload
  const handleImport = useCallback((file: File) => {
    setResults([]); setLog([]); setError('')
    setImportName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buf = e.target?.result as ArrayBuffer
        const { invoiceMap: im, billMap: bm } = parseImportFile(buf, invoiceDate)
        setInvoiceMap(im)
        setBillMap(bm)
        addLog(`✓ 讀取完成：發現 ${im.size} 位客戶`)
        im.forEach((info, code) => {
          const txns = bm.get(code) ?? []
          addLog(`  · ${code} — ${info.clientName || '無姓名'} — ${txns.length} 筆交易`)
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : '解析失敗')
      }
    }
    reader.readAsArrayBuffer(file)
  }, [invoiceDate, addLog])

  // Generate all Excel files
  const handleGenerate = useCallback(async () => {
    if (invoiceMap.size === 0) { setError('請先上傳匯入檔'); return }
    setProcessing(true); setError(''); setResults([])
    addLog('\n開始生成發票…')
    const out: ClientResult[] = []
    for (const [code, info] of invoiceMap) {
      const txns = billMap.get(code) ?? []
      addLog(`  [${code}] 生成中…`)
      const excelBuffer = buildClientWorkbook(info, txns)
      out.push({
        clientCode: code,
        clientName: info.clientName,
        excelBuffer,
        invoiceDate: info.invoiceDate,
      })
      addLog(`  [${code}] ✓ Excel 完成`)
    }
    setResults(out)
    addLog(`\n✓ 完成！共 ${out.length} 張發票`)
    setProcessing(false)
  }, [invoiceMap, billMap, addLog])

  // Download single Excel
  const downloadExcel = useCallback((result: ClientResult) => {
    const blob = new Blob([result.excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = invoiceFilename(result.clientCode, result.invoiceDate)
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // Download all as ZIP
  const downloadAllZip = useCallback(async () => {
    if (results.length === 0) return
    addLog('\n打包 ZIP 中…')
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    for (const r of results) {
      zip.file(invoiceFilename(r.clientCode, r.invoiceDate), r.excelBuffer)
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Invoices_${invoiceDate.replace(/\//g, '')}.zip`
    a.click()
    URL.revokeObjectURL(url)
    addLog('✓ ZIP 下載完成')
  }, [results, invoiceDate, addLog])

  // PDF preview in new tab (dynamic import to avoid SSR issues)
  const previewPdf = useCallback(async (result: ClientResult) => {
    const info = invoiceMap.get(result.clientCode)
    if (!info) return
    addLog(`\n[${result.clientCode}] 生成 PDF…（正在載入字型，請稍候）`)
    try {
      const { generatePdfBlob } = await import('@/lib/reconciliation/invoice-gen/pdf-doc')
      const blob = await generatePdfBlob(info)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      addLog(`✓ PDF 已在新分頁開啟`)
    } catch (err) {
      addLog(`⚠ PDF 生成失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    }
  }, [invoiceMap, addLog])

  return (
    <div className="flex h-full">
      {/* ── Left sidebar ── */}
      <aside className="w-64 flex-shrink-0 border-r bg-gray-50 flex flex-col">
        <div className="px-5 py-4 border-b">
          <h2 className="text-sm font-semibold text-gray-700">發票設定</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Invoice date override */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">
              預設開立日期
              <span className="text-gray-400 font-normal ml-1">（檔案有則優先）</span>
            </label>
            <input
              type="text"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              placeholder="YYYY/MM/DD"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
          </div>

          {/* Import format reminder */}
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-indigo-700">匯入格式說明</p>
            <p className="text-xs text-indigo-600 mt-1">Sheet 1 · <span className="font-mono">invoice</span></p>
            <p className="text-xs text-gray-400 leading-4">客戶代碼 · 客戶姓名 · 公司名稱 · 客戶地址 · 客戶電話 · 未稅價格 · 開立日期</p>
            <p className="text-xs text-indigo-600 mt-1">Sheet 2 · <span className="font-mono">bill_audit</span></p>
            <p className="text-xs text-gray-400 leading-4">費用稽核報告的「運單計算明細」格式</p>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={invoiceMap.size === 0 || processing}
            className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {processing ? '生成中…' : `生成發票${invoiceMap.size > 0 ? ` (${invoiceMap.size} 位)` : ''}`}
          </button>

          {/* ZIP download */}
          {results.length > 0 && (
            <button
              onClick={downloadAllZip}
              className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              全部下載 ZIP
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <h1 className="text-lg font-bold text-gray-900">發票生成</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            匯入費用稽核結果，自動產生每位客戶的 Excel 發票，支援一鍵打包下載
          </p>
        </div>

        {/* Upload */}
        <FileDropZone
          label="匯入費用稽核檔案"
          sublabel="需包含 invoice + bill_audit 兩個工作表的 .xlsx"
          loaded={importName}
          onFile={handleImport}
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Log */}
        {log.length > 0 && (
          <div className="rounded-xl bg-gray-900 text-green-400 font-mono text-xs p-4 max-h-40 overflow-y-auto">
            {log.map((line, i) => <p key={i}>{line}</p>)}
          </div>
        )}

        {/* Results list */}
        {results.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">已生成發票 ({results.length})</h2>
              <p className="text-xs text-gray-400">「預覽發票」需網路連線載入中文字型</p>
            </div>
            <div className="space-y-2">
              {results.map((r) => (
                <ClientRow
                  key={r.clientCode}
                  result={r}
                  txnCount={billMap.get(r.clientCode)?.length ?? 0}
                  onDownloadExcel={() => downloadExcel(r)}
                  onPreviewPdf={() => previewPdf(r)}
                />
              ))}
            </div>
          </div>
        )}

        {results.length === 0 && !processing && importName && invoiceMap.size > 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-3">📋</span>
            <p className="text-gray-500 text-sm">點擊左側「生成發票」開始處理</p>
          </div>
        )}

        {!importName && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-3">🧾</span>
            <p className="text-gray-500 text-sm">上傳匯入檔後，系統自動讀取客戶資訊</p>
            <p className="text-gray-400 text-xs mt-1">支援從費用稽核直接匯出的格式</p>
          </div>
        )}
      </main>
    </div>
  )
}
