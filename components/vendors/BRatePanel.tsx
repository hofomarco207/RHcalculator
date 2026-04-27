'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Pencil, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ExcelDropZone } from '@/components/data/ExcelDropZone'
import { parseVendorBExcel } from '@/lib/excel/vendor-b-parser'
import { useCountry } from '@/lib/context/country-context'
import { useT } from '@/lib/i18n'
import { RateVersionBar } from '@/components/vendors/RateVersionBar'
import { BRateCompareDialog } from '@/components/vendors/BRateCompareDialog'
import { BSurchargeEditor } from '@/components/vendors/BSurchargeEditor'
import type { Vendor } from '@/types'
import type { VendorBRate, BSurcharge } from '@/types/vendor'

interface BRatePanelProps {
  vendor: Vendor
}

export function BRatePanel({ vendor }: BRatePanelProps) {
  const isSimple = vendor.config?.simple_rate === true
  const [quickInput, setQuickInput] = useState(false)

  if (isSimple || quickInput) {
    return <BRateSimplePanel vendor={vendor} onSwitchToFull={isSimple ? undefined : () => setQuickInput(false)} />
  }
  return <BRateFullPanel vendor={vendor} onSwitchToQuick={() => setQuickInput(true)} />
}

// ─── Simple Rate Panel (per-KG only, no Excel) ──────────────────────────────

