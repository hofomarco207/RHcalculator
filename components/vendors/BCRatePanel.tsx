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
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { RateVersionBar } from '@/components/vendors/RateVersionBar'
import type { Vendor } from '@/types'

interface BCRatePanelProps {
  vendor: Vendor
}

export function BCRatePanel({ vendor }: BCRatePanelProps) {
  const t = useT()
  const [ratePerKg, setRatePerKg] = useState('')
  const [fuelSurchargePct, setFuelSurchargePct] = useState('0')
  const [currency, setCurrency] = useState('TWD')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [versionRefreshKey, setVersionRefreshKey] = useState(0)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/vendors/${vendor.id}/bc-rates`)
        const data = await res.json()
        if (data && data.rate_per_kg != null) {
          setRatePerKg(String(data.rate_per_kg))
          setFuelSurchargePct(String(data.fuel_surcharge_pct ?? 0))
          setCurrency(data.currency || 'TWD')
          setNotes(data.notes || '')
        }
      } catch (err) {
        console.error('Load BC rates error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [vendor.id])

  async function handleSave() {
    const rate = parseFloat(ratePerKg)
    if (!ratePerKg || isNaN(rate) || rate <= 0) {
      toast.error('請輸入有效的每公斤費率')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/bc-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate_per_kg: rate,
          fuel_surcharge_pct: parseFloat(fuelSurchargePct) || 0,
          currency,
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${t.vendorPanels.bcRate.title} ${t.common.success}`)
      setVersionRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
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

  const rate = parseFloat(ratePerKg) || 0
  const fuelPct = parseFloat(fuelSurchargePct) || 0
  const totalMultiplier = 1 + fuelPct / 100

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{vendor.name} — {t.vendorPanels.bcRate.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RateVersionBar vendorId={vendor.id} table="vendor_bc_rates" refreshKey={versionRefreshKey} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">{t.vendorPanels.bcRate.ratePerKg} *</Label>
            <Input
              type="number"
              step="0.01"
              value={ratePerKg}
              onChange={(e) => setRatePerKg(e.target.value)}
              placeholder="9.18"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">燃油附加費 (%)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={fuelSurchargePct}
              onChange={(e) => setFuelSurchargePct(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.common.currency}</Label>
            <Select value={currency} onValueChange={setCurrency}>
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
          <div className="space-y-1">
            <Label className="text-xs">{t.common.notes}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.common.optional}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {rate > 0 && (
              <span>
                成本 = {rate} {currency}/KG × 重量 × {totalMultiplier.toFixed(4)}
                {fuelPct > 0 && <span className="text-blue-500 ml-1">（含 {fuelPct}% 燃油）</span>}
              </span>
            )}
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? t.common.saving : t.common.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
