'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { VendorList } from '@/components/vendors/VendorList'
import { VendorForm } from '@/components/vendors/VendorForm'
import { ARatePanel } from '@/components/vendors/ARatePanel'
import { DRatePanel } from '@/components/vendors/DRatePanel'
import { DTieredRatePanel } from '@/components/vendors/DTieredRatePanel'
import { DLookupRatePanel } from '@/components/vendors/DLookupRatePanel'
import { BCRatePanel } from '@/components/vendors/BCRatePanel'
import { QuoteImportDialog } from '@/components/vendors/QuoteImportDialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Vendor } from '@/types'
import { useT } from '@/lib/i18n'

type SegmentTab = 'A' | 'BC' | 'D'

export default function VendorsPage() {
  const t = useT()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showQuoteImport, setShowQuoteImport] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
  const [activeSegment, setActiveSegment] = useState<SegmentTab>('A')

  const loadVendors = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vendors?include_inactive=true')
      const data = await res.json()
      if (Array.isArray(data)) setVendors(data)
    } catch (err) {
      console.error('Failed to load vendors:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadVendors() }, [loadVendors])

  const handleVendorCreated = () => { setShowForm(false); loadVendors() }
  const handleSelectVendor = (vendor: Vendor) => {
    setSelectedVendor(vendor)
    setActiveSegment(vendor.segment as SegmentTab)
  }
  const vendorsBySegment = (seg: SegmentTab) => vendors.filter((v) => v.segment === seg)

  const segments: SegmentTab[] = ['A', 'BC', 'D']
  const segmentLabels: Record<SegmentTab, string> = {
    A: t.segments.aFull,
    BC: t.segments.bcFull,
    D: t.segments.dFull,
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader title={t.pages.vendors.title} description={t.pages.vendors.description} />

      <Tabs value={activeSegment} onValueChange={(v) => setActiveSegment(v as SegmentTab)}>
        <div className="flex items-center justify-between">
          <TabsList>
            {segments.map((seg) => (
              <TabsTrigger key={seg} value={seg}>{segmentLabels[seg]}</TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowQuoteImport(true)}>
              {t.pages.vendors.importQuoteJson}
            </Button>
            <Button onClick={() => setShowForm(true)} size="sm">
              {t.pages.vendors.addVendor}
            </Button>
          </div>
        </div>

        {segments.map((seg) => (
          <TabsContent key={seg} value={seg} className="space-y-4">
            <VendorList
              vendors={vendorsBySegment(seg)}
              loading={loading}
              selectedId={selectedVendor?.segment === seg ? selectedVendor.id : undefined}
              onSelect={handleSelectVendor}
              onRefresh={loadVendors}
            />
            {selectedVendor?.segment === seg && seg === 'A' && <ARatePanel vendor={selectedVendor} />}
            {selectedVendor?.segment === seg && seg === 'BC' && <BCRatePanel vendor={selectedVendor} />}
            {selectedVendor?.segment === seg && seg === 'D' && (
              <>
                <DRatePanel vendor={selectedVendor} />
                <DTieredRatePanel vendor={selectedVendor} />
                <DLookupRatePanel vendor={selectedVendor} />
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {showForm && (
        <VendorForm
          defaultSegment={activeSegment}
          onClose={() => setShowForm(false)}
          onCreated={handleVendorCreated}
        />
      )}

      <QuoteImportDialog
        open={showQuoteImport}
        onOpenChange={setShowQuoteImport}
        onImportSuccess={() => { loadVendors(); setSelectedVendor(null) }}
        country="GLB"
      />
    </div>
  )
}
