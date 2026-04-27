'use client'

import { CountryProvider } from '@/lib/context/country-context'
import { ExchangeRateProvider } from '@/lib/context/exchange-rate-context'
import { TabProvider } from '@/lib/context/tab-context'
import { LanguageProvider } from '@/lib/i18n'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <CountryProvider>
        <ExchangeRateProvider>
          <TabProvider>{children}</TabProvider>
        </ExchangeRateProvider>
      </CountryProvider>
    </LanguageProvider>
  )
}
