'use client'

import { useTab, type TabId } from '@/lib/context/tab-context'
import { useLanguage } from '@/lib/i18n'
import type { Translations } from '@/lib/i18n'
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
      ],
    },
  ]
}

const ACCENT = '#0284C7'
const ACCENT_BG = 'rgba(2, 132, 199, 0.13)'
const ACCENT_GLOW = '0 0 12px rgba(2, 132, 199, 0.35)'

export function Sidebar() {
  const { activeTabId, openTab } = useTab()
  const { language, setLanguage, t } = useLanguage()
  const navGroups = getNavGroups(t)

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col h-full" style={{ backgroundColor: 'var(--sidebar)', color: 'var(--sidebar-foreground)' }}>
      {/* Header — brand mark */}
      <div className="flex items-center gap-3 px-4 py-5" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: ACCENT, boxShadow: ACCENT_GLOW }}
        >
          <span className="text-white text-sm font-bold tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>FF</span>
        </div>
        <div className="flex flex-col">
          <span className="text-white font-semibold text-sm leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>
            FlexForward
          </span>
          <span className="text-[10px] text-[#6B7280] tracking-wider uppercase mt-0.5">Pricing Engine</span>
        </div>
      </div>

      {/* Language Toggle */}
      <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <button
            onClick={() => setLanguage('zh')}
            className={`flex-1 py-1 text-xs font-medium transition-all ${
              language === 'zh' ? 'text-white' : 'text-[#9CA3AF] hover:text-white'
            }`}
            style={
              language === 'zh'
                ? { backgroundColor: ACCENT }
                : { backgroundColor: 'rgba(255, 255, 255, 0.04)' }
            }
          >
            中文
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`flex-1 py-1 text-xs font-medium transition-all ${
              language === 'en' ? 'text-white' : 'text-[#9CA3AF] hover:text-white'
            }`}
            style={{
              ...(language === 'en'
                ? { backgroundColor: ACCENT }
                : { backgroundColor: 'rgba(255, 255, 255, 0.04)' }),
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
                      isActive ? 'text-white' : 'text-[#9CA3AF] hover:text-white'
                    }`}
                    style={isActive ? { backgroundColor: ACCENT_BG, color: '#38BDF8' } : undefined}
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
                      <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
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
        <p className="text-[10px] text-[#4B5563] font-mono tracking-wider">v0.1.0</p>
      </div>
    </aside>
  )
}
