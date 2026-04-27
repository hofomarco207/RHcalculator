'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useT } from '@/lib/i18n'
import type { Vendor } from '@/types'
import type { VendorCRate } from '@/types/vendor'
import { VendorVersionInline } from './VendorVersionInline'

interface SegmentCConfigProps {
  vendors: Vendor[]
  selectedVendorId?: string
  onVendorChange: (id: string) => void
  refreshKey?: number
}

export function SegmentCConfig({ vendors, selectedVendorId, onVendorChange, refreshKey }: SegmentCConfigProps) {
  const t = useT()
  const [rates, setRates] = useState<VendorCRate[]>([])

  const FEE_TYPE_LABELS: Record<string, string> = {
    per_mawb: t.scenarioConfig.perMawbLabel,
    per_kg: t.scenarioConfig.perKgFeeLabel,
    per_hawb: t.scenarioConfig.perHawbLabel,
  }

  useEffect(() => {
    if (!selectedVendorId) { setRates([]); return }
    fetch(`/api/vendors/${selectedVendorId}/c-rates`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setRates(d) })
      .catch(() => setRates([]))
  }, [selectedVendorId, refreshKey])

  const handleRefresh = () => {
    if (!selectedVendorId) return
    fetch(`/api/vendors/${selectedVendorId}/c-rates`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setRates(d) })
      .catch(() => {})
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t.scenarioConfig.segmentC}
        </Label>
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

      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <Label className="text-xs">{t.scenarioConfig.vendor}</Label>
          <VendorVersionInline vendorId={selectedVendorId} table="vendor_c_rates" refreshKey={refreshKey} />
        </div>
        <Select value={selectedVendorId ?? ''} onValueChange={onVendorChange}>
          <SelectTrigger><SelectValue placeholder={t.scenarioConfig.selectVendor} /></SelectTrigger>
          <SelectContent>
            {vendors.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rates.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs py-1">{t.scenarioConfig.feeType}</TableHead>
                <TableHead className="text-xs py-1">{t.scenarioConfig.feeName}</TableHead>
                <TableHead className="text-xs py-1">{t.scenarioConfig.gateway}</TableHead>
                <TableHead className="text-xs py-1">{t.common.amount}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs py-1">{FEE_TYPE_LABELS[r.fee_type] ?? r.fee_type}</TableCell>
                  <TableCell className="text-xs py-1">{r.fee_name}</TableCell>
                  <TableCell className="text-xs py-1 font-mono">{r.gateway_code || t.scenarioConfig.allGateways}</TableCell>
                  <TableCell className="text-xs py-1 font-mono">{r.amount} {r.currency}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
