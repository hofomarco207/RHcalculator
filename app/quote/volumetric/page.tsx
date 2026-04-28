'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface PriceResult {
  volWeight: number
  billWeight: number
  pricePerTicket: number | null
  isApproximate: boolean
}

function VolumetricForm() {
  const router = useRouter()
  const params = useSearchParams()
  const productCode = params.get('pn') ?? ''
  const countryCode = params.get('cc') ?? ''
  const isApproximate = params.get('approx') === '1'
  const productName = params.get('product') ?? productCode

  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [monthly, setMonthly] = useState('')
  const [result, setResult] = useState<PriceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const allFilled = length && width && height && weight && monthly

  useEffect(() => {
    if (!productCode || !countryCode) return
    const l = parseFloat(length), w = parseFloat(width), h = parseFloat(height)
    const kg = parseFloat(weight)
    if (!length || !width || !height || !weight || [l, w, h, kg].some(isNaN)) return

    const volKg = Math.round((l * w * h / 5000) * 100) / 100
    const billKg = Math.max(kg, volKg)
    const billKgRounded = Math.ceil(billKg * 10) / 10

    setLoading(true)
    setError('')
    fetch('/api/public/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_code: productCode, country_code: countryCode, weights: [billKgRounded] }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); setResult(null); return }
        const price = data.prices?.[0]?.price ?? null
        setResult({
          volWeight: volKg,
          billWeight: billKgRounded,
          pricePerTicket: price,
          isApproximate,
        })
      })
      .catch(() => setError('查詢失敗，請稍後再試'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length, width, height, weight])

  const prefix = isApproximate ? '約 ' : ''

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-base font-bold text-gray-900">材積查價</h1>
          <p className="text-xs text-gray-500 truncate max-w-[240px]">{productName}</p>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-5">
        {/* Dimensions */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">包裝尺寸（公分）</p>
          <div className="grid grid-cols-3 gap-2">
            {[['長', length, setLength], ['寬', width, setWidth], ['高', height, setHeight]].map(([label, val, setter]) => (
              <div key={label as string} className="space-y-1">
                <label className="text-xs text-gray-500">{label as string}</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={val as string}
                  onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Weight */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">實際重量（kg）</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Monthly volume */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">每月預計貨量（票）</label>
          <input
            type="number"
            min="1"
            step="1"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Result */}
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        {result && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Weight breakdown */}
            <div className="px-4 py-3 border-b bg-gray-50 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">材積重量</span>
                <span className="font-mono text-gray-700">{result.volWeight} kg</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">計費重量</span>
                <span className="font-mono font-medium text-gray-900">{result.billWeight} kg</span>
              </div>
            </div>

            {/* Price result */}
            <div className="px-4 py-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">預估每票運費</span>
                <span className="text-lg font-bold text-gray-900 font-mono">
                  {result.pricePerTicket == null ? '—' : `${prefix}TWD ${result.pricePerTicket.toLocaleString()}`}
                </span>
              </div>
              <div className="flex justify-between items-center border-t pt-3">
                <span className="text-sm text-gray-600">預估每月運費</span>
                <span className="text-xl font-bold text-blue-600 font-mono">
                  {(() => {
                    const mo = parseFloat(monthly)
                    if (result.pricePerTicket == null || isNaN(mo) || mo <= 0) return '—'
                    return `${prefix}TWD ${Math.round(result.pricePerTicket * mo).toLocaleString()}`
                  })()}
                </span>
              </div>
            </div>

            {isApproximate && (
              <p className="px-4 py-3 text-xs text-gray-400 border-t bg-gray-50">
                注：每個國家運費有異，請參閱產品實際報價
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default function VolumetricPage() {
  return (
    <Suspense>
      <VolumetricForm />
    </Suspense>
  )
}
