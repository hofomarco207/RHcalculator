'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/layout/PageHeader'
import { CompeteTab } from './CompeteTab'
import { PricingPipeline } from './PricingPipeline'
import { useT } from '@/lib/i18n'

export function PricingAnalysisPage() {
  const t = useT()
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t.pages.competitor.title}
        description={t.pages.competitor.description}
      />
      <Tabs defaultValue="compete">
        <TabsList>
          <TabsTrigger value="pipeline">{t.pricingAnalysis.tabs.pipeline}</TabsTrigger>
          <TabsTrigger value="compete">{t.pricingAnalysis.tabs.compete}</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <PricingPipeline />
        </TabsContent>

        <TabsContent value="compete">
          <CompeteTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
