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
import { useCountry } from '@/lib/context/country-context'
import { useT } from '@/lib/i18n'
import type { Vendor } from '@/types'
import type { VendorDConfig } from '@/types/vendor'
import { VendorVersionInline } from './VendorVersionInline'

interface SegmentDConfigProps {
  vendors: Vendor[]
  selectedVendorId?: string
  onVendorChange: (id: string) => void
  carrierProportions: Array<{ carrier: string; pct: number }>
  onCarrierProportionsChange: (p: Array<{ carrier: string; pct: number }>) => void
  refreshKey?: number
}

type DModelInfo = 'zone_based' | 'first_additional' | 'weight_bracket' | 'simple' | 'per_piece' | 'tiered_per_kg' | 'lookup_table' | null

export function SegmentDConfig({
  vendors,
  selectedVendorId,
  onVendorChange,
  carrierProportions,
  onCarrierProportionsChange,
  refreshKey,
}: SegmentDConfigProps) {
  const t = useT()
  const [config, setConfig] = useState<VendorDConfig[]>([])
  const [dModel, setDModel] = useState<DModelInfo>(null)
  const [tierDist, setTierDist] = useState<Record<string, number> | null>(null)
  const { country } = useCountry()

  const D_MODEL_LABELS: Record<string, string> = {
    zone_based: t.scenarioConfig.dModelZoneBased,
    first_additional: t.scenarioConfig.dModelFirstAdditional,
    weight_bracket: t.scenarioConfig.dModelWeightBracket,
    simple: t.scenarioConfig.dModelSimple,
    per_piece: t.scenarioConfig.dModelPerPiece ?? '按件計費',
    tiered_per_kg: t.scenarioConfig.dModelTieredPerKg,
    lookup_table: t.scenarioConfig.dModelLookupTable,
  }

  useEffect(() => {
    if (!selectedVendorId) { setConfig([]); setDModel(null); return }

    // Load carrier config
    fetch(`/api/vendors/${selectedVendorId}/d-config`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          setConfig(d)
          // Initialize proportions if empty
          if (carrierProportions.length === 0 && d.length > 0) {
            const evenPct = 1.0 / d.length
            onCarrierProportionsChange(
              d.map((c: VendorDConfig) => ({ carrier: c.carrier_code, pct: Math.round(evenPct * 1000) / 1000 }))
            )
          }
        }
      })
      .catch(() => setConfig([]))

    // Detect D pricing model
    const vendor = vendors.find((v) => v.id === selectedVendorId)
    if (vendor?.config?.per_piece) {
      setDModel('per_piece')
    } else if (vendor?.config?.simple_rate) {
      setDModel('simple')
    } else {
      // Check D rates first, then tiered, then lookup
      Promise.all([
        fetch(`/api/vendors/${selectedVendorId}/d-rates`).then((r) => r.json()),
        fetch(`/api/vendors/${selectedVendorId}/d-tiered-rates`).then((r) => r.json()),
        fetch(`/api/vendors/${selectedVendorId}/d-lookup-rates`).then((r) => r.json()),
      ]).then(([dRates, tieredRates, lookupData]) => {
        if (Array.isArray(dRates) && dRates.length > 0) {
          // Check if weight_bracket or first_additional
          const zrc = new Map<string, number>()
          for (const r of dRates) { const z = r.zone ?? 'default'; zrc.set(z, (zrc.get(z) ?? 0) + 1) }
          setDModel([...zrc.values()].some((c) => c > 1) ? 'weight_bracket' : 'first_additional')
        } else if (Array.isArray(tieredRates) && tieredRates.length > 0) {
          setDModel('tiered_per_kg')
        } else if (lookupData?.rates && lookupData.rates.length > 0) {
          setDModel('lookup_table')
        } else {
          setDModel('zone_based')
        }
      }).catch(() => setDModel(null))
    }
  }, [selectedVendorId, refreshKey])

  // Load tier distribution for first_additional / weight_bracket
  useEffect(() => {
    if ((dModel === 'first_additional' || dModel === 'weight_bracket') && country) {
      fetch(`/api/zone-mappings/${country}/distribution`)
        .then((r) => r.json())
        .then((d) => setTierDist(d.distribution ?? null))
        .catch(() => setTierDist(null))
    } else {
      setTierDist(null)
    }
  }, [dModel, country])

  function updatePct(carrier: string, pct: number) {
    const updated = carrierProportions.map((c) =>
      c.carrier === carrier ? { ...c, pct } : c
    )
    // If carrier not yet in list, add it
    if (!updated.find((c) => c.carrier === carrier)) {
      updated.push({ carrier, pct })
    }
    onCarrierProportionsChange(updated)
  }

  const totalPct = carrierProportions.reduce((s, c) => s + c.pct, 0)
  const showCarrierProportions = dModel === 'zone_based' && config.length > 0

  const handleRefresh = () => {
    if (!selectedVendorId) return
    // Re-fetch carrier config
    fetch(`/api/vendors/${selectedVendorId}/d-config`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setConfig(d)
      })
      .catch(() => {})

    // Re-detect D pricing model
    const vendor = vendors.find((v) => v.id === selectedVendorId)
    if (vendor?.config?.per_piece) {
      setDModel('per_piece')
    } else if (vendor?.config?.simple_rate) {
      setDModel('simple')
    } else {
      Promise.all([
        fetch(`/api/vendors/${selectedVendorId}/d-rates`).then((r) => r.json()),
        fetch(`/api/vendors/${selectedVendorId}/d-tiered-rates`).then((r) => r.json()),
        fetch(`/api/vendors/${selectedVendorId}/d-lookup-rates`).then((r) => r.json()),
      ]).then(([dRates, tieredRates, lookupData]) => {
        if (Array.isArray(dRates) && dRates.length > 0) {
          const zrc = new Map<string, number>()
          for (const r of dRates) { const z = r.zone ?? 'default'; zrc.set(z, (zrc.get(z) ?? 0) + 1) }
          setDModel([...zrc.values()].some((c) => c > 1) ? 'weight_bracket' : 'first_additional')
        } else if (Array.isArray(tieredRates) && tieredRates.length > 0) {
          setDModel('tiered_per_kg')
        } else if (lookupData?.rates && lookupData.rates.length > 0) {
          setDModel('lookup_table')
        } else {
          setDModel('zone_based')
        }
      }).catch(() => setDModel(null))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t.scenarioConfig.segmentD}
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
          <VendorVersionInline
            vendorId={selectedVendorId}
            table={
              dModel === 'first_additional' || dModel === 'weight_bracket'
                ? 'vendor_d_rates'
                : dModel === 'tiered_per_kg'
                ? 'vendor_d_tiered_rates'
                : dModel === 'lookup_table'
                ? 'vendor_d_lookup_rates'
                : null
            }
            refreshKey={refreshKey}
          />
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

      {/* D model info badge */}
      {selectedVendorId && dModel && (
        <p className="text-xs text-muted-foreground">
          {t.scenarioConfig.pricingModel}{'\uFF1A'}<span className="font-medium">{D_MODEL_LABELS[dModel] ?? dModel}</span>
        </p>
      )}

      {/* Tier distribution info */}
      {(dModel === 'first_additional' || dModel === 'weight_bracket') && (
        <p className="text-xs text-muted-foreground">
          {t.scenarioConfig.tierWeighting}{'\uFF1A'}{tierDist ? (
            <span className="font-medium">
              {Object.entries(tierDist)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([zone, pct]) => `${zone} ${(pct * 100).toFixed(1)}%`)
                .join(' / ')}
              <span className="text-gray-400 ml-1">{t.scenarioConfig.cityListStats}</span>
            </span>
          ) : (
            <span className="text-gray-400">{t.scenarioConfig.equalWeightNoData}</span>
          )}
        </p>
      )}

      {/* Carrier proportions — only for zone_based */}
      {showCarrierProportions && (
        <div className="space-y-2">
          <Label className="text-xs">
            {t.scenarioConfig.carrierProportions}
            <span className={`ml-2 font-mono ${Math.abs(totalPct - 1) > 0.01 ? 'text-red-500' : 'text-green-600'}`}>
              ({(totalPct * 100).toFixed(1)}%)
            </span>
          </Label>
          <div className="space-y-1.5">
            {config.map((c) => {
              const cp = carrierProportions.find((p) => p.carrier === c.carrier_code)
              return (
                <div key={c.carrier_code} className="flex items-center gap-2">
                  <span className="text-xs font-mono w-12">{c.carrier_code}</span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    className="h-8 text-xs w-20"
                    value={cp ? Math.round(cp.pct * 100) : ''}
                    onChange={(e) => updatePct(c.carrier_code, (parseInt(e.target.value) || 0) / 100)}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
