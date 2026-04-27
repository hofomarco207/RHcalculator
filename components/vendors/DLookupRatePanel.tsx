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
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { RateVersionBar } from '@/components/vendors/RateVersionBar'
import type { Vendor } from '@/types'
import type { VendorDLookupRate, VendorDLookupAreaCountry } from '@/types/vendor'

interface DLookupRatePanelProps {
  vendor: Vendor
}

export function DLookupRatePanel({ vendor }: DLookupRatePanelProps) {
  const t = useT()
  const [rates, setRates] = useState<VendorDLookupRate[]>([])
  const [areaCountries, setAreaCountries] = useState<VendorDLookupAreaCountry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [versionRefreshKey, setVersionRefreshKey] = useState(0)
  const [surcharge, setSurcharge] = useState('')

  // New rate form
  const [areaCode, setAreaCode] = useState('')
  const [areaName, setAreaName] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('JPY')

  // New area-country mapping form
  const [mapAreaCode, setMapAreaCode] = useState('')
  const [mapCountryCode, setMapCountryCode] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/d-lookup-rates`)
      const data = await res.json()
      setRates(data.rates ?? [])
      setAreaCountries(data.area_countries ?? [])
      if (data.rates?.length > 0 && data.rates[0].additional_surcharge) {
        setSurcharge(String(data.rates[0].additional_surcharge))
      }
    } catch (err) {
      console.error('Load D lookup rates error:', err)
    } finally {
      setLoading(false)
    }
  }, [vendor.id])

  useEffect(() => { loadData() }, [loadData])

  function addRate() {
    if (!areaCode || !weightKg || !amount) {
      toast.error(t.common.required)
      return
    }
    setRates((prev) => [
      ...prev,
      {
        vendor_id: vendor.id,
        area_code: areaCode.toUpperCase(),
        area_name: areaName || undefined,
        weight_kg: parseFloat(weightKg),
        amount: parseFloat(amount),
        currency,
      },
    ])
    // Keep area for quick multi-weight entry
    setWeightKg('')
    setAmount('')
  }

  function removeRate(index: number) {
    setRates((prev) => prev.filter((_, i) => i !== index))
  }

  function addAreaCountry() {
    if (!mapAreaCode || !mapCountryCode) {
      toast.error(t.common.required)
      return
    }
    // Check for duplicate
    if (areaCountries.some((ac) => ac.country_code === mapCountryCode.toUpperCase())) {
      toast.error(`${mapCountryCode.toUpperCase()} 已存在於對照表中`)
      return
    }
    setAreaCountries((prev) => [
      ...prev,
      {
        vendor_id: vendor.id,
        area_code: mapAreaCode.toUpperCase(),
        country_code: mapCountryCode.toUpperCase(),
      },
    ])
    setMapCountryCode('')
  }

  function removeAreaCountry(index: number) {
    setAreaCountries((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (rates.length === 0) {
      toast.error(t.common.noData)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/d-lookup-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rates: rates.map((r) => ({
            area_code: r.area_code,
            area_name: r.area_name || null,
            weight_kg: r.weight_kg,
            amount: r.amount,
            currency: r.currency,
            additional_surcharge: surcharge ? parseFloat(surcharge) : 0,
          })),
          area_countries: areaCountries.map((ac) => ({
            area_code: ac.area_code,
            country_code: ac.country_code,
          })),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${t.vendorPanels.dRate.lookupTable} ${t.common.success}`)
      loadData()
      setVersionRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
  }

  // Build area × weight matrix for display
  const areas = [...new Set(rates.map((r) => r.area_code))].sort()
  const weights = [...new Set(rates.map((r) => r.weight_kg))].sort((a, b) => a - b)
  const rateMap = new Map<string, number>()
  for (const r of rates) {
    rateMap.set(`${r.area_code}-${r.weight_kg}`, r.amount)
  }

  // Group area-countries by area
  const areaCountryMap = new Map<string, string[]>()
  for (const ac of areaCountries) {
    if (!areaCountryMap.has(ac.area_code)) areaCountryMap.set(ac.area_code, [])
    areaCountryMap.get(ac.area_code)!.push(ac.country_code)
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
            {vendor.name} — {t.vendorPanels.dRate.title} {t.vendorPanels.dRate.lookupTable} (D-6)
          </CardTitle>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            lookup_table
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t.vendorPanels.dRate.lookupTable}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <RateVersionBar vendorId={vendor.id} table="vendor_d_lookup_rates" refreshKey={versionRefreshKey} />
        {/* ─── Rate Matrix ──────────────────────────────── */}
        {areas.length > 0 && weights.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2">{t.vendorPanels.dRate.lookupTable}</p>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-16">{t.common.weight}(kg)</TableHead>
                    {areas.map((a) => (
                      <TableHead key={a} className="text-center">
                        {a}
                        {rates.find((r) => r.area_code === a)?.area_name && (
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            {rates.find((r) => r.area_code === a)?.area_name}
                          </span>
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weights.map((w) => (
                    <TableRow key={w}>
                      <TableCell className="font-mono text-xs">{w}</TableCell>
                      {areas.map((a) => {
                        const val = rateMap.get(`${a}-${w}`)
                        return (
                          <TableCell key={a} className="text-center font-mono text-xs">
                            {val != null ? val.toLocaleString() : '—'}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {areas.length} 個區域 × {weights.length} 個重量點 = {rates.length} 筆費率（{rates[0]?.currency ?? 'JPY'}）
            </p>
          </div>
        )}

        {/* ─── Add Rate Form ─────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t.common.add}</p>
          <div className="grid grid-cols-5 gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">{t.common.code} *</Label>
              <Input
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value)}
                placeholder="A"
                className="h-8 text-xs"
                maxLength={5}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.common.name}</Label>
              <Input
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder={t.common.optional}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.common.weight} kg *</Label>
              <Input
                type="number" step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="0.5"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.common.amount} *</Label>
              <Input
                type="number" step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="520"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.common.currency}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="JPY">JPY</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="RMB">RMB</SelectItem>
                  <SelectItem value="HKD">HKD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={addRate}>{t.common.add}</Button>
        </div>

        {/* ─── Delete individual rates ──────────────────── */}
        {rates.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">{t.common.rate}</p>
            <div className="overflow-x-auto rounded-md border max-h-48 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.vendorPanels.dRate.zone}</TableHead>
                    <TableHead>{t.common.weight}</TableHead>
                    <TableHead>{t.common.amount}</TableHead>
                    <TableHead>{t.common.currency}</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...rates]
                    .sort((a, b) => a.area_code.localeCompare(b.area_code) || a.weight_kg - b.weight_kg)
                    .map((r, i) => {
                      const origIdx = rates.indexOf(r)
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{r.area_code}</TableCell>
                          <TableCell className="font-mono text-xs">{r.weight_kg}</TableCell>
                          <TableCell className="font-mono text-xs">{r.amount.toLocaleString()}</TableCell>
                          <TableCell className="text-xs">{r.currency}</TableCell>
                          <TableCell>
                            <button
                              onClick={() => removeRate(origIdx)}
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
          </div>
        )}

        {/* ─── Area → Country Mapping ──────────────────── */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">{t.vendorPanels.dRate.zone} → {t.common.country}</p>

          {areaCountryMap.size > 0 && (
            <div className="space-y-2">
              {[...areaCountryMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([area, countries]) => (
                <div key={area} className="flex items-start gap-2">
                  <span className="text-xs font-mono font-medium w-8 pt-1">{area}</span>
                  <div className="flex flex-wrap gap-1">
                    {countries.sort().map((cc) => {
                      const idx = areaCountries.findIndex(
                        (ac) => ac.area_code === area && ac.country_code === cc
                      )
                      return (
                        <Badge
                          key={cc}
                          variant="secondary"
                          className="text-xs font-mono cursor-pointer hover:bg-destructive/20"
                          onClick={() => removeAreaCountry(idx)}
                          title={t.common.delete}
                        >
                          {cc} ×
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">{t.common.code}</Label>
              <Input
                value={mapAreaCode}
                onChange={(e) => setMapAreaCode(e.target.value)}
                placeholder="A"
                className="h-8 text-xs"
                maxLength={5}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.common.country}</Label>
              <Input
                value={mapCountryCode}
                onChange={(e) => setMapCountryCode(e.target.value)}
                placeholder="JP"
                className="h-8 text-xs"
                maxLength={3}
              />
            </div>
            <Button size="sm" variant="outline" onClick={addAreaCountry}>
              {t.common.add}
            </Button>
          </div>
        </div>

        {/* ─── Save ──────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-2 border-t">
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
              {rates.length} 筆費率 + {areaCountries.length} 筆國家對照
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
