'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  COUNTRY_OPTIONS, CARGO_LABELS, WEIGHT_BRACKET_OPTIONS,
  BRACKET_WEIGHTS, lookupEntry, hasSensitivityChoice,
  type WeightBracket, type Sensitivity,
} from '@/lib/quote-config'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceRow { weight: number; price: number | null }
interface QuoteResult {
  productName: string
  validFrom: string
  isApproximate: boolean
  prices: PriceRow[]
}
interface RateCardOption {
  id: string
  productName: string
  productCode: string
  validFrom: string
  countries: { code: string; label: string }[]
}

// ─── Shared price fetch ───────────────────────────────────────────────────────

async function fetchPrices(
  productCode: string,
  countryCode: string,
  weights: number[],
): Promise<{ prices: PriceRow[]; productName?: string; validFrom?: string; error?: string }> {
  const res = await fetch('/api/public/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_code: productCode, country_code: countryCode, weights }),
  })
  return res.json()
}

// ─── Guided tab ───────────────────────────────────────────────────────────────

function GuidedTab({ onVolumetric }: {
  onVolumetric: (pn: string, cc: string, approx: boolean, product: string) => void
}) {
  const [country, setCountry] = useState('')
  const [cargoType, setCargoType] = useState('')
  const [sensitivity, setSensitivity] = useState<Sensitivity | ''>('')
  const [bracket, setBracket] = useState<WeightBracket | ''>('')
  const [result, setResult] = useState<QuoteResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const showSensitivity = country && cargoType && hasSensitivityChoice(country, cargoType)
  const needsSensitivity = showSensitivity
  const selectionComplete = country && cargoType && (!needsSensitivity || sensitivity) && bracket

  useEffect(() => {
    if (!selectionComplete) { setResult(null); return }
    const effectiveSensitivity = needsSensitivity ? (sensitivity || null) : null
    const entry = lookupEntry(country, cargoType, effectiveSensitivity)
    if (!entry) { setError('找不到對應服務'); return }
    setError('')
    setLoading(true)
    fetchPrices(entry.productCode, entry.countryCode, BRACKET_WEIGHTS[bracket as WeightBracket])
      .then((data) => {
        if (data.error) { setError(data.error); setResult(null) }
        else setResult({ productName: data.productName!, validFrom: data.validFrom!, isApproximate: entry.isApproximate, prices: data.prices })
      })
      .catch(() => setError('查詢失敗，請稍後再試'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, cargoType, sensitivity, bracket])

  function handleClear() {
    setCountry(''); setCargoType(''); setSensitivity(''); setBracket('')
    setResult(null); setError('')
  }

  function handleVolumetric() {
    const effectiveSensitivity = needsSensitivity ? (sensitivity || null) : null
    const entry = lookupEntry(country, cargoType, effectiveSensitivity)
    if (!entry || !result) return
    onVolumetric(entry.productCode, entry.countryCode, entry.isApproximate, result.productName)
  }

  return (
    <div className="space-y-4">
      {/* Country */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">目的地</label>
        <select
          value={country}
          onChange={(e) => { setCountry(e.target.value); setCargoType(''); setSensitivity(''); setBracket('') }}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">請選擇目的地</option>
          {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Cargo type */}
      {country && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">貨物種類</label>
          <select
            value={cargoType}
            onChange={(e) => { setCargoType(e.target.value); setSensitivity(''); setBracket('') }}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">請選擇貨物種類</option>
            {Object.entries(CARGO_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Sensitivity */}
      {showSensitivity && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">優先考慮</label>
          <div className="grid grid-cols-2 gap-2">
            {(['時效', '價格'] as Sensitivity[]).map((s) => (
              <button key={s} onClick={() => { setSensitivity(s); setBracket('') }}
                className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${sensitivity === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                {s === '時效' ? '⚡ 時效優先' : '💰 價格優先'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Weight bracket */}
      {country && cargoType && (!needsSensitivity || sensitivity) && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">大概重量</label>
          <div className="grid grid-cols-2 gap-2">
            {WEIGHT_BRACKET_OPTIONS.map((b) => (
              <button key={b} onClick={() => setBracket(b)}
                className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${bracket === b ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                {b}
              </button>
            ))}
          </div>
        </div>
      )}

      <PriceOutput loading={loading} error={error} result={result} onClear={handleClear} onVolumetric={result ? handleVolumetric : undefined} />
    </div>
  )
}

// ─── Direct tab ───────────────────────────────────────────────────────────────

function DirectTab({ onVolumetric }: {
  onVolumetric: (pn: string, cc: string, approx: boolean, product: string) => void
}) {
  const [cards, setCards] = useState<RateCardOption[]>([])
  const [cardId, setCardId] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [bracket, setBracket] = useState<WeightBracket | ''>('')
  const [result, setResult] = useState<QuoteResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingCards, setLoadingCards] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/public/rate-cards')
      .then((r) => r.json())
      .then((data) => setCards(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingCards(false))
  }, [])

  const selectedCard = cards.find((c) => c.id === cardId) ?? null

  useEffect(() => {
    if (!cardId || !countryCode || !bracket) { setResult(null); return }
    setLoading(true)
    setError('')
    fetchPrices(selectedCard!.productCode, countryCode, BRACKET_WEIGHTS[bracket as WeightBracket])
      .then((data) => {
        if (data.error) { setError(data.error); setResult(null) }
        else setResult({ productName: data.productName!, validFrom: data.validFrom!, isApproximate: false, prices: data.prices })
      })
      .catch(() => setError('查詢失敗，請稍後再試'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, countryCode, bracket])

  function handleClear() {
    setCardId(''); setCountryCode(''); setBracket(''); setResult(null); setError('')
  }

  return (
    <div className="space-y-4">
      {/* Rate card selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">選擇服務</label>
        {loadingCards ? (
          <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
        ) : (
          <select value={cardId} onChange={(e) => { setCardId(e.target.value); setCountryCode(''); setBracket('') }}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">請選擇服務</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>{c.productName}</option>
            ))}
          </select>
        )}
      </div>

      {/* Country */}
      {selectedCard && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">目的地</label>
          <select value={countryCode} onChange={(e) => { setCountryCode(e.target.value); setBracket('') }}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">請選擇目的地</option>
            {selectedCard.countries.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Weight bracket */}
      {countryCode && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">大概重量</label>
          <div className="grid grid-cols-2 gap-2">
            {WEIGHT_BRACKET_OPTIONS.map((b) => (
              <button key={b} onClick={() => setBracket(b)}
                className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${bracket === b ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                {b}
              </button>
            ))}
          </div>
        </div>
      )}

      <PriceOutput loading={loading} error={error} result={result} onClear={handleClear}
        onVolumetric={result && selectedCard ? () => onVolumetric(selectedCard.productCode, countryCode, false, result.productName) : undefined} />
    </div>
  )
}

// ─── Shared price output ──────────────────────────────────────────────────────

function PriceOutput({ loading, error, result, onClear, onVolumetric }: {
  loading: boolean
  error: string
  result: QuoteResult | null
  onClear: () => void
  onVolumetric?: () => void
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (error) return <p className="text-sm text-red-500 text-center">{error}</p>
  if (!result) return null

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <p className="text-xs text-gray-500">適用服務</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{result.productName}</p>
          <p className="text-xs text-gray-400 mt-0.5">價卡日期：{result.validFrom}</p>
        </div>
        <div className="divide-y divide-gray-100">
          <div className="grid grid-cols-2 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
            <span>重量</span><span className="text-right">運費（TWD）</span>
          </div>
          {result.prices.map(({ weight, price }) => (
            <div key={weight} className="grid grid-cols-2 px-4 py-2.5 text-sm">
              <span className="text-gray-700 font-mono">{weight} kg</span>
              <span className="text-right font-mono font-medium text-gray-900">
                {price == null ? '—' : `${result.isApproximate ? '約 ' : ''}TWD ${price.toLocaleString()}`}
              </span>
            </div>
          ))}
        </div>
        {result.isApproximate && (
          <p className="px-4 py-3 text-xs text-gray-400 border-t bg-gray-50">
            注：每個國家運費有異，請參閱產品實際報價
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button onClick={onClear}
          className="py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          清除重測
        </button>
        <button onClick={onVolumetric} disabled={!onVolumetric}
          className="py-3 rounded-xl bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
          材積查價
        </button>
      </div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QuotePage() {
  const router = useRouter()
  const [tab, setTab] = useState<'guided' | 'direct'>('guided')

  function handleVolumetric(pn: string, cc: string, approx: boolean, product: string) {
    const params = new URLSearchParams({ pn, cc, approx: approx ? '1' : '0', product })
    router.push(`/quote/volumetric?${params}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900">RH 運費查詢</h1>
        <p className="text-xs text-gray-500 mt-0.5">選擇目的地及貨物資料，即時取得運費參考</p>
      </header>

      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        {/* Tab switcher */}
        <div className="flex rounded-lg bg-gray-100 p-1 mb-5">
          {([['guided', '快速查詢'], ['direct', '指定服務']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'guided'
          ? <GuidedTab onVolumetric={handleVolumetric} />
          : <DirectTab onVolumetric={handleVolumetric} />
        }
      </main>

      {/* Footer */}
      <footer className="text-center py-6 border-t bg-white mt-4">
        <a href="/admin-login" className="text-xs text-gray-300 hover:text-gray-400 transition-colors">
          管理員入口
        </a>
      </footer>
    </div>
  )
}
