'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import type { ExchangeRates } from '@/types'
import { DEFAULT_EXCHANGE_RATES } from '@/types'

interface ExchangeRateContextValue {
  rates: ExchangeRates
  loading: boolean
  /** Update a single rate pair and persist to DB */
  updateRate: (field: keyof ExchangeRates, value: number) => Promise<void>
  /** Re-fetch rates from DB */
  refreshRates: () => Promise<void>
}

const ExchangeRateContext = createContext<ExchangeRateContextValue | null>(null)

export function ExchangeRateProvider({ children }: { children: ReactNode }) {
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_EXCHANGE_RATES)
  const [loading, setLoading] = useState(true)

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch('/api/exchange-rates')
      if (res.ok) {
        const data = await res.json()
        if (data && typeof data.usd_hkd === 'number') {
          setRates(data)
        }
      }
    } catch {
      // non-fatal, keep defaults
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRates()
  }, [fetchRates])

  const updateRate = useCallback(async (field: keyof ExchangeRates, value: number) => {
    // Optimistic update
    setRates((prev) => ({ ...prev, [field]: value }))
    try {
      const res = await fetch('/api/exchange-rates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Revert on failure
      await fetchRates()
    }
  }, [fetchRates])

  return (
    <ExchangeRateContext.Provider value={{ rates, loading, updateRate, refreshRates: fetchRates }}>
      {children}
    </ExchangeRateContext.Provider>
  )
}

export function useExchangeRates(): ExchangeRateContextValue {
  const ctx = useContext(ExchangeRateContext)
  if (!ctx) {
    throw new Error('useExchangeRates must be used within an ExchangeRateProvider')
  }
  return ctx
}
