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
import type { VendorBRate } from '@/types/vendor'
import { VendorVersionInline } from './VendorVersionInline'

type GatewayMode = 'optimized' | 'single' | 'manual'

interface SegmentBConfigProps {
  vendors: Vendor[]
  selectedVendorId?: string
  onVendorChange: (id: string) => void
  gatewayMode: GatewayMode
  onGatewayModeChange: (m: GatewayMode) => void
  singleGateway: string
  onSingleGatewayChange: (gw: string) => void
  manualProportions: Record<string, number>
  onManualProportionsChange: (p: Record<string, number>) => void
  bubbleRate: number
  onBubbleRateChange: (r: number) => void
  label?: string
  /** Increment to trigger rate re-fetch */
  refreshKey?: number
  /** Optional: enable 中位數+buffer 定價 toggle. Only rendered when both props are defined. */
  useMedianPricing?: boolean
  onUseMedianPricingChange?: (v: boolean) => void
}

export function SegmentBConfig({
  vendors,
  selectedVendorId,
  onVendorChange,
  gatewayMode,
  onGatewayModeChange,
  singleGateway,
  onSingleGatewayChange,
  manualProportions,
  onManualProportionsChange,
  bubbleRate,
  onBubbleRateChange,
  label,
  refreshKey,
  useMedianPricing,
  onUseMedianPricingChange,
}: SegmentBConfigProps) {
  const t = useT()
  const [rates, setRates] = useState<VendorBRate[]>([])

  useEffect(() => {
    if (!selectedVendorId) { setRates([]); return }
    fetch(`/api/vendors/${selectedVendorId}/b-rates`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setRates(d) })
      .catch(() => setRates([]))
  }, [selectedVendorId, refreshKey])

  // Extract available gateways from rates
  const gateways = [...new Set(rates.map((r) => r.gateway_code))].sort()

  // Group by service for compact display
  const services = [...new Set(rates.map((r) => r.service_name ?? ''))].sort()

  const handleRefresh = () => {
    if (!selectedVendorId) return
    fetch(`/api/vendors/${selectedVendorId}/b-rates`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setRates(d) })
      .catch(() => {})
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label ?? t.scenarioConfig.segmentB}
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

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <Label className="text-xs">{t.scenarioConfig.vendor}</Label>
          <VendorVersionInline vendorId={selectedVendorId} table="vendor_b_rates" refreshKey={refreshKey} />
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
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t.scenarioConfig.gatewayMode}</Label>
              <Select value={gatewayMode} onValueChange={(v) => onGatewayModeChange(v as GatewayMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="optimized">{t.scenarioConfig.optimized}</SelectItem>
                  <SelectItem value="single">{t.scenarioConfig.singleGateway}</SelectItem>
                  <SelectItem value="manual">{t.scenarioConfig.manual}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.scenarioConfig.bubbleRatio}</Label>
              <Input
                type="number"
                step="0.01"
                value={bubbleRate}
                onChange={(e) => onBubbleRateChange(parseFloat(e.target.value) || 1.0)}
              />
            </div>
          </div>

          {useMedianPricing !== undefined && onUseMedianPricingChange && (
            <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={useMedianPricing}
                onChange={(e) => onUseMedianPricingChange(e.target.checked)}
              />
              <div className="flex-1">
                <div className="font-medium text-amber-900">使用中位數+buffer 定價</div>
                <div className="text-amber-700 mt-0.5">
                  同口岸同重量段 ≥2 家服務時，改用 rate_per_kg 與 MAWB 固定費的中位數再套用 vendor buffer（預算用途）。僅 1 家服務時仍取最低報價。
                </div>
              </div>
            </label>
          )}

          {gatewayMode === 'single' && (
            <div className="space-y-1">
              <Label className="text-xs">{t.scenarioConfig.injectionGateway}</Label>
              <Select value={singleGateway} onValueChange={onSingleGatewayChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {gateways.map((gw) => (
                    <SelectItem key={gw} value={gw}>{gw}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {gatewayMode === 'manual' && (
            <div className="space-y-1">
              <Label className="text-xs">{t.scenarioConfig.gatewayProportions}</Label>
              <div className="grid grid-cols-2 gap-2">
                {gateways.map((gw) => (
                  <div key={gw} className="flex items-center gap-2">
                    <span className="text-xs w-10 font-mono">{gw}</span>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      className="h-8 text-xs"
                      value={Math.round((manualProportions[gw] ?? 0) * 100) || ''}
                      onChange={(e) => {
                        const pct = (parseInt(e.target.value) || 0) / 100
                        onManualProportionsChange({ ...manualProportions, [gw]: pct })
                      }}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compact rate summary */}
          <div className="overflow-x-auto rounded-md border max-h-48 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs py-1">{t.scenarioConfig.service}</TableHead>
                  <TableHead className="text-xs py-1">{t.scenarioConfig.gateway}</TableHead>
                  <TableHead className="text-xs py-1">300+</TableHead>
                  <TableHead className="text-xs py-1">500+</TableHead>
                  <TableHead className="text-xs py-1">1000+</TableHead>
                  <TableHead className="text-xs py-1">{t.common.currency}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.flatMap((svc) =>
                  gateways.map((gw) => {
                    const svcGwRates = rates
                      .filter((r) => (r.service_name ?? '') === svc && r.gateway_code === gw)
                      .sort((a, b) => a.weight_tier_min_kg - b.weight_tier_min_kg)
                    if (svcGwRates.length === 0) return null
                    return (
                      <TableRow key={`${svc}-${gw}`}>
                        <TableCell className="text-xs py-1">{svc}</TableCell>
                        <TableCell className="text-xs py-1 font-mono">{gw}</TableCell>
                        {[300, 500, 1000].map((tier) => {
                          const r = svcGwRates.find((r) => r.weight_tier_min_kg === tier)
                          return (
                            <TableCell key={tier} className="text-xs py-1 font-mono">
                              {r ? r.rate_per_kg : '—'}
                            </TableCell>
                          )
                        })}
                        <TableCell className="text-xs py-1">{svcGwRates[0]?.currency}</TableCell>
                      </TableRow>
                    )
                  })
                ).filter(Boolean)}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
