'use client'

import { useState, useCallback, useRef } from 'react'
import { PriceCardRow, ResultRow, SummaryRow, cleanCountry, lookupPrice } from '@/lib/reconciliation/fee-audit/calculations'
import { getUpsFactor, C_SURCHARGE_COLS, A_SURCHARGE_COLS } from '@/lib/reconciliation/fee-audit/constants'
import { parsePriceCardExcel, parseTmsFile, generateReport, TmsRow } from '@/lib/reconciliation/fee-audit/excel-parser'

type AllocMode = 'per_kg' | 'per_shipment'

// ─── File drop zone ────────────────────────────────────────────────────────

function FileDropZone({
  label, sublabel, accept, loaded, color, onFile,
}: {
  label: string
  sublabel: string
  accept: string
  loaded: string
  color: 'blue' | 'green' | 'purple'
  onFile: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const colors = {
    blue:   { border: 'border-blue-300',   bg: 'bg-blue-50',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700' },
    green:  { border: 'border-green-300',  bg: 'bg-green-50',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700' },
    purple: { border: 'border-purple-300', bg: 'bg-purple-50', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
  }[color]

  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
      className={`relative rounded-xl border-2 ${dragging ? 'border-solid' : 'border-dashed'} ${colors.border} ${colors.bg} p-5 cursor-pointer transition-all hover:opacity-80`}
    >
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <p className={`font-semibold text-sm ${colors.text}`}>{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
      {loaded
        ? <span className={`mt-2 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>✓ 已載入 {loaded}</span>
        : <span className="mt-2 inline-block text-xs text-gray-400">點擊或拖曳上傳</span>
      }
    </div>
  )
}

// ─── Metric card ──────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
      {sub && <p className={`text-xs mt-1 ${alert ? 'text-red-500' : 'text-green-500'}`}>{sub}</p>}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function FeeAuditPage() {
  // 成本分攤
  const [pickupTotal, setPickupTotal] = useState(0)
  const [pickupMode, setPickupMode] = useState<AllocMode>('per_kg')
  const [transitTotal, setTransitTotal] = useState(0)
  const [transitMode, setTransitMode] = useState<AllocMode>('per_kg')
  const [handlingRate, setHandlingRate] = useState(0)

  // 價卡
  const [pcsA, setPcsA] = useState<Record<string, PriceCardRow[]> | null>(null)
  const [pcsC, setPcsC] = useState<Record<string, PriceCardRow[]> | null>(null)
  const [aLoaded, setALoaded] = useState('')
  const [cLoaded, setCLoaded] = useState('')
  const [tmsLoaded, setTmsLoaded] = useState('')

  // 結果
  const [results, setResults] = useState<ResultRow[]>([])
  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [processing, setProcessing] = useState(false)

  // 載入價卡
  const handlePriceCard = useCallback((file: File, type: 'A' | 'C') => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer
      const parsed = parsePriceCardExcel(buffer)
      const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
      if (type === 'A') { setPcsA(parsed); setALoaded(time) }
      else { setPcsC(parsed); setCLoaded(time) }
    }
    reader.readAsArrayBuffer(file)
  }, [])

  // 處理 TMS
  const handleTms = useCallback((file: File) => {
    if (!pcsA || !pcsC) return
    setProcessing(true)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer
        const tms = parseTmsFile(buffer)

        type TmsWithWeight = TmsRow & { W_num: number }
        const rows: TmsWithWeight[] = tms.map((row) => ({
          ...row,
          W_num: parseFloat(String(row['计费重量'] ?? '0').replace(/KG/gi, '').trim()) || 0,
        }))

        const totalWeight = rows.reduce((s, r) => s + r.W_num, 0)
        const totalShipments = rows.length
        const pkFactor = pickupMode === 'per_kg' && totalWeight > 0 ? pickupTotal / totalWeight : pickupTotal / (totalShipments || 1)
        const trFactor = transitMode === 'per_kg' && totalWeight > 0 ? transitTotal / totalWeight : transitTotal / (totalShipments || 1)

        const resultRows: ResultRow[] = rows.map((row) => {
          const prod = String(row['产品名称'] ?? '')
          const countryClean = cleanCountry(String(row['目的国家名称'] ?? ''))
          const weight = row.W_num
          const zone = String(row['分区'] ?? '1').split('.')[0]
          const matchKey = countryClean === '澳洲' ? `澳洲-${zone}` : countryClean

          const { freight: af, regFee: ar } = lookupPrice(pcsA[prod], matchKey, weight)
          const { freight: cfC, regFee: crC } = lookupPrice(pcsC[prod], matchKey, weight)

          const sumCols = (cols: string[]) =>
            cols.reduce((sum, col) => sum + (parseFloat(String(row[col] ?? '0')) || 0), 0)

          const sHkdC = sumCols(C_SURCHARGE_COLS)
          const sHkdA = sumCols(A_SURCHARGE_COLS)
          const aTotal = af + ar + sHkdA * 4
          const cTmsTwd = (parseFloat(String(row['原币总金额'] ?? '0').replace(/,/g, '')) || 0) * 4
          const cCalcTwd = (cfC + crC + sHkdC) * 4
          const ep = pickupMode === 'per_kg' ? pkFactor * weight : pkFactor
          const et = transitMode === 'per_kg' ? trFactor * weight : trFactor
          const totalCost = cTmsTwd + ep + et + handlingRate
          const transitStatus = String(row['中转status'] ?? row['中转状态'] ?? '')

          return {
            transitStatus,
            customerCode: String(row['客户代码'] ?? ''),
            trackingNo: String(row['业务单号'] ?? ''),
            destination: countryClean,
            chargeWeight: weight,
            upsCubic: Math.round(weight * getUpsFactor(countryClean) / 5000 * 10000) / 10000,
            arrivalTime: String(row['到货时间'] ?? ''),
            aFreight: Math.round(af * 100) / 100,
            aRegFee: Math.round(ar * 100) / 100,
            aSurcharge: Math.round(sHkdA * 4 * 100) / 100,
            aTotal: Math.round(aTotal * 100) / 100,
            cTmsCost: Math.round(cTmsTwd * 100) / 100,
            cCalcCost: Math.round(cCalcTwd * 100) / 100,
            cDiff: Math.round((cCalcTwd - cTmsTwd) * 100) / 100,
            pickupAlloc: Math.round(ep * 100) / 100,
            transitAlloc: Math.round(et * 100) / 100,
            handlingFee: Math.round(handlingRate * 100) / 100,
            totalCost: Math.round(totalCost * 100) / 100,
            profit: Math.round((aTotal - totalCost) * 100) / 100,
          }
        })

        setResults(resultRows)
        setTmsLoaded(file.name)

        // 客戶加總（僅正常走貨）
        const normalRows = resultRows.filter(
          (r) => r.transitStatus === '正常走貨' || r.transitStatus === '正常走货',
        )
        const grouped: Record<string, SummaryRow> = {}
        for (const r of normalRows) {
          if (!grouped[r.customerCode]) {
            grouped[r.customerCode] = { customerCode: r.customerCode, normalCount: 0, totalWeight: 0, aTotal: 0, profit: 0 }
          }
          grouped[r.customerCode].normalCount += 1
          grouped[r.customerCode].totalWeight += r.chargeWeight
          grouped[r.customerCode].aTotal += r.aTotal
          grouped[r.customerCode].profit += r.profit
        }
        setSummary(Object.values(grouped))
      } finally {
        setProcessing(false)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [pcsA, pcsC, pickupTotal, pickupMode, transitTotal, transitMode, handlingRate])

  // 下載報告
  const handleDownload = () => {
    const summaryData = summary.map((s) => ({
      '客戶代碼': s.customerCode,
      '正常走貨票數': s.normalCount,
      '計費總重量': Math.round(s.totalWeight * 100) / 100,
      'A價總額(TWD)': Math.round(s.aTotal * 100) / 100,
      '利潤(TWD)': Math.round(s.profit * 100) / 100,
    }))
    const detailData = results.map((r) => ({
      '中轉狀態': r.transitStatus,
      '客戶代碼': r.customerCode,
      '業務單號': r.trackingNo,
      '目的地': r.destination,
      '計費重': r.chargeWeight,
      'UPS 用材積': r.upsCubic,
      '到貨時間': r.arrivalTime,
      'A價_運費': r.aFreight,
      'A價_掛號': r.aRegFee,
      'A價_附加費(TWD)': r.aSurcharge,
      'A價總額(TWD)': r.aTotal,
      'C價_雲途成本(TWD)': r.cTmsCost,
      '系統驗算C價(TWD)': r.cCalcCost,
      'C價驗算差異': r.cDiff,
      '分攤_攬收(TWD)': r.pickupAlloc,
      '分攤_中轉(TWD)': r.transitAlloc,
      '處理費(TWD)': r.handlingFee,
      '總成本(TWD)': r.totalCost,
      '利潤(TWD)': r.profit,
    }))
    const buf = generateReport(summaryData, detailData)
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const now = new Date()
    a.href = url
    a.download = `Billing_Audit_${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const normalCount = results.filter((r) => r.transitStatus === '正常走貨' || r.transitStatus === '正常走货').length
  const abnormalCount = results.length - normalCount
  const diffCount = results.filter((r) => Math.abs(r.cDiff) > 0.1).length
  const canUploadTms = !!(pcsA && pcsC)

  return (
    <div className="flex h-full">
      {/* ── Left sidebar ── */}
      <aside className="w-64 flex-shrink-0 border-r bg-gray-50 flex flex-col">
        <div className="px-5 py-4 border-b">
          <h2 className="text-sm font-semibold text-gray-700">成本分攤設定</h2>
          <p className="text-xs text-gray-400 mt-0.5">影響利潤計算，填 0 代表不分攤</p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">本期攬收總額 (TWD)</label>
            <input type="number" value={pickupTotal} onChange={(e) => setPickupTotal(parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">攬收分攤方式</label>
            <select value={pickupMode} onChange={(e) => setPickupMode(e.target.value as AllocMode)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="per_kg">依重量（per kg）</option>
              <option value="per_shipment">依票數（per shipment）</option>
            </select>
          </div>
          <div className="border-t pt-4 space-y-1">
            <label className="block text-xs font-medium text-gray-600">本期中轉總額 (TWD)</label>
            <input type="number" value={transitTotal} onChange={(e) => setTransitTotal(parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">中轉分攤方式</label>
            <select value={transitMode} onChange={(e) => setTransitMode(e.target.value as AllocMode)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="per_kg">依重量（per kg）</option>
              <option value="per_shipment">依票數（per shipment）</option>
            </select>
          </div>
          <div className="border-t pt-4 space-y-1">
            <label className="block text-xs font-medium text-gray-600">每票處理費 (TWD)</label>
            <input type="number" value={handlingRate} onChange={(e) => setHandlingRate(parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <h1 className="text-lg font-bold text-gray-900">費用稽核 — C 價驗算看板</h1>
          <p className="text-sm text-gray-500 mt-0.5">上傳 A / C 價卡及 TMS 數據，即時計算每票利潤及驗算誤差</p>
        </div>

        {/* 價卡 + TMS 上傳 */}
        <div className="grid grid-cols-3 gap-4">
          <FileDropZone
            label="A 價卡（對客戶報價）"
            sublabel=".xlsx 雲途格式"
            accept=".xlsx"
            loaded={aLoaded}
            color="blue"
            onFile={(f) => handlePriceCard(f, 'A')}
          />
          <FileDropZone
            label="C 價卡（底價驗算用）"
            sublabel=".xlsx 雲途格式"
            accept=".xlsx"
            loaded={cLoaded}
            color="green"
            onFile={(f) => handlePriceCard(f, 'C')}
          />
          <div className={`relative ${!canUploadTms ? 'opacity-50 pointer-events-none' : ''}`}>
            <FileDropZone
              label="TMS 數據"
              sublabel=".csv 或 .xlsx"
              accept=".csv,.xlsx"
              loaded={tmsLoaded}
              color="purple"
              onFile={handleTms}
            />
            {!canUploadTms && (
              <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-red-500">
                請先上傳 A 價卡和 C 價卡
              </p>
            )}
          </div>
        </div>

        {/* 處理中 */}
        {processing && (
          <div className="flex items-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-blue-600 font-medium">計算中，請稍候…</span>
          </div>
        )}

        {/* 稽核結果 */}
        {results.length > 0 && !processing && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-4">
              <MetricCard label="總匯入筆數" value={`${results.length} 票`} />
              <MetricCard label="正常走貨" value={`${normalCount} 票`} />
              <MetricCard
                label="不正常走貨"
                value={`${abnormalCount} 票`}
                sub={abnormalCount > 0 ? `${abnormalCount} 票需排查` : '全部正常'}
                alert={abnormalCount > 0}
              />
              <MetricCard
                label="C 價驗算不符"
                value={`${diffCount} 票`}
                sub={diffCount > 0 ? '有誤差' : '完美吻合'}
                alert={diffCount > 0}
              />
            </div>

            {/* 客戶帳款摘要 */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">客戶帳款摘要</h2>
                  <p className="text-xs text-gray-400 mt-0.5">僅計算正常走貨票數</p>
                </div>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  下載完整對帳報告
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">客戶代碼</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">正常走貨票數</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">計費總重量 (kg)</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">A 價總額 (TWD)</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">利潤 (TWD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {summary.map((s) => (
                      <tr key={s.customerCode} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-gray-700">{s.customerCode}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{s.normalCount}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-600">{s.totalWeight.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-800 font-medium">
                          {s.aTotal.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono font-semibold ${s.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {s.profit >= 0 ? '+' : ''}{s.profit.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                      <td className="px-4 py-2.5 text-gray-700">合計</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{summary.reduce((s, r) => s + r.normalCount, 0)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-700">{summary.reduce((s, r) => s + r.totalWeight, 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-800">
                        {summary.reduce((s, r) => s + r.aTotal, 0).toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono ${summary.reduce((s, r) => s + r.profit, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(() => {
                          const total = summary.reduce((s, r) => s + r.profit, 0)
                          return `${total >= 0 ? '+' : ''}${total.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        })()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Empty state */}
        {results.length === 0 && !processing && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-4">📊</span>
            <p className="text-gray-500 text-sm">上傳三個檔案後自動計算，結果顯示在這裡</p>
          </div>
        )}
      </main>
    </div>
  )
}
