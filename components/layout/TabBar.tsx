'use client'

import { useTab, TAB_DEFINITIONS } from '@/lib/context/tab-context'
import { useT } from '@/lib/i18n'
import type { Translations } from '@/lib/i18n'

function getTabLabel(tabId: string, t: Translations): string {
  switch (tabId) {
    case 'scenarios': return t.sidebar.scenarioAnalysis
    case 'rate-card': return t.sidebar.rateCard
    case 'vendors': return t.sidebar.vendorManagement
    case 'data-shipments': return t.sidebar.shipmentHistory
    case 'competitor': return t.sidebar.pricingAnalysis
    case 'settings': return t.sidebar.settings
    case 'pricing-flow': return (t.sidebar as Record<string, string>).pricingFlow ?? '定價流程'
    case 'advanced-analysis': return (t.sidebar as Record<string, string>).advancedPricingAnalysis ?? '定價分析'
    case 'library': return (t.sidebar as Record<string, string>).library ?? '資料總覽'
    default: return tabId
  }
}

function getTabEmoji(tabId: string): string {
  return TAB_DEFINITIONS.find((d) => d.id === tabId)?.emoji ?? ''
}

export function TabBar() {
  const { openTabs, activeTabId, setActiveTab, closeTab } = useTab()
  const t = useT()

  if (openTabs.length === 0) return null

  return (
    <div
      className="flex items-end overflow-x-auto flex-shrink-0 styled-scroll"
      style={{
        backgroundColor: '#F0EDE8',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {openTabs.map((tabId) => {
        const isActive = tabId === activeTabId
        const def = TAB_DEFINITIONS.find((d) => d.id === tabId)
        return (
          <div
            key={tabId}
            className={`group relative flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium cursor-pointer select-none transition-all ${
              isActive
                ? 'text-[#1C1E26] rounded-t-lg'
                : 'text-[#6B7280] hover:text-[#1C1E26]'
            }`}
            style={isActive ? {
              backgroundColor: 'var(--background)',
              borderTop: '2px solid #FF6B00',
              marginBottom: '-1px',
              borderBottom: '1px solid var(--background)',
            } : {
              borderTop: '2px solid transparent',
            }}
            onClick={() => setActiveTab(tabId)}
          >
            <span className="text-xs">{getTabEmoji(tabId)}</span>
            <span className="whitespace-nowrap">{getTabLabel(tabId, t)}</span>
            {def?.closable !== false && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tabId)
                }}
                className={`ml-1.5 rounded p-0.5 transition-all ${
                  isActive
                    ? 'text-[#9CA3AF] hover:text-[#1C1E26] hover:bg-[#E5E2DB] opacity-100'
                    : 'text-[#9CA3AF] hover:text-[#1C1E26] hover:bg-[#E5E2DB] opacity-0 group-hover:opacity-100'
                }`}
                aria-label={t.common.close}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
