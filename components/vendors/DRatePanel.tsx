'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import type { Vendor } from '@/types'
import type { VendorDRate } from '@/types/vendor'
import { RateVersionBar } from '@/components/vendors/RateVersionBar'

interface DRatePanelProps {
  vendor: Vendor
}

export function DRatePanel({ vendor }: DRatePanelProps) {
  const t = useT()
  const [rates, setRates] = useState<VendorDRate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [versionRefreshKey, setVersionRefreshKey] = useState(0)
  const [surcharge, setSurcharge] = useState('')

  // New rate form
  const [zone, setZone] = useState('')
  const [weightMax, setWeightMax] = useState('')
  const [bracketPrice, setBracketPrice] = useState('')
  const [additionalWeightKg, setAdditionalWeightKg] = useState('')
  const [additionalWeightPrice, setAdditionalWeightPrice] = useState('')
  const [currency, setCurrency] = useState('USD')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/vendors/${vendor.id}/d-rates`)
        const data = await res.json()
        if (Array.isArray(data)) {
          setRates(data)
          if (data.length > 0 && data[0].additional_surcharge) {
            setSurcharge(String(data[0].additional_surcharge))
          }
        }
      } catch (err) {
        console.error('Load D rates error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [vendor.id])

  // Detect if this is weight_bracket mode (any zone has >1 row)
  const zoneRowCounts = new Map<string, number>()
  for (const r of rates) {
    const z = r.zone ?? 'default'
    zoneRowCounts.set(z, (zoneRowCounts.get(z) ?? 0) + 1)
  }
  const isWeightBracket = [...zoneRowCounts.values()].some((c) => c > 1)

  function addRow() {
    if (!bracketPrice) {
      toast.error(t.common.price)
      return
    }
    if (!weightMax) {
      toast.error(t.common.weight)
      return
    }
    setRates((prev) => [
      ...prev,
      {
        vendor_id: vendor.id,
        zone: zone || undefined,
        first_weight_kg: parseFloat(weightMax) || 1,
        first_weight_price: parseFloat(bracketPrice),
        additional_weight_kg: additionalWeightKg ? parseFloat(additionalWeightKg) : 0,
        additional_weight_price: additionalWeightPrice ? parseFloat(additionalWeightPrice) : 0,
        currency: currency as 'USD' | 'RMB' | 'HKD',
      },
    ])
    // Keep zone for quick entry of multiple brackets in same zone
    setBracketPrice('')
    setAdditionalWeightKg('')
    setAdditionalWeightPrice('')
    // Auto-increment weight for next bracket
    const nextMin = parseFloat(weightMax)
    if (!isNaN(nextMin)) setWeightMax('')
  }

  function removeRow(index: number) {
    setRates((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (rates.length === 0) {
      toast.error(t.common.noData)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/d-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rates: rates.map((r) => ({
            zone: r.zone || null,
            first_weight_kg: r.first_weight_kg,
            first_weight_price: r.first_weight_price,
            additional_weight_kg: r.additional_weight_kg || 0,
            additional_weight_price: r.additional_weight_price || 0,
            currency: r.currency,
            additional_surcharge: surcharge ? parseFloat(surcharge) : 0,
          })),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${t.vendorPanels.dRate.title} ${t.common.success}`)
      setVersionRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
  }

  // Group rates by zone for display
  const grouped = new Map<string, VendorDRate[]>()
  const sortedRates = [...rates].sort((a, b) => {
    const za = a.zone ?? ''
    const zb = b.zone ?? ''
    if (za !== zb) return za.localeCompare(zb)
    return a.first_weight_kg - b.first_weight_kg
  })
  for (const r of sortedRates) {
    const z = r.zone ?? '-'
    if (!grouped.has(z)) grouped.set(z, [])
    grouped.get(z)!.push(r)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {vendor.name} — {t.vendorPanels.dRate.title} {isWeightBracket ? t.vendorPanels.dRate.weightBracket : t.vendorPanels.dRate.firstWeight}
        </CardTitle>
        {isWeightBracket && (
          <p className="text-xs text-muted-foreground">
            {t.vendorPanels.dRate.tieredRates}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <RateVersionBar vendorId={vendor.id} table="vendor_d_rates" refreshKey={versionRefreshKey} />
        {/* Current rates table */}
        {rates.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">{t.vendorPanels.dRate.zone}</TableHead>
                <TableHead>{t.common.weight} (kg)</TableHead>
                <TableHead>{t.common.price}</TableHead>
                <TableHead>{t.vendorPanels.dRate.additionalWeight} (kg)</TableHead>
                <TableHead>{t.vendorPanels.dRate.additionalWeightPrice}</TableHead>
                <TableHead>{t.common.currency}</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRates.map((r, i) => {
                const origIdx = rates.indexOf(r)
                const hasAdditional = r.additional_weight_kg > 0 && r.additional_weight_price > 0
                return (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{r.zone || '-'}</TableCell>
                    <TableCell className="font-mono text-xs">≤{r.first_weight_kg}</TableCell>
                    <TableCell className="font-mono text-xs">{r.first_weight_price}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {hasAdditional ? r.additional_weight_kg : '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {hasAdditional ? r.additional_weight_price : '-'}
                    </TableCell>
                    <TableCell className="text-xs">{r.currency}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => removeRow(origIdx)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        {t.common.delete}
                      </button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}

        {/* Add row form */}
        <div className="grid grid-cols-6 gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">{t.vendorPanels.dRate.zone}</Label>
            <Input
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="Zone 1"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.common.weight} kg *</Label>
            <Input
              type="number"
              step="0.1"
              value={weightMax}
              onChange={(e) => setWeightMax(e.target.value)}
              placeholder="0.2"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.common.price} *</Label>
            <Input
              type="number"
              step="0.01"
              value={bracketPrice}
              onChange={(e) => setBracketPrice(e.target.value)}
              placeholder="1.90"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.vendorPanels.dRate.additionalWeight} kg</Label>
            <Input
              type="number"
              step="0.1"
              value={additionalWeightKg}
              onChange={(e) => setAdditionalWeightKg(e.target.value)}
              placeholder={t.common.optional}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.vendorPanels.dRate.additionalWeightPrice}</Label>
            <Input
              type="number"
              step="0.01"
              value={additionalWeightPrice}
              onChange={(e) => setAdditionalWeightPrice(e.target.value)}
              placeholder={t.common.optional}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.common.currency}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="RMB">RMB</SelectItem>
                <SelectItem value="HKD">HKD</SelectItem>
                <SelectItem value="JPY">JPY</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={addRow}>
            {t.common.add}
          </Button>
          <div className="space-y-1">
            <Label className="text-xs">{t.vendorPanels.bcRate.surcharge}</Label>
            <Input
              type="number"
              step="0.01"
              value={surcharge}
              onChange={(e) => setSurcharge(e.target.value)}
              placeholder="0"
              className="h-8 text-xs w-28"
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving || rates.length === 0}>
            {saving ? t.common.saving : t.common.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
