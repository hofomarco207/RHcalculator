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
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

interface ARatePanelProps {
  vendor: { id: string; name: string; per_piece_fee?: number; per_piece_currency?: string }
}

export function ARatePanel({ vendor }: ARatePanelProps) {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // per_kg fields
  const [pickupRate, setPickupRate] = useState('')
  const [sortingRate, setSortingRate] = useState('')
  const [includeSorting, setIncludeSorting] = useState(false)
  const [bubbleRatio, setBubbleRatio] = useState('1.0')
  const [perKgCurrency, setPerKgCurrency] = useState('TWD')
  // per_piece fields (additive, not exclusive)
  const [perPieceFee, setPerPieceFee] = useState(String(vendor.per_piece_fee ?? ''))
  const [perPieceCurrency, setPerPieceCurrency] = useState(vendor.per_piece_currency ?? 'TWD')

  const loadRates = useCallback(async () => {
    setLoading(true)
    try {
      const vendorRes = await fetch(`/api/vendors/${vendor.id}`)
      const vendorData = await vendorRes.json()
      if (vendorData.per_piece_fee != null) setPerPieceFee(String(vendorData.per_piece_fee))
      if (vendorData.per_piece_currency) setPerPieceCurrency(vendorData.per_piece_currency)

      const res = await fetch(`/api/vendors/${vendor.id}/a-rates`)
      const data = await res.json()
      const current = Array.isArray(data) ? data[0] : data
      if (current) {
        setPickupRate(String(current.pickup_hkd_per_kg ?? ''))
        setSortingRate(String(current.sorting_hkd_per_kg ?? ''))
        setIncludeSorting(current.include_sorting ?? false)
        setBubbleRatio(String(current.bubble_ratio ?? 1.0))
        if (current.per_kg_currency) setPerKgCurrency(current.per_kg_currency)
      }
    } catch (err) {
      console.error('Load A rates error:', err)
    } finally {
      setLoading(false)
    }
  }, [vendor.id])

  useEffect(() => { loadRates() }, [loadRates])

  async function handleSave() {
    setSaving(true)
    try {
      const pickupNum = parseFloat(pickupRate) || 0
      const sortingNum = parseFloat(sortingRate) || 0
      const bubbleNum = parseFloat(bubbleRatio) || 1.0
      const perPieceNum = perPieceFee ? parseFloat(perPieceFee) : 0

      const hasPerKg = pickupNum > 0 || sortingNum > 0
      const hasPerPiece = perPieceNum > 0
      if (!hasPerKg && !hasPerPiece) {
        toast.error('至少需設定一項（按公斤或按件）')
        setSaving(false)
        return
      }

      // Save per_piece fields to vendor (can be 0 to clear)
      const patchBody: Record<string, unknown> = {
        per_piece_fee: perPieceNum > 0 ? perPieceNum : null,
        per_piece_currency: perPieceNum > 0 ? perPieceCurrency : null,
      }
      const vendorRes = await fetch(`/api/vendors/${vendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })
      if (!vendorRes.ok) throw new Error((await vendorRes.json()).error)

      // Save per_kg rate to vendor_a_rates (always write, even if 0, to carry bubble_ratio)
      const ratesRes = await fetch(`/api/vendors/${vendor.id}/a-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rates: [{
            pickup_hkd_per_kg: pickupNum,
            sorting_hkd_per_kg: sortingNum,
            include_sorting: includeSorting,
            bubble_ratio: bubbleNum,
            per_kg_currency: perKgCurrency,
          }],
        }),
      })
      if (!ratesRes.ok) throw new Error((await ratesRes.json()).error)

      toast.success(`${t.vendorPanels.aRate.title} ${t.common.success}`)
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{vendor.name} — {t.vendorPanels.aRate.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4">{t.common.loading}</p>
        ) : (
          <div className="space-y-5">
            {/* 按公斤 */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">按公斤計費</h4>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">幣種</Label>
                  <Select value={perKgCurrency} onValueChange={setPerKgCurrency}>
                    <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TWD">TWD</SelectItem>
                      <SelectItem value="HKD">HKD</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="RMB">RMB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>{t.vendorPanels.aRate.pickupFee}（{perKgCurrency}/kg）</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={pickupRate}
                    onChange={(e) => setPickupRate(e.target.value)}
                    placeholder="例：4"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t.vendorPanels.aRate.sortingFee}（{perKgCurrency}/kg）</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={sortingRate}
                    onChange={(e) => setSortingRate(e.target.value)}
                    placeholder="例：1.0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>拋率</Label>
                  <Input
                    type="number" step="0.01" min="1" max="2"
                    value={bubbleRatio}
                    onChange={(e) => setBubbleRatio(e.target.value)}
                    placeholder="例：1.1"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="include-sorting" type="checkbox"
                  checked={includeSorting}
                  onChange={(e) => setIncludeSorting(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="include-sorting" className="cursor-pointer font-normal">
                  包含分揀費
                </Label>
              </div>
            </section>

            {/* 按件（附加） */}
            <section className="space-y-3 border-t pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                按件計費（附加，可留空）
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>件費</Label>
                  <Input
                    type="number" step="0.1" min="0"
                    value={perPieceFee}
                    onChange={(e) => setPerPieceFee(e.target.value)}
                    placeholder="例：1 (換單費)"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>件費幣種</Label>
                  <Select value={perPieceCurrency} onValueChange={setPerPieceCurrency}>
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
              <p className="text-xs text-muted-foreground">
                A段成本 = (處理費 + 分揀費?) × 實重 × 拋率 × TWD/HKD匯率 + 件費折 HKD
              </p>
            </section>

            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? t.common.saving : t.common.save}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
