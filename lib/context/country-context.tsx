'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import type { Country, Gateway, Carrier } from '@/types'

const STORAGE_KEY = 'imile-country'
const DEFAULT_COUNTRY = 'US'

interface CountryContextValue {
  country: string
  setCountry: (code: string) => void
  countries: Country[]
  gateways: Gateway[]
  carriers: Carrier[]
  loading: boolean
  pricingMode: 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c'
}

const CountryContext = createContext<CountryContextValue | null>(null)

export function CountryProvider({ children }: { children: ReactNode }) {
  const [country, setCountryState] = useState<string>(DEFAULT_COUNTRY)
  const [countries, setCountries] = useState<Country[]>([])
  const [gateways, setGateways] = useState<Gateway[]>([])
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLookups = useCallback(async (countryCode: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/lookups?country=${countryCode}`)
      if (!res.ok) throw new Error('Failed to fetch lookups')
      const data = await res.json()
      setCountries(data.countries ?? [])
      setGateways(data.gateways ?? [])
      setCarriers(data.carriers ?? [])
    } catch (err) {
      console.error('CountryContext fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const initial = stored || DEFAULT_COUNTRY
    setCountryState(initial)
    fetchLookups(initial)
  }, [fetchLookups])

  const setCountry = useCallback(
    (code: string) => {
      setCountryState(code)
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, code)
      }
      fetchLookups(code)
    },
    [fetchLookups],
  )

  return (
    <CountryContext.Provider
      value={{
        country, setCountry, countries, gateways, carriers, loading,
        pricingMode: countries.find((c) => c.code === country)?.pricing_mode ?? 'segmented',
      }}
    >
      {children}
    </CountryContext.Provider>
  )
}

export function useCountry(): CountryContextValue {
  const ctx = useContext(CountryContext)
  if (!ctx) {
    throw new Error('useCountry must be used within a CountryProvider')
  }
  return ctx
}
