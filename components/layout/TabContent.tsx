'use client'

import { Suspense, lazy } from 'react'
import { useTab, type TabId } from '@/lib/context/tab-context'

// Lazy-load each panel so we only download code when the tab is first opened
const ScenariosPanel = lazy(() => import('@/app/(admin)/scenarios/page'))
const VendorsPanel = lazy(() => import('@/app/(admin)/vendors/page'))
const CompetitorPanel = lazy(() => import('@/app/(admin)/competitor/page'))
const RateCardPanel = lazy(() => import('@/app/(admin)/rate-card/page'))
const SettingsPanel = lazy(() => import('@/app/(admin)/settings/page'))
const ShipmentsPanel = lazy(() => import('@/app/(admin)/data/shipments/page'))
const PricingFlowPanel = lazy(() => import('@/components/tabs/PricingFlowPanel'))
const AdvancedAnalysisPanel = lazy(() => import('@/components/tabs/AdvancedAnalysisPanel'))
const LibraryPanel = lazy(() => import('@/components/tabs/LibraryPanel'))

function getTabComponent(tabId: TabId) {
  switch (tabId) {
    case 'scenarios': return <ScenariosPanel />
    case 'vendors': return <VendorsPanel />
    case 'competitor': return <CompetitorPanel />
    case 'rate-card': return <RateCardPanel />
    case 'settings': return <SettingsPanel />
    case 'data-shipments': return <ShipmentsPanel />
    case 'pricing-flow': return <PricingFlowPanel />
    case 'advanced-analysis': return <AdvancedAnalysisPanel />
    case 'library': return <LibraryPanel />
    default: return null
  }
}

function TabLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 animate-fade">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-[#E5E2DB]" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#FF6B00] animate-spin" />
      </div>
      <span className="text-xs text-[#9CA3AF] font-medium tracking-wide uppercase">Loading</span>
    </div>
  )
}

export function TabContent() {
  const { openTabs, activeTabId, mountedTabs } = useTab()

  return (
    <div className="flex-1 overflow-hidden relative content-surface">
      {openTabs.map((tabId) => {
        // Only render if mounted at least once (lazy mount)
        if (!mountedTabs.has(tabId)) return null

        return (
          <div
            key={tabId}
            className="absolute inset-0 overflow-y-auto styled-scroll"
            style={{ display: tabId === activeTabId ? 'block' : 'none' }}
          >
            <Suspense fallback={<TabLoading />}>
              {getTabComponent(tabId)}
            </Suspense>
          </div>
        )
      })}
    </div>
  )
}
