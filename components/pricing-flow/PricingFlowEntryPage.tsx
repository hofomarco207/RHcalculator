'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useT } from '@/lib/i18n'
import { useCountry } from '@/lib/context/country-context'
import { CostPricingFlow } from './CostPricingFlow'
import { CompetitivePricingFlow } from './CompetitivePricingFlow'

type FlowType = 'cost' | 'competitive'

export function PricingFlowEntryPage() {
  const t = useT()
  const { country } = useCountry()
  const [activeFlow, setActiveFlow] = useState<FlowType | null>(null)

  if (activeFlow === 'cost') {
    return <CostPricingFlow onBack={() => setActiveFlow(null)} />
  }

  if (activeFlow === 'competitive') {
    return <CompetitivePricingFlow onBack={() => setActiveFlow(null)} />
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="animate-in">
        <h1
          className="text-2xl font-bold tracking-tight text-[#1C1E26] mb-1"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {(t.sidebar as Record<string, string>).pricingFlow ?? '定價流程'}
        </h1>
        <p className="text-sm text-[#6B7280] mb-8">
          {country} — 選擇定價方式開始生成價卡
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 stagger">
        {/* A: Cost-based Pricing */}
        <Card
          className="cursor-pointer card-hover animate-in border-[#E5E2DB]"
          onClick={() => setActiveFlow('cost')}
        >
          <CardHeader className="pb-3">
            <div className="w-10 h-10 rounded-lg bg-[#FFF7ED] flex items-center justify-center mb-3">
              <span className="text-xl">📊</span>
            </div>
            <CardTitle
              className="text-lg text-[#1C1E26]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              A. 成本定價
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[#6B7280] leading-relaxed">
              如果沒有競對價卡 / 還沒生成該國價卡，可以使用。適合新國家、新客戶，完全從成本出發。
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-[#F0EDE8] px-2.5 py-0.5 text-[11px] font-medium text-[#6B7280]">
                6 步
              </span>
              <span className="text-[11px] text-[#9CA3AF]">
                選方案 → 驗算 → Mark up → 微調 → 儲存 → 輸出
              </span>
            </div>
          </CardContent>
        </Card>

        {/* B: Competitive Pricing */}
        <Card
          className="cursor-pointer card-hover animate-in border-[#E5E2DB]"
          onClick={() => setActiveFlow('competitive')}
        >
          <CardHeader className="pb-3">
            <div className="w-10 h-10 rounded-lg bg-[#FFF7ED] flex items-center justify-center mb-3">
              <span className="text-xl">⚔️</span>
            </div>
            <CardTitle
              className="text-lg text-[#1C1E26]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              B. 競價定價
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[#6B7280] leading-relaxed">
              已有任何同國價卡可用於比價。適合市場已有參考價，需要橫向比較。
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-[#F0EDE8] px-2.5 py-0.5 text-[11px] font-medium text-[#6B7280]">
                7 步
              </span>
              <span className="text-[11px] text-[#9CA3AF]">
                選對標 → 比對 → 生成 → 驗算 → 微調 → 再比對 → 輸出
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
