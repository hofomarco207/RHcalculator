'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/layout/PageHeader'
import { EvaluateTab } from './EvaluateTab'
import { CompeteTab } from './CompeteTab'
import { ScoutTab } from './ScoutTab'
import { PricingPipeline } from './PricingPipeline'
import { useT } from '@/lib/i18n'

interface PricingAnalysisPageProps {
  /** When true, hides the Pipeline tab (used by AdvancedAnalysisPanel since pipeline moved to its own tab) */
  hideFlowTab?: boolean
}

export function PricingAnalysisPage({ hideFlowTab }: PricingAnalysisPageProps = {}) {
  const t = useT()
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t.pages.competitor.title}
        description={t.pages.competitor.description}
      />
      <Tabs defaultValue={hideFlowTab ? 'evaluate' : 'pipeline'}>
        <TabsList>
          {!hideFlowTab && (
            <TabsTrigger value="pipeline">{t.pricingAnalysis.tabs.pipeline}</TabsTrigger>
          )}
          <TabsTrigger value="evaluate">{t.pricingAnalysis.tabs.evaluate}</TabsTrigger>
          <TabsTrigger value="compete">{t.pricingAnalysis.tabs.compete}</TabsTrigger>
          <TabsTrigger value="scout">{t.pricingAnalysis.tabs.scout}</TabsTrigger>
        </TabsList>

        {!hideFlowTab && (
          <TabsContent value="pipeline">
            <PricingPipeline />
          </TabsContent>
        )}

        <TabsContent value="evaluate">
          <EvaluateTab />
        </TabsContent>

        <TabsContent value="compete">
          <CompeteTab />
        </TabsContent>

        <TabsContent value="scout">
          <ScoutTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
