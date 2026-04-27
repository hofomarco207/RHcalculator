'use client'

import { PageHeader } from '@/components/layout/PageHeader'
import { RateCardGenerator } from '@/components/rate-card/RateCardGenerator'
import { useTab } from '@/lib/context/tab-context'
import { useT } from '@/lib/i18n'

export default function RateCardPage() {
  const t = useT()
  const { openTab } = useTab()
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t.pages.rateCard.title}
        description={t.pages.rateCard.description}
      />
      {/* Pipeline redirect notice */}
      <div className="rounded-lg border border-[#FF6B00]/30 bg-[#FF6B00]/5 p-4 flex items-center justify-between">
        <p className="text-sm">
          {t.pricingAnalysis.pipeline.title}已整合到「{t.sidebar.pricingAnalysis}」頁面。
        </p>
        <button
          onClick={() => openTab('competitor')}
          className="text-sm font-medium text-[#FF6B00] hover:underline"
        >
          {t.pricingAnalysis.tabs.pipeline} →
        </button>
      </div>
      <RateCardGenerator />
    </div>
  )
}
