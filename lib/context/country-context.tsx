'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Country, Gateway, Carrier } from '@/types'

// RH is global — no per-country filtering. This context is a no-op stub kept only
// for backward-compatibility with legacy components that import useCountry().
interface CountryContextValue {
  country: string
  setCountry: (code: string) => void
  countries: Country[]
  gateways: Gateway[]
  carriers: Carrier[]
  loading: boolean
  pricingMode: 'bc_combined'
}

const STUB: CountryContextValue = {
  country: '',
  setCountry: () => undefined,
  countries: [],
  gateways: [],
  carriers: [],
  loading: false,
  pricingMode: 'bc_combined',
}

const CountryContext = createContext<CountryContextValue>(STUB)

export function CountryProvider({ children }: { children: ReactNode }) {
  return <CountryContext.Provider value={STUB}>{children}</CountryContext.Provider>
}

export function useCountry(): CountryContextValue {
  return useContext(CountryContext)
}
