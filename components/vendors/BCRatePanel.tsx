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
  const [handlingFee, setHandlingFee] = useState('')
  const [surcharge, setSurcharge] = useState('')
  const [currency, setCurrency] = useState('USD')
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
          setHandlingFee(String(data.handling_fee_per_unit || ''))
          setSurcharge(String(data.additional_surcharge || ''))
          setCurrency(data.currency || 'USD')
          setNotes(data.notes || '')
        }
      } catch (err) {
        console.error('Load BCD rates error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [vendor.id])

  async function handleSave() {
    const rate = parseFloat(ratePerKg)
    if (!ratePerKg || isNaN(rate) || rate <= 0) {
      toast.error(t.vendorPanels.bcRate.ratePerKg)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/bc-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate_per_kg: rate,
          handling_fee_per_unit: handlingFee ? parseFloat(handlingFee) : 0,
          additional_surcharge: surcharge ? parseFloat(surcharge) : 0,
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
  const handling = parseFloat(handlingFee) || 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{vendor.name} — {t.vendorPanels.bcRate.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RateVersionBar vendorId={vendor.id} table="vendor_bc_rates" refreshKey={versionRefreshKey} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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
            <Label className="text-xs">{t.vendorPanels.bcRate.handlingFee}</Label>
            <Input
              type="number"
              step="0.01"
              value={handlingFee}
              onChange={(e) => setHandlingFee(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.vendorPanels.bcRate.surcharge}</Label>
            <Input
              type="number"
              step="0.01"
              value={surcharge}
              onChange={(e) => setSurcharge(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.common.currency}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="RMB">RMB</SelectItem>
                <SelectItem value="HKD">HKD</SelectItem>
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
                成本 = {rate} {currency}/KG × 重量
                {handling > 0 && ` + ${handling} ${currency}/單`}
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