function BRateSimplePanel({ vendor, onSwitchToFull }: { vendor: Vendor; onSwitchToFull?: () => void }) {
  const t = useT()
  const { gateways } = useCountry()
  const [rates, setRates] = useState<VendorBRate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [versionRefreshKey, setVersionRefreshKey] = useState(0)

  const [surcharge, setSurcharge] = useState('')

  // Per-gateway simple inputs: { gateway_code → { rate, currency, flights, documentFee } }
  const [gwInputs, setGwInputs] = useState<Record<string, { rate: string; currency: string; flights: string; documentFee: string }>>({})

  const loadRates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/b-rates`)
      const data = await res.json()
      if (Array.isArray(data)) {
        setRates(data)
        // Populate inputs from existing rates
        const inputs: typeof gwInputs = {}
        for (const r of data as VendorBRate[]) {
          const totalMawbFee =
            (r.pickup_fee ?? 0) + (r.handling_fee ?? 0) +
            (r.operation_fee ?? 0) + (r.document_fee ?? 0) +
            (r.battery_check_fee ?? 0) + (r.customs_fee ?? 0) +
            (r.airport_transfer_fee ?? 0) + (r.magnetic_check_fee ?? 0)
          inputs[r.gateway_code] = {
            rate: String(r.rate_per_kg),
            currency: r.currency,
            flights: String(r.flights_per_week ?? 7),
            documentFee: totalMawbFee > 0 ? String(totalMawbFee) : '',
          }
        }
        setGwInputs(inputs)
        // Load surcharge from first rate
        const firstRate = data[0] as VendorBRate
        if (firstRate?.additional_surcharge) {
          setSurcharge(String(firstRate.additional_surcharge))
        }
      }
    } catch (err) {
      console.error('Load B rates error:', err)
    } finally {
      setLoading(false)
    }
  }, [vendor.id])

  useEffect(() => { loadRates() }, [loadRates])

  function updateGwInput(gw: string, field: string, value: string) {
    setGwInputs((prev) => ({
      ...prev,
      [gw]: { ...prev[gw], rate: prev[gw]?.rate ?? '', currency: prev[gw]?.currency ?? 'RMB', flights: prev[gw]?.flights ?? '7', documentFee: prev[gw]?.documentFee ?? '', [field]: value },
    }))
  }

  async function handleSave() {
    const rateRows = Object.entries(gwInputs)
      .filter(([, v]) => v.rate && parseFloat(v.rate) > 0)
      .map(([gw, v]) => ({
        gateway_code: gw,
        service_name: t.vendorPanels.bRate.simpleRateLabel,
        weight_tier_min_kg: 0,
        rate_per_kg: parseFloat(v.rate),
        currency: v.currency,
        flights_per_week: parseInt(v.flights) || 7,
        pickup_fee: 0, handling_fee: 0, operation_fee: 0,
        document_fee: parseFloat(v.documentFee) || 0,
        battery_check_fee: 0, customs_fee: 0,
        additional_surcharge: surcharge ? parseFloat(surcharge) : 0,
      }))

    if (rateRows.length === 0) {
      toast.error(t.vendorPanels.bRate.gateway)
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/b-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates: rateRows }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${t.vendorPanels.bRate.title} ${t.common.success}`)
      loadRates()
      setVersionRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
  }

  // Available gateways (from DB gateways + any existing in rates)
  const availableGws = [
    ...new Set([
      ...gateways.map((g) => g.code),
      ...rates.map((r) => r.gateway_code),
    ]),
  ].sort()

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{vendor.name} — {t.vendorPanels.bRate.title} ({t.vendorPanels.bRate.simpleRateLabel})</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{t.vendorPanels.bRate.simpleRateLabel}</span>
            {onSwitchToFull && (
              <Button size="sm" variant="ghost" onClick={onSwitchToFull} className="text-xs h-7">
                {t.common.fullView}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <RateVersionBar vendorId={vendor.id} table="vendor_b_rates" refreshKey={versionRefreshKey} />
        {loading ? (
          <p className="text-sm text-muted-foreground py-4">{t.common.loading}</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {t.pages.vendors.simpleRate}
            </p>
            <div className="space-y-3">
              {availableGws.map((gw) => {
                const inp = gwInputs[gw] || { rate: '', currency: 'RMB', flights: '7', documentFee: '' }
                return (
                  <div key={gw} className="grid grid-cols-5 gap-3 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">{t.vendorPanels.bRate.gateway}</Label>
                      <div className="h-9 flex items-center px-3 bg-muted/50 rounded-md text-sm font-medium">{gw}</div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t.vendorPanels.bRate.ratePerKg}</Label>
                      <Input
                        type="number" step="0.01" min="0"
                        value={inp.rate}
                        onChange={(e) => updateGwInput(gw, 'rate', e.target.value)}
                        placeholder="例：4.5"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t.common.currency}</Label>
                      <select
                        value={inp.currency}
                        onChange={(e) => updateGwInput(gw, 'currency', e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="RMB">RMB</option>
                        <option value="USD">USD</option>
                        <option value="HKD">HKD</option>
                        <option value="JPY">JPY</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t.vendorPanels.bRate.documentFee}/MAWB</Label>
                      <Input
                        type="number" step="0.01" min="0"
                        value={inp.documentFee}
                        onChange={(e) => updateGwInput(gw, 'documentFee', e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t.vendorPanels.bRate.flightsPerWeek}</Label>
                      <Input
                        type="number" step="1" min="1"
                        value={inp.flights}
                        onChange={(e) => updateGwInput(gw, 'flights', e.target.value)}
                        placeholder="7"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t.vendorPanels.bcRate.surcharge}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={surcharge}
                  onChange={(e) => setSurcharge(e.target.value)}
                  placeholder="0"
                  className="h-9 w-32"
                />
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? t.common.saving : t.common.save}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Full Rate Panel (Excel import, tiered rates) ───────────────────────────

function BRateFullPanel({ vendor, onSwitchToQuick }: { vendor: Vendor; onSwitchToQuick?: () => void }) {
  const t = useT()
  const [rates, setRates] = useState<VendorBRate[]>([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [versionRefreshKey, setVersionRefreshKey] = useState(0)
  const [surchargeEdit, setSurchargeEdit] = useState<{
    service: string; gateway: string; currency: string; initial: BSurcharge[]; sampleRateId: string
  } | null>(null)
  const initialBuffer = typeof vendor.config?.b_buffer_pct === 'number' ? vendor.config.b_buffer_pct : 0.1
  const [bufferPctStr, setBufferPctStr] = useState((initialBuffer * 100).toFixed(1).replace(/\.0$/, ''))
  const [bufferSaving, setBufferSaving] = useState(false)
  const [showCompare, setShowCompare] = useState(false)

  async function handleSaveBuffer() {
    const raw = parseFloat(bufferPctStr)
    if (isNaN(raw) || raw < 0 || raw > 100) {
      toast.error('Buffer 需介於 0–100%')
      return
    }
    setBufferSaving(true)
    try {
      const nextConfig = { ...(vendor.config ?? {}), b_buffer_pct: raw / 100 }
      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: nextConfig }),
      })
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`)
      vendor.config = nextConfig
      toast.success('Buffer 已更新')
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setBufferSaving(false)
    }
  }

  const loadRates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/b-rates`)
      const data = await res.json()
      if (Array.isArray(data)) setRates(data)
    } catch (err) {
      console.error('Load B rates error:', err)
    } finally {
      setLoading(false)
    }
  }, [vendor.id])

  useEffect(() => { loadRates() }, [loadRates])

  /** PATCH a single field on a rate row (inline edit). Does NOT bump version. */
  const patchRate = useCallback(async (rateId: string, updates: Record<string, unknown>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/b-rates/${rateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      return true
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
      return false
    }
  }, [vendor.id, t])

  async function handleCellSave(rateId: string, field: 'rate_per_kg' | 'bubble_ratio', value: number) {
    const ok = await patchRate(rateId, { [field]: value })
    if (ok) {
      setRates((prev) => prev.map((r) => r.id === rateId ? { ...r, [field]: value } : r))
      toast.success(t.common.success)
    }
  }

  async function handleSurchargesSave(surcharges: BSurcharge[]) {
    if (!surchargeEdit) return
    const ok = await patchRate(surchargeEdit.sampleRateId, { surcharges })
    if (ok) {
      // Broadcast updates to local state for all rows in the same service+gateway group
      setRates((prev) => prev.map((r) =>
        (r.service_name ?? '') === surchargeEdit.service && r.gateway_code === surchargeEdit.gateway
          ? { ...r, surcharges }
          : r
      ))
      toast.success(t.common.success)
      setSurchargeEdit(null)
    }
  }

  // Group rates by service_name, then by gateway
  const services = [...new Set(rates.map((r) => r.service_name ?? ''))].sort()

  // Median per (gateway, weight_tier_min_kg) in original currency (display-only).
  // Only shows entries where ≥2 services exist (the scenarios where median actually applies).
  const medianRows: Array<{
    gateway: string
    tier: number
    currency: string
    medianRate: number
    serviceCount: number
  }> = []
  const gwTierKeys = [...new Set(rates.map((r) => `${r.gateway_code}|${r.weight_tier_min_kg}|${r.currency}`))]
  for (const key of gwTierKeys) {
    const [gw, tierStr, cur] = key.split('|')
    const tier = Number(tierStr)
    const group = rates.filter((r) =>
      r.gateway_code === gw && r.weight_tier_min_kg === tier && r.currency === cur
    )
    const uniqueServices = new Set(group.map((r) => r.service_name ?? ''))
    if (uniqueServices.size < 2) continue
    const nums = group.map((r) => r.rate_per_kg).sort((a, b) => a - b)
    const mid = Math.floor(nums.length / 2)
    const med = nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid]
    medianRows.push({ gateway: gw, tier, currency: cur, medianRate: med, serviceCount: uniqueServices.size })
  }
  medianRows.sort((a, b) => a.gateway.localeCompare(b.gateway) || a.tier - b.tier)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{vendor.name} — {t.vendorPanels.bRate.title}</CardTitle>
          <div className="flex items-center gap-2">
            {onSwitchToQuick && (
              <Button size="sm" variant="ghost" onClick={onSwitchToQuick} className="text-xs h-7">
                {t.common.quickInput}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
              {t.common.import} Excel
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <RateVersionBar
          vendorId={vendor.id}
          table="vendor_b_rates"
          refreshKey={versionRefreshKey}
          onCompare={() => setShowCompare(true)}
          onSnapshot={async () => {
            const res = await fetch(`/api/vendors/${vendor.id}/b-rates/snapshot`, { method: 'POST' })
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: '' }))
              throw new Error(err.error || `HTTP ${res.status}`)
            }
            await loadRates()
          }}
        />
        <BRateCompareDialog
          vendorId={vendor.id}
          vendorName={vendor.name}
          open={showCompare}
          onOpenChange={setShowCompare}
        />

        {!loading && medianRows.length > 0 && (
          <div className="mb-5 rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h4 className="text-sm font-semibold">中位數定價摘要</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  每個口岸 × 重量段取 ≥2 家服務的中位數，作為保守預算參考（僅顯示，不可編輯）
                </p>
              </div>
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Buffer %</Label>
                  <Input
                    type="number" step="0.1" min="0" max="100"
                    value={bufferPctStr}
                    onChange={(e) => setBufferPctStr(e.target.value)}
                    className="h-8 w-24 text-sm"
                  />
                </div>
                <Button size="sm" onClick={handleSaveBuffer} disabled={bufferSaving} className="h-8">
                  {bufferSaving ? t.common.saving : t.common.save}
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto rounded border bg-background">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-24">{t.vendorPanels.bRate.gateway}</TableHead>
                    <TableHead className="w-24">{t.vendorPanels.bRate.weightTier}</TableHead>
                    <TableHead className="w-28">中位數</TableHead>
                    <TableHead className="w-20">{t.common.currency}</TableHead>
                    <TableHead className="w-40">取中位數服務數</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {medianRows.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{m.gateway}</TableCell>
                      <TableCell>{m.tier}+ kg</TableCell>
                      <TableCell className="font-mono">{m.medianRate.toFixed(2)}</TableCell>
                      <TableCell>{m.currency}</TableCell>
                      <TableCell>{m.serviceCount} 家</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">{t.common.loading}</p>
        ) : rates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t.common.noData}</p>
        ) : (
          <div className="space-y-6">
            {services.map((svc) => {
              const svcRates = rates.filter((r) => (r.service_name ?? '') === svc)
              const gateways = [...new Set(svcRates.map((r) => r.gateway_code))].sort()
              const sample = svcRates[0]
              return (
                <div key={svc} className="space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h4 className="text-sm font-semibold">{svc || t.vendorPanels.bRate.serviceName}</h4>
                    {sample?.airline && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{t.vendorPanels.bRate.airline}: {sample.airline}</span>
                    )}
                    {sample?.routing && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{t.vendorPanels.bRate.routing}: {sample.routing}</span>
                    )}
                    {sample?.transit_days && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{t.vendorPanels.bRate.transitDays}: {sample.transit_days}</span>
                    )}
                    {sample?.flights_per_week && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{sample.flights_per_week} {t.vendorPanels.bRate.flightsPerWeek}</span>
                    )}
                    {sample?.service_type && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{sample.service_type}</span>
                    )}
                  </div>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-20">{t.vendorPanels.bRate.gateway}</TableHead>
                          <TableHead className="w-24">{t.vendorPanels.bRate.weightTier}</TableHead>
                          <TableHead className="w-28">{t.vendorPanels.bRate.ratePerKg}</TableHead>
                          <TableHead className="w-20">{t.common.currency}</TableHead>
                          <TableHead className="w-20">拋率</TableHead>
                          <TableHead>附加費</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gateways.map((gw) => {
                          const gwRates = svcRates
                            .filter((r) => r.gateway_code === gw)
                            .sort((a, b) => a.weight_tier_min_kg - b.weight_tier_min_kg)
                          const firstInGroup = gwRates[0]
                          const sharedSurcharges = firstInGroup?.surcharges ?? []
                          return gwRates.map((r, tierIdx) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">{r.gateway_code}</TableCell>
                              <TableCell>{r.weight_tier_min_kg}+ kg</TableCell>
                              <TableCell className="font-mono">
                                <InlineNumberCell
                                  value={r.rate_per_kg}
                                  step={0.01}
                                  min={0}
                                  onSave={(v) => handleCellSave(r.id!, 'rate_per_kg', v)}
                                />
                              </TableCell>
                              <TableCell>{r.currency}</TableCell>
                              <TableCell className="font-mono">
                                <InlineNumberCell
                                  value={r.bubble_ratio ?? 1.0}
                                  step={0.01}
                                  min={0.1}
                                  max={3}
                                  onSave={(v) => handleCellSave(r.id!, 'bubble_ratio', v)}
                                />
                              </TableCell>
                              <TableCell>
                                {tierIdx === 0 ? (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {sharedSurcharges.length === 0 ? (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    ) : (
                                      sharedSurcharges.map((s, i) => (
                                        <SurchargeChip key={i} surcharge={s} />
                                      ))
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-xs"
                                      onClick={() =>
                                        setSurchargeEdit({
                                          service: svc,
                                          gateway: gw,
                                          currency: r.currency,
                                          initial: sharedSurcharges,
                                          sampleRateId: r.id!,
                                        })
                                      }
                                    >
                                      <Pencil className="h-3 w-3 mr-1" />編輯
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">（與首重段共用）</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {showImport && (
        <BRateImportDialog
          vendor={vendor}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); loadRates(); setVersionRefreshKey((k) => k + 1) }}
        />
      )}

      {surchargeEdit && (
        <Dialog open onOpenChange={(open) => !open && setSurchargeEdit(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                編輯附加費 — {surchargeEdit.service} / {surchargeEdit.gateway}
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              修改後會同步套用到此服務 × 口岸下的所有重量段（不會建立新版本）。
            </p>
            <SurchargeEditDialogBody
              initial={surchargeEdit.initial}
              defaultCurrency={surchargeEdit.currency}
              onSave={handleSurchargesSave}
              onCancel={() => setSurchargeEdit(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}

// ─── Inline Number Cell ─────────────────────────────────────────────────────

function InlineNumberCell({
  value, step = 0.01, min, max, onSave,
}: {
  value: number
  step?: number
  min?: number
  max?: number
  onSave: (v: number) => Promise<void> | void
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(String(value))
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setInput(String(value)) }, [value])
  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select() }
  }, [editing])

  async function commit() {
    const n = parseFloat(input)
    if (isNaN(n) || n === value) { setEditing(false); setInput(String(value)); return }
    if (min != null && n < min) { toast.error(`不可小於 ${min}`); setInput(String(value)); setEditing(false); return }
    if (max != null && n > max) { toast.error(`不可大於 ${max}`); setInput(String(value)); setEditing(false); return }
    setBusy(true)
    try {
      await onSave(n)
    } finally {
      setBusy(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          type="number"
          step={step}
          min={min}
          max={max}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') { setInput(String(value)); setEditing(false) }
          }}
          disabled={busy}
          className="h-7 w-24 text-xs"
        />
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
    )
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 group hover:bg-muted/50 rounded px-1 -mx-1"
      onClick={() => setEditing(true)}
      title="點擊編輯"
    >
      <span>{value}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />
    </button>
  )
}

// ─── Surcharge Chip ─────────────────────────────────────────────────────────

function SurchargeChip({ surcharge }: { surcharge: BSurcharge }) {
  const s = surcharge
  let text: string
  if (s.unit === 'per_mawb') text = `${s.name} ${s.amount}${s.currency}`
  else if (s.unit === 'per_kg') text = `${s.name} ${s.rate}/kg`
  else if (s.unit === 'per_kg_with_min') text = `${s.name} ${s.rate}/kg MIN${s.min}`
  else if (s.unit === 'per_hawb') text = `${s.name} ${s.amount}/票`
  else if (s.unit === 'conditional') text = `${s.name}(${s.condition || '條件'})`
  else text = s.name
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-0.5">
      {text}
      {s.from_notes && <span className="text-[9px] text-muted-foreground">*</span>}
    </span>
  )
}

// ─── Surcharge Edit Dialog Body ─────────────────────────────────────────────

function SurchargeEditDialogBody({
  initial, defaultCurrency, onSave, onCancel,
}: {
  initial: BSurcharge[]
  defaultCurrency: string
  onSave: (s: BSurcharge[]) => Promise<void> | void
  onCancel: () => void
}) {
  const [surcharges, setSurcharges] = useState<BSurcharge[]>(initial)
  const [saving, setSaving] = useState(false)
  const t = useT()
  return (
    <>
      <BSurchargeEditor
        surcharges={surcharges}
        onChange={setSurcharges}
        defaultCurrency={defaultCurrency}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>{t.common.cancel}</Button>
        <Button
          onClick={async () => { setSaving(true); try { await onSave(surcharges) } finally { setSaving(false) } }}
          disabled={saving}
        >
          {saving ? t.common.saving : t.common.save}
        </Button>
      </DialogFooter>
    </>
  )
}

// ─── Import Dialog ──────────────────────────────────────────────────────────

function BRateImportDialog({
  vendor,
  onClose,
  onImported,
}: {
  vendor: Vendor
  onClose: () => void
  onImported: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{
    rates: ReturnType<typeof parseVendorBExcel>['rates']
    services: string[]
    gateways: string[]
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const t = useT()

  async function handleFileSelected(f: File) {
    setFile(f)
    try {
      const buffer = await f.arrayBuffer()
      const result = parseVendorBExcel(buffer)

      setPreview({
        rates: result.rates,
        services: result.services,
        gateways: result.gateways,
      })
      toast.info(`解析完成：${result.services.length} 個服務選項、${result.rates.length} 筆報價`)
    } catch (err) {
      toast.error(`${t.common.failed}：${err instanceof Error ? err.message : t.common.error}`)
    }
  }

  async function handleImport() {
    if (!preview) return
    setSaving(true)
    try {
      const apiRates = preview.rates

      const res = await fetch(`/api/vendors/${vendor.id}/b-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates: apiRates }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success(`已匯入 ${preview.rates.length} 筆報價`)
      onImported()
    } catch (err) {
      toast.error(`${t.common.importFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.common.import} {t.vendorPanels.bRate.title} — {vendor.name}</DialogTitle>
        </DialogHeader>

        {!preview ? (
          <ExcelDropZone onFile={handleFileSelected} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              服務：<strong>{preview.services.join('、')}</strong> |
              口岸：<strong>{preview.gateways.join('、')}</strong> |
              共 <strong>{preview.rates.length}</strong> 筆
            </p>
            <div className="overflow-x-auto rounded-md border max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{t.vendorPanels.bRate.serviceName}</TableHead>
                    <TableHead>{t.vendorPanels.bRate.gateway}</TableHead>
                    <TableHead>{t.vendorPanels.bRate.airline}</TableHead>
                    <TableHead>{t.vendorPanels.bRate.weightTier}</TableHead>
                    <TableHead>{t.vendorPanels.bRate.ratePerKg}</TableHead>
                    <TableHead>{t.common.currency}</TableHead>
                    <TableHead>{t.vendorPanels.bRate.flightsPerWeek}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rates.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{r.service_name}</TableCell>
                      <TableCell>{r.gateway_code}</TableCell>
                      <TableCell>{r.airline || '—'}</TableCell>
                      <TableCell>{r.weight_tier_min_kg}+</TableCell>
                      <TableCell className="font-mono">{r.rate_per_kg}</TableCell>
                      <TableCell>{r.currency}</TableCell>
                      <TableCell>{r.flights_per_week}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t.common.cancel}</Button>
          {preview && (
            <Button onClick={handleImport} disabled={saving}>
              {saving ? t.common.importing : `${t.common.confirm} ${t.common.import} ${preview.rates.length} ${t.common.records}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
