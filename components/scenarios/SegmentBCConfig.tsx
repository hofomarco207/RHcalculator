'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useT } from '@/lib/i18n'
import type { Vendor } from '@/types'
import type { VendorBCRate } from '@/types/vendor'
import { VendorVersionInline } from './VendorVersionInline'

interface SegmentBCConfigProps {
  vendors: Vendor[]
  selectedVendorId?: string
  onVendorChange: (id: string) => void
  bubbleRate?: number
  onBubbleRateChange?: (r: number) => void
  label?: string
  refreshKey?: number
}

export function SegmentBCConfig({
  vendors,
  selectedVendorId,
  onVendorChange,
  bubbleRate = 1.0,
  onBubbleRateChange,
  label,
  refreshKey,
}: SegmentBCConfigProps) {
  const t = useT()
  const [rate, setRate] = useState<VendorBCRate | null>(null)

  useEffect(() => {
    if (!selectedVendorId) { setRate(null); return }
    fetch(`/api/vendors/${selectedVendorId}/bc-rates`)
      .then((r) => r.json())
      .then((d) => {
        if (d && d.rate_per_kg != null) setRate(d)
        else setRate(null)
      })
      .catch(() => setRate(null))
  }, [selectedVendorId, refreshKey])

  const handleRefresh = () => {
    if (!selectedVendorId) return
    fetch(`/api/vendors/${selectedVendorId}/bc-rates`)
      .then((r) => r.json())
      .then((d) => {
        if (d && d.rate_per_kg != null) setRate(d)
        else setRate(null)
      })
      .catch(() => {})
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{label ?? t.scenarioConfig.bcVendorLabel}</Label>
        {selectedVendorId && (
          <button
            onClick={handleRefresh}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title={t.common.refresh}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        <VendorVersionInline vendorId={selectedVendorId} table="vendor_bc_rates" refreshKey={refreshKey} />
        <Select value={selectedVendorId || ''} onValueChange={onVendorChange}>
          <SelectTrigger>
            <SelectValue placeholder={t.scenarioConfig.selectVendor} />
          </SelectTrigger>
          <SelectContent>
            {vendors.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {onBubbleRateChange && (
        <div className="space-y-1">
          <Label className="text-xs">{t.scenarioConfig.bubbleRatio}</Label>
          <Input
            type="number"
            step="0.01"
            value={bubbleRate}
            onChange={(e) => onBubbleRateChange(parseFloat(e.target.value) || 1.0)}
          />
        </div>
      )}

      {rate && (
        <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.scenarioConfig.ratePerKgLabel}</span>
            <span className="font-mono">{rate.rate_per_kg} {rate.currency}</span>
          </div>
          {rate.handling_fee_per_unit > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.scenarioConfig.handlingFeeLabel}</span>
              <span className="font-mono">{rate.handling_fee_per_unit} {rate.currency}</span>
            </div>
          )}
          {rate.notes && (
            <p className="text-xs text-muted-foreground pt-1">{rate.notes}</p>
          )}
        </div>
      )}

      {selectedVendorId && !rate && (
        <p className="text-xs text-amber-600">{t.scenarioConfig.noRateSet}</p>
      )}
    </div>
  )
}
