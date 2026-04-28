'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useT } from '@/lib/i18n'
import type { Vendor } from '@/types'
import type { VendorARate } from '@/types/vendor'

interface SegmentAConfigProps {
  vendors: Vendor[]
  selectedVendorId?: string
  onVendorChange: (id: string) => void
  pickup: number
  sorting: number
  includeSorting: boolean
  bubbleRatio?: number
  perKgCurrency?: string
  perPieceFee?: number
  perPieceCurrency?: string
  onChange: (v: {
    pickup: number
    sorting: number
    includeSorting: boolean
    bubbleRatio?: number
    perKgCurrency?: string
    perPieceFee?: number
    perPieceCurrency?: string
  }) => void
  refreshKey?: number
}

export function SegmentAConfig({
  vendors,
  selectedVendorId,
  onVendorChange,
  pickup,
  sorting,
  includeSorting,
  bubbleRatio,
  perKgCurrency,
  perPieceFee,
  perPieceCurrency,
  onChange,
  refreshKey,
}: SegmentAConfigProps) {
  const t = useT()
  const [rates, setRates] = useState<VendorARate[]>([])

  const syncFromVendor = async (vendorId: string) => {
    try {
      const vendorData = await fetch(`/api/vendors/${vendorId}`).then((r) => r.json())
      const ratesData = await fetch(`/api/vendors/${vendorId}/a-rates`).then((r) => r.json())

      const currentRate: VendorARate | undefined = Array.isArray(ratesData) ? ratesData[0] : undefined
      if (Array.isArray(ratesData)) setRates(ratesData)

      onChange({
        pickup: currentRate?.pickup_hkd_per_kg ?? 0,
        sorting: currentRate?.sorting_hkd_per_kg ?? 0,
        includeSorting: currentRate?.include_sorting ?? false,
        bubbleRatio: currentRate?.bubble_ratio ?? 1.0,
        perKgCurrency: currentRate?.per_kg_currency ?? 'TWD',
        perPieceFee: vendorData.per_piece_fee ?? 0,
        perPieceCurrency: vendorData.per_piece_currency ?? 'TWD',
      })
    } catch {
      setRates([])
    }
  }

  useEffect(() => {
    if (!selectedVendorId) { setRates([]); return }
    syncFromVendor(selectedVendorId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendorId, refreshKey])

  const selectedVendor = vendors.find((v) => v.id === selectedVendorId)
  const bubble = bubbleRatio ?? 1.0
  const perPiece = perPieceFee ?? 0

  const update = (patch: Partial<Parameters<typeof onChange>[0]>) => {
    onChange({
      pickup,
      sorting,
      includeSorting,
      bubbleRatio,
      perKgCurrency,
      perPieceFee,
      perPieceCurrency,
      ...patch,
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t.scenarioConfig.segmentA}
        </Label>
        {selectedVendorId && (
          <button
            onClick={() => syncFromVendor(selectedVendorId)}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title={t.common.refresh}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs">{t.scenarioConfig.vendor}</Label>
        <Select value={selectedVendorId ?? ''} onValueChange={onVendorChange}>
          <SelectTrigger><SelectValue placeholder={t.scenarioConfig.selectVendor} /></SelectTrigger>
          <SelectContent>
            {vendors.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedVendor && rates.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t.scenarioConfig.ratesLoaded.replace('{name}', selectedVendor.name)}
        </p>
      )}

      {/* 按公斤 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t.scenarioConfig.pickupFeeLabel}</Label>
          <Input
            type="number" step="0.1"
            value={pickup || ''}
            onChange={(e) => update({ pickup: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t.scenarioConfig.sortingFeeLabel}</Label>
          <Input
            type="number" step="0.1"
            value={sorting || ''}
            onChange={(e) => update({ sorting: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">拋率</Label>
          <Input
            type="number" step="0.01" min="1"
            value={bubble || ''}
            onChange={(e) => update({ bubbleRatio: parseFloat(e.target.value) || 1.0 })}
          />
        </div>
      </div>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={includeSorting}
          onCheckedChange={(v) => update({ includeSorting: !!v })}
        />
        <span className="text-xs">{t.scenarioConfig.includeSorting}</span>
      </label>

      {/* 按件（附加） */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t">
        <div className="space-y-1">
          <Label className="text-xs">{t.scenarioConfig.perPieceFee}（附加）</Label>
          <Input
            type="number" step="0.1" min="0"
            value={perPiece || ''}
            onChange={(e) => update({ perPieceFee: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t.common.currency}</Label>
          <Select
            value={perPieceCurrency ?? 'HKD'}
            onValueChange={(v) => update({ perPieceCurrency: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TWD">TWD</SelectItem>
              <SelectItem value="HKD">HKD</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="RMB">RMB</SelectItem>
              <SelectItem value="JPY">JPY</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
