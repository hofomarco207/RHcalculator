'use client'

import { useCountry } from '@/lib/context/country-context'
import { useTab, type TabId } from '@/lib/context/tab-context'
import { useLanguage } from '@/lib/i18n'
import type { Translations } from '@/lib/i18n'
import { getCountryFlag } from '@/lib/data/country-seed'
import { ExchangeRateWidget } from './ExchangeRateWidget'

function getNavGroups(t: Translations) {
  return [
    {
      label: t.sidebar.coreProcess,
      items: [
        { emoji: '🔬', label: t.sidebar.scenarioAnalysis, tabId: 'scenarios' as TabId },
        { emoji: '💰', label: (t.sidebar as Record<string, string>).pricingFlow ?? '定價流程', tabId: 'pricing-flow' as TabId },
        { emoji: '📚', label: (t.sidebar as Record<string, string>).library ?? '資料總覽', tabId: 'library' as TabId },
      ],
    },
    {
      label: t.sidebar.settings,
      items: [
        { emoji: '🏢', label: t.sidebar.vendorManagement, tabId: 'vendors' as TabId },
        { emoji: '⚙️', label: t.sidebar.settings, tabId: 'settings' as TabId },
        { emoji: '🗂️', label: t.sidebar.shipmentHistory, tabId: 'data-shipments' as TabId },
        { emoji: '📋', label: `${t.sidebar.rateCard}（舊）`, tabId: 'rate-card' as TabId },
      ],
    },
    {
      label: (t.sidebar as Record<string, string>).advancedPricingAnalysis ?? '進階',
      items: [
        { emoji: '📊', label: `${t.sidebar.pricingAnalysis}（舊）`, tabId: 'advanced-analysis' as TabId },
      ],
    },
  ]
}

export function Sidebar() {
  const { country, setCountry, countries, loading } = useCountry()
  const { activeTabId, openTab } = useTab()
  const { language, setLanguage, t } = useLanguage()
  const navGroups = getNavGroups(t)

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col h-full" style={{ backgroundColor: 'var(--sidebar)', color: 'var(--sidebar-foreground)' }}>
      {/* Header — brand mark */}
      <div className="flex items-center gap-3 px-4 py-5" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div className="w-9 h-9 rounded-lg bg-[#FF6B00] flex items-center justify-center flex-shrink-0 shadow-[0_0_12px_rgba(255,107,0,0.3)]">
          <span className="text-white text-sm font-bold tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>iM</span>
        </div>
        <div className="flex flex-col">
          <span className="text-white font-semibold text-sm leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>
            {t.sidebar.appName}
          </span>
          <span className="text-[10px] text-[#6B7280] tracking-wider uppercase mt-0.5">Pricing Engine</span>
        </div>
      </div>

      {/* Country Selector */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <label className="block text-[10px] font-medium uppercase tracking-widest text-[#6B7280] mb-1.5">
          {t.sidebar.country}
        </label>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          disabled={loading}
          className="w-full rounded-md px-2.5 py-1.5 text-sm text-white focus:ring-1 focus:ring-[#FF6B00] focus:outline-none disabled:opacity-50"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          {countries.length > 0 ? (
            countries.map((c) => (
              <option key={c.code} value={c.code} className="bg-[#1C1E26] text-white">
                {getCountryFlag(c.code)} {c.name_zh} ({c.code})
              </option>
            ))
          ) : (
            <option value={country} className="bg-[#1C1E26] text-white">{country}</option>
          )}
        </select>
      </div>

      {/* Language Toggle */}
      <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <button
            onClick={() => setLanguage('zh')}
            className={`flex-1 py-1 text-xs font-medium transition-all ${
              language === 'zh'
                ? 'bg-[#FF6B00] text-white'
                : 'text-[#9CA3AF] hover:text-white'
            }`}
            style={language !== 'zh' ? { backgroundColor: 'rgba(255, 255, 255, 0.04)' } : {}}
          >
            中文
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`flex-1 py-1 text-xs font-medium transition-all ${
              language === 'en'
                ? 'bg-[#FF6B00] text-white'
                : 'text-[#9CA3AF] hover:text-white'
            }`}
            style={{
              ...language !== 'en' ? { backgroundColor: 'rgba(255, 255, 255, 0.04)' } : {},
              borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            EN
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto styled-scroll">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-[#4B5563]">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = activeTabId === item.tabId
                return (
                  <button
                    key={item.tabId}
                    onClick={() => openTab(item.tabId)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left ${
                      isActive
                        ? 'text-[#FF6B00]'
                        : 'text-[#9CA3AF] hover:text-white'
                    }`}
                    style={
                      isActive
                        ? { backgroundColor: 'rgba(255, 107, 0, 0.12)' }
                        : undefined
                    }
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255, 255, 255, 0.06)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = ''
                      }
                    }}
                  >
                    <span className="text-base w-5 text-center flex-shrink-0">{item.emoji}</span>
                    <span>{item.label}</span>
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FF6B00]" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Exchange Rates */}
      <ExchangeRateWidget />

      {/* Footer */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <p className="text-[10px] text-[#4B5563] font-mono tracking-wider">v3.1.0</p>
      </div>
    </aside>
  )
}
