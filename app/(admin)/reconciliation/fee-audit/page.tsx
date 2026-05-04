'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { ResultRow, SummaryRow, cleanCountry, lookupPrice, PriceCardRow } from '@/lib/reconciliation/fee-audit/calculations'
import { getUpsFactor, C_SURCHARGE_COLS, A_SURCHARGE_COLS } from '@/lib/reconciliation/fee-audit/constants'
import { parseTmsFile, generateReport, TmsRow } from '@/lib/reconciliation/fee-audit/excel-parser'
import {
  aCardToPriceRows, cCardToPriceRows, groupCompetitorCards,
  loadMappings, saveMappings,
  DbRateCard, DbCompetitorRow, DbCountryBracket, CCardKey, ProductMapping, CCardGroup,
} from '@/lib/reconciliation/fee-audit/db-adapters'

type AllocMode = 'per_kg' | 'per_shipment'

// ─── File drop zone ────────────────────────────────────────────────────────

function FileDropZone({ label, sublabel, accept, loaded, onFile, disabled }: {
  label: string; sublabel: string; accept: string
  loaded: string; onFile: (f: File) => void; disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      onClick={() => !disabled && ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragging(false)
        if (!disabled) { const f = e.dataTransfer.files[0]; if (f) onFile(f) }
      }}
      className={`relative rounded-xl border-2 ${dragging ? 'border-purple-400 border-solid' : 'border-dashed border-purple-300'} bg-purple-50 p-5 transition-all ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
    >
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <p className="font-semibold text-sm text-purple-700">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
      {loaded
        ? <span className="mt-2 inline-block text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">✓ {loaded}</span>
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

// ─── Product mapping dialog ────────────────────────────────────────────────

function MappingDialog({
  products, aCards, cGroups, initial, onConfirm, onClose,
}: {
  products: string[]
  aCards: DbRateCard[]
  cGroups: CCardGroup[]
  initial: Record<string, ProductMapping>
  onConfirm: (m: Record<string, ProductMapping>) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Record<string, ProductMapping>>(() => {
    const d: Record<string, ProductMapping> = {}
    for (const p of products) {
      d[p] = initial[p] ?? { aCardId: '', cCardKey: '' }
    }
    return d
  })

  const allMapped = products.every((p) => draft[p]?.aCardId && draft[p]?.cCardKey)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b">
          <h2 className="text-base font-bold text-gray-900">設定價卡對應</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            TMS 中發現 {products.length} 個產品，請為每個產品指定 A 價卡及 C 價卡。完成後系統會自動記憶。
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {products.map((product) => (
            <div key={product} className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-800">{product}</p>
              <div className="grid grid-cols-2 gap-3">
                {/* A card */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-blue-700">A 價卡（我的報價）</label>
                  <select
                    value={draft[product]?.aCardId ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [product]: { ...d[product], aCardId: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— 選擇 A 價卡 —</option>
                    {aCards.map((c) => (
                      <option key={c.id} value={c.id}>{c.product_name}</option>
                    ))}
                  </select>
                </div>
                {/* C card */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-green-700">C 價卡（雲途底價）</label>
                  <select
                    value={draft[product]?.cCardKey ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [product]: { ...d[product], cCardKey: e.target.value as CCardKey } }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">— 選擇 C 價卡 —</option>
                    {cGroups.map((g) => (
                      <option key={g.key} value={g.key}>{g.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            取消
          </button>
          <button
            onClick={() => { if (allMapped) onConfirm(draft) }}
            disabled={!allMapped}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            確認並開始計算
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function FeeAuditPage() {
  // Cost allocation inputs
  const [pickupTotal, setPickupTotal] = useState(0)
  const [pickupMode, setPickupMode] = useState<AllocMode>('per_kg')
  const [transitTotal, setTransitTotal] = useState(0)
  const [transitMode, setTransitMode] = useState<AllocMode>('per_kg')
  const [handlingRate, setHandlingRate] = useState(0)

  // DB card lists
  const [aCards, setACards] = useState<DbRateCard[]>([])
  const [cGroups, setCGroups] = useState<CCardGroup[]>([])
  const [loadingCards, setLoadingCards] = useState(true)

  // TMS state
  const [tmsRows, setTmsRows] = useState<TmsRow[]>([])
  const [tmsName, setTmsName] = useState('')

  // Mapping
  const [mappings, setMappings] = useState<Record<string, ProductMapping>>({})
  const [showDialog, setShowDialog] = useState(false)
  const [pendingProducts, setPendingProducts] = useState<string[]>([])

  // Results
  const [results, setResults] = useState<ResultRow[]>([])
  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  // Load DB cards and persisted mappings on mount
  useEffect(() => {
    setMappings(loadMappings())

    Promise.all([
      fetch('/api/rate-cards').then((r) => r.json()),
      fetch('/api/competitor-rate-cards').then((r) => r.json()),
    ]).then(([rateCards, competitorRows]) => {
      setACards(Array.isArray(rateCards) ? rateCards : [])
      const cRows: DbCompetitorRow[] = Array.isArray(competitorRows) ? competitorRows : []
      setCGroups(groupCompetitorCards(cRows))
    }).catch(() => {
      setError('無法載入價卡資料，請確認網路連線')
    }).finally(() => setLoadingCards(false))
  }, [])

  // Run calculations after mappings are confirmed
  const runCalculations = useCallback(async (
    rows: TmsRow[],
    confirmedMappings: Record<string, ProductMapping>,
  ) => {
    setProcessing(true)
    setError('')
    try {
      // Get unique product → aCardId/cCardKey
      const products = [...new Set(rows.map((r) => String(r['产品名称'] ?? '')))]

      // Fetch A card brackets for each unique aCardId
      const aCardIds = [...new Set(products.map((p) => confirmedMappings[p]?.aCardId).filter(Boolean))]
      const cCardKeys = [...new Set(products.map((p) => confirmedMappings[p]?.cCardKey).filter(Boolean))]

      // Fetch all A card brackets in parallel
      const aCardData = await Promise.all(
        aCardIds.map((id) =>
          fetch(`/api/rate-cards/${id}?with_brackets=1`)
            .then((r) => r.json())
            .then((card) => ({ id, brackets: (card.country_brackets ?? []) as DbCountryBracket[] })),
        ),
      )
      const aCardBracketsById = new Map(aCardData.map((d) => [d.id, d.brackets]))

      // Fetch all C card rows (we already have all from initial load, but fetch fresh grouped by service_code)
      const cCardData = await Promise.all(
        cCardKeys.map((key) => {
          const [competitorName, serviceCode] = key.split('||')
          return fetch(`/api/competitor-rate-cards?competitor_name=${encodeURIComponent(competitorName)}&service_code=${encodeURIComponent(serviceCode)}`)
            .then((r) => r.json())
            .then((rows: DbCompetitorRow[]) => ({ key, rows }))
        }),
      )
      const cCardRowsByKey = new Map(cCardData.map((d) => [d.key, d.rows]))

      // Build lookup tables per product
      const pcsA: Record<string, PriceCardRow[]> = {}
      const pcsC: Record<string, PriceCardRow[]> = {}

      for (const product of products) {
        const m = confirmedMappings[product]
        if (!m) continue
        const aBrackets = aCardBracketsById.get(m.aCardId) ?? []
        const cRows = cCardRowsByKey.get(m.cCardKey) ?? []
        pcsA[product] = aCardToPriceRows(aBrackets)
        pcsC[product] = cCardToPriceRows(cRows)
      }

      // Run audit calculations
      const totalWeight = rows.reduce((s, r) => s + (parseFloat(String(r['计费重量'] ?? '0').replace(/KG/gi, '').trim()) || 0), 0)
      const totalShipments = rows.length
      const pkFactor = pickupMode === 'per_kg' && totalWeight > 0
        ? pickupTotal / totalWeight : pickupTotal / (totalShipments || 1)
      const trFactor = transitMode === 'per_kg' && totalWeight > 0
        ? transitTotal / totalWeight : transitTotal / (totalShipments || 1)

      const resultRows: ResultRow[] = rows.map((row) => {
        const prod = String(row['产品名称'] ?? '')
        const countryClean = cleanCountry(String(row['目的国家名称'] ?? ''))
        const weight = parseFloat(String(row['计费重量'] ?? '0').replace(/KG/gi, '').trim()) || 0
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

      // Customer summary (normal shipments only)
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
    } catch (e) {
      setError(e instanceof Error ? e.message : '計算失敗，請稍後再試')
    } finally {
      setProcessing(false)
    }
  }, [pickupTotal, pickupMode, transitTotal, transitMode, handlingRate])

  // Handle TMS upload
  const handleTms = useCallback((file: File) => {
    setResults([]); setSummary([]); setError('')
    const reader = new FileReader()
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer
      const rows = parseTmsFile(buffer)
      setTmsRows(rows)
      setTmsName(file.name)

      const products = [...new Set(rows.map((r) => String(r['产品名称'] ?? '')))]
      const saved = loadMappings()
      const unmapped = products.filter((p) => !saved[p]?.aCardId || !saved[p]?.cCardKey)

      if (unmapped.length > 0) {
        setPendingProducts(products)
        setShowDialog(true)
      } else {
        setMappings(saved)
        runCalculations(rows, saved)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [runCalculations])

  // Confirm mapping from dialog
  const handleMappingConfirm = useCallback((confirmed: Record<string, ProductMapping>) => {
    saveMappings(confirmed)
    setMappings(confirmed)
    setShowDialog(false)
    runCalculations(tmsRows, confirmed)
  }, [tmsRows, runCalculations])

  // Download report
  const handleDownload = () => {
    const summaryData = summary.map((s) => ({
      '客戶代碼': s.customerCode, '正常走貨票數': s.normalCount,
      '計費總重量': Math.round(s.totalWeight * 100) / 100,
      'A價總額(TWD)': Math.round(s.aTotal * 100) / 100,
      '利潤(TWD)': Math.round(s.profit * 100) / 100,
    }))
    const detailData = results.map((r) => ({
      '中轉狀態': r.transitStatus, '客戶代碼': r.customerCode, '業務單號': r.trackingNo,
      '目的地': r.destination, '計費重': r.chargeWeight, 'UPS 用材積': r.upsCubic,
      '到貨時間': r.arrivalTime, 'A價_運費': r.aFreight, 'A價_掛號': r.aRegFee,
      'A價_附加費(TWD)': r.aSurcharge, 'A價總額(TWD)': r.aTotal,
      'C價_雲途成本(TWD)': r.cTmsCost, '系統驗算C價(TWD)': r.cCalcCost, 'C價驗算差異': r.cDiff,
      '分攤_攬收(TWD)': r.pickupAlloc, '分攤_中轉(TWD)': r.transitAlloc,
      '處理費(TWD)': r.handlingFee, '總成本(TWD)': r.totalCost, '利潤(TWD)': r.profit,
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

  // Current mapping summary for display
  const mappedProducts = Object.entries(mappings)
    .filter(([, m]) => m.aCardId && m.cCardKey)
    .map(([product]) => product)

  return (
    <>
      {/* Mapping dialog */}
      {showDialog && (
        <MappingDialog
          products={pendingProducts}
          aCards={aCards}
          cGroups={cGroups}
          initial={mappings}
          onConfirm={handleMappingConfirm}
          onClose={() => setShowDialog(false)}
        />
      )}

      <div className="flex h-full">
        {/* ── Left sidebar ── */}
        <aside className="w-64 flex-shrink-0 border-r bg-gray-50 flex flex-col">
          <div className="px-5 py-4 border-b">
            <h2 className="text-sm font-semibold text-gray-700">成本分攤設定</h2>
            <p className="text-xs text-gray-400 mt-0.5">填 0 代表不分攤</p>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">本期攬收總額 (TWD)</label>
              <input type="number" value={pickupTotal}
                onChange={(e) => setPickupTotal(parseFloat(e.target.value) || 0)}
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
              <input type="number" value={transitTotal}
                onChange={(e) => setTransitTotal(parseFloat(e.target.value) || 0)}
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
              <input type="number" value={handlingRate}
                onChange={(e) => setHandlingRate(parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Mapping status */}
            {mappedProducts.length > 0 && (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-600">已記憶對應</p>
                  <button
                    onClick={() => { setPendingProducts(mappedProducts); setShowDialog(true) }}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    修改
                  </button>
                </div>
                <div className="space-y-1">
                  {mappedProducts.map((p) => (
                    <p key={p} className="text-xs text-gray-400 truncate" title={p}>✓ {p}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h1 className="text-lg font-bold text-gray-900">費用稽核 — C 價驗算看板</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              上傳 TMS 數據，A / C 價卡自動從資料庫讀取，即時計算每票利潤及驗算誤差
            </p>
          </div>

          {/* DB card status */}
          <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 text-sm">
            {loadingCards
              ? <span className="text-gray-400">正在載入價卡清單…</span>
              : (
                <>
                  <span className="text-gray-600">
                    <span className="font-medium text-blue-700">{aCards.length}</span> 張 A 價卡
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-600">
                    <span className="font-medium text-green-700">{cGroups.length}</span> 組 C 價卡
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-400">已從資料庫載入</span>
                </>
              )
            }
          </div>

          {/* TMS upload */}
          <FileDropZone
            label="匯入 TMS 數據"
            sublabel=".csv 或 .xlsx — 上傳後自動與資料庫價卡對應並計算"
            accept=".csv,.xlsx"
            loaded={tmsName}
            disabled={loadingCards}
            onFile={handleTms}
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          {processing && (
            <div className="flex items-center gap-3 py-4">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-blue-600 font-medium">計算中，請稍候…</span>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && !processing && (
            <>
              <div className="grid grid-cols-4 gap-4">
                <MetricCard label="總匯入筆數" value={`${results.length} 票`} />
                <MetricCard label="正常走貨" value={`${normalCount} 票`} />
                <MetricCard label="不正常走貨" value={`${abnormalCount} 票`}
                  sub={abnormalCount > 0 ? `${abnormalCount} 票需排查` : '全部正常'} alert={abnormalCount > 0} />
                <MetricCard label="C 價驗算不符" value={`${diffCount} 票`}
                  sub={diffCount > 0 ? '有誤差' : '完美吻合'} alert={diffCount > 0} />
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800">客戶帳款摘要</h2>
                    <p className="text-xs text-gray-400 mt-0.5">僅計算正常走貨票數</p>
                  </div>
                  <button onClick={handleDownload}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
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

          {results.length === 0 && !processing && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <span className="text-5xl mb-4">📊</span>
              <p className="text-gray-500 text-sm">上傳 TMS 檔案後自動計算，結果顯示在這裡</p>
              {mappedProducts.length > 0 && (
                <p className="text-gray-400 text-xs mt-2">已記憶 {mappedProducts.length} 個產品的價卡對應</p>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  )
}
