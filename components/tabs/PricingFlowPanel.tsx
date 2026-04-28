'use client'

import { PricingFlowV2 } from '@/components/pricing-flow-v2/PricingFlowV2'

export default function PricingFlowPanel() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">定價流程</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          選對標 → 比對 → 生成 → 微調 → 再比對 → 輸出
        </p>
      </div>
      <PricingFlowV2 />
    </div>
  )
}
