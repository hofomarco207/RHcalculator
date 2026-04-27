'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { RateVersionBar } from '@/components/vendors/RateVersionBar'
import type { Vendor } from '@/types'
import type { VendorDTieredRate } from '@/types/vendor'

interface DTieredRatePanelProps {
  vendor: Vendor
}

export function DTieredRatePanel({ vendor }: DTieredRatePanelProps) {
  const t = useT()
  const [rates, setRates] = useState<VendorDTieredRate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [versionRefreshKey, setVersionRefreshKey] = useState(0)
  const [surcharge, setSurcharge] = useState('')

  // New row form
  const [countryCode, setCountryCode] = useState('')
  const [countryName, setCountryName] = useState('')
  const [weightMin, setWeightMin] = useState('')
  const [weightMax, setWeightMax] = useState('')
  const [ratePerKg, setRatePerKg] = useState('')
  const [regFee, setRegFee] = useState('')
  const [minChargeable, setMinChargeable] = useState('')
  const [transitDays, setTransitDays] = useState('')
  const [currency, setCurrency] = useState('USD')

  const loadRates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/d-tiered-rates`)
      const data = await res.json()
      if (Array.isArray(data)) {
        setRates(data)
        if (data.length > 0 && data[0].additional_surcharge) {
          setSurcharge(String(data[0].additional_surcharge))
        }
      }
    } catch (err) {
      console.error('Load D tiered rates error:', err)
    } finally {
      setLoading(false)
    }
  }, [vendor.id])

  useEffect(() => { loadRates() }, [loadRates])

  function addRow() {
    if (!countryCode || !ratePerKg) {
      toast.error(`${t.common.country} / ${t.common.rate}`)
      return
    }
    setRates((prev) => [
      ...prev,
      {
        vendor_id: vendor.id,
        country_code: countryCode.toUpperCase(),
        country_name: countryName || undefined,
        weight_min_kg: parseFloat(weightMin) || 0,
        weight_max_kg: parseFloat(weightMax) || 9999,
        rate_per_kg: parseFloat(ratePerKg),
        registration_fee: parseFloat(regFee) || 0,
        currency,
        min_chargeable_weight_kg: minChargeable ? parseFloat(minChargeable) : undefined,
        transit_days: transitDays || undefined,
      },
    ])
    // Reset form but keep country for quick multi-tier entry
    setWeightMin(weightMax) // next tier starts where this one ended
    setWeightMax('')
    setRatePerKg('')
    setRegFee('')
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
      const res = await fetch(`/api/vendors/${vendor.id}/d-tiered-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rates: rates.map((r) => ({
            country_code: r.country_code,
            country_name: r.country_name || null,
            weight_min_kg: r.weight_min_kg,
            weight_max_kg: r.weight_max_kg,
            rate_per_kg: r.rate_per_kg,
            registration_fee: r.registration_fee,
            currency: r.currency,
            min_chargeable_weight_kg: r.min_chargeable_weight_kg || null,
            transit_days: r.transit_days || null,
            additional_surcharge: surcharge ? parseFloat(surcharge) : 0,
          })),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${t.vendorPanels.dRate.tieredRates} ${t.common.success}`)
      loadRates()
      setVersionRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
  }

  // Group by country for display
  const grouped = new Map<string, VendorDTieredRate[]>()
  const sorted = [...rates].sort((a, b) => {
    if (a.country_code !== b.country_code) return a.country_code.localeCompare(b.country_code)
    return a.weight_min_kg - b.weight_min_kg
  })
  for (const r of sorted) {
    const key = r.country_code
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(r)
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
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {vendor.name} — {t.vendorPanels.dRate.title} {t.vendorPanels.dRate.tieredRates} (D-5)
          </CardTitle>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            tiered_per_kg
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          依國家和重量段計價：cost = rate_per_kg x max(weight, min_chargeable) + registration_fee
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <RateVersionBar vendorId={vendor.id} table="vendor_d_tiered_rates" refreshKey={versionRefreshKey} />
        {/* Current rates table */}
        {rates.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-16">{t.common.country}</TableHead>
                  <TableHead>{t.vendorPanels.dRate.weightBracket} (kg)</TableHead>
                  <TableHead>{t.vendorPanels.bRate.ratePerKg}</TableHead>
                  <TableHead>{t.verification.regFee}</TableHead>
                  <TableHead>MIN kg</TableHead>
                  <TableHead>{t.common.currency}</TableHead>
                  <TableHead>{t.vendorPanels.bRate.transitDays}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r, i) => {
                  const origIdx = rates.indexOf(r)
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs font-medium">
                        {r.country_code}
                        {r.country_name && (
                          <span className="text-muted-foreground ml-1">({r.country_name})</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.weight_min_kg}–{r.weight_max_kg >= 9999 ? '∞' : r.weight_max_kg}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.rate_per_kg}</TableCell>
                      <TableCell className="font-mono text-xs">{r.registration_fee || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.min_chargeable_weight_kg ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">{r.currency}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.transit_days ?? '—'}
                      </TableCell>
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
          </div>
        )}

        {/* Add row form */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t.common.add}</p>
          <div className="grid grid-cols-4 gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">{t.common.code} *</Label>
              <Input
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                placeholder="US"
                className="h-8 text-xs"
                maxLength={3}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.common.name}</Label>
              <Input
                value={countryName}
                onChange={(e) => setCountryName(e.target.value)}
                placeholder={t.common.optional}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.common.weight} min kg</Label>
              <Input
                type="number" step="0.01"
                value={weightMin}
                onChange={(e) => setWeightMin(e.target.value)}
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.common.weight} max kg</Label>
              <Input
                type="number" step="0.01"
                value={weightMax}
                onChange={(e) => setWeightMax(e.target.value)}
                placeholder="9999"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">費率/KG *</Label>
              <Input
                type="number" step="0.01"
                value={ratePerKg}
                onChange={(e) => setRatePerKg(e.target.value)}
                placeholder="0.00"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.verification.regFee}</Label>
              <Input
                type="number" step="0.01"
                value={regFee}
                onChange={(e) => setRegFee(e.target.value)}
                placeholder="0.00"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">MIN kg</Label>
              <Input
                type="number" step="0.01"
                value={minChargeable}
                onChange={(e) => setMinChargeable(e.target.value)}
                placeholder={t.common.optional}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.vendorPanels.bRate.transitDays}</Label>
              <Input
                value={transitDays}
                onChange={(e) => setTransitDays(e.target.value)}
                placeholder="7-15天"
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
          {rates.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {grouped.size} 個國家，{rates.length} 筆費率
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
