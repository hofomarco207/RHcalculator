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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import type { VendorCRate, CFeeType } from '@/types/vendor'
import { RateVersionBar } from '@/components/vendors/RateVersionBar'

interface CRatePanelProps {
  vendor: Vendor
}

export function CRatePanel({ vendor }: CRatePanelProps) {
  const isSimple = vendor.config?.simple_rate === true
  const [quickInput, setQuickInput] = useState(false)

  if (isSimple || quickInput) {
    return <CRateSimplePanel vendor={vendor} onSwitchToFull={isSimple ? undefined : () => setQuickInput(false)} />
  }
  return <CRateFullPanel vendor={vendor} onSwitchToQuick={() => setQuickInput(true)} />
}

// ─── Simple Panel: single per-KG rate ──────────────────────────────────────

function CRateSimplePanel({ vendor, onSwitchToFull }: CRatePanelProps & { onSwitchToFull?: () => void }) {
  const t = useT()
  const [rate, setRate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [surcharge, setSurcharge] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [versionRefreshKey, setVersionRefreshKey] = useState(0)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/vendors/${vendor.id}/c-rates`)
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setRate(String(data[0].amount || ''))
          setCurrency(data[0].currency || 'USD')
          if (data[0].additional_surcharge) setSurcharge(String(data[0].additional_surcharge))
        }
      } catch (err) {
        console.error('Load C simple rate error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [vendor.id])

  async function handleSave() {
    const rateNum = parseFloat(rate)
    if (!rate || isNaN(rateNum) || rateNum <= 0) {
      toast.error(t.vendorPanels.cRate.perKg)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/c-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rates: [{
            fee_type: 'per_kg',
            fee_name: t.vendorPanels.bRate.simpleRateLabel,
            gateway_code: null,
            amount: rateNum,
            currency,
            additional_surcharge: surcharge ? parseFloat(surcharge) : 0,
          }],
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${t.vendorPanels.cRate.title} ${t.common.success}`)
      setVersionRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Card><CardContent className="py-6"><p className="text-sm text-muted-foreground">{t.common.loading}</p></CardContent></Card>

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{vendor.name} — {t.vendorPanels.cRate.title} ({t.vendorPanels.bRate.simpleRateLabel})</CardTitle>
          {onSwitchToFull && (
            <Button size="sm" variant="ghost" onClick={onSwitchToFull} className="text-xs h-7">
              {t.common.fullView}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <RateVersionBar vendorId={vendor.id} table="vendor_c_rates" refreshKey={versionRefreshKey} />
        <div className="flex items-end gap-3">
          <div className="space-y-1 flex-1 max-w-48">
            <Label className="text-xs">{t.vendorPanels.cRate.perKg}</Label>
            <Input
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1 w-24">
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
          <div className="space-y-1 w-28">
            <Label className="text-xs">{t.vendorPanels.bcRate.surcharge}</Label>
            <Input
              type="number"
              step="0.01"
              value={surcharge}
              onChange={(e) => setSurcharge(e.target.value)}
              placeholder="0"
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? t.common.saving : t.common.save}
          </Button>
        </div>
        {rate && parseFloat(rate) > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            成本 = {rate} {currency}/KG × 重量
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Full Panel: structured fee model ──────────────────────────────────────

function CRateFullPanel({ vendor, onSwitchToQuick }: CRatePanelProps & { onSwitchToQuick?: () => void }) {
  const t = useT()
  const FEE_TYPE_LABELS: Record<CFeeType, string> = {
    per_mawb: t.vendorPanels.cRate.perMawb,
    per_kg: t.vendorPanels.cRate.perKg,
    per_hawb: t.vendorPanels.cRate.perHawb,
  }
  const [rates, setRates] = useState<VendorCRate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [versionRefreshKey, setVersionRefreshKey] = useState(0)

  // New fee form
  const [newFeeType, setNewFeeType] = useState<CFeeType>('per_mawb')
  const [newFeeName, setNewFeeName] = useState('')
  const [newGateway, setNewGateway] = useState<string>('')
  const [newAmount, setNewAmount] = useState('')
  const [newCurrency, setNewCurrency] = useState('USD')
  const [newMinAmount, setNewMinAmount] = useState('')

  // Batch import
  const [showImport, setShowImport] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importPreview, setImportPreview] = useState<Partial<VendorCRate>[] | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const loadRates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/c-rates`)
      const data = await res.json()
      if (Array.isArray(data)) setRates(data)
    } catch (err) {
      console.error('Load C rates error:', err)
    } finally {
      setLoading(false)
    }
  }, [vendor.id])

  useEffect(() => { loadRates() }, [loadRates])

  async function handleAddFee() {
    if (!newFeeName.trim() || !newAmount) {
      toast.error(`${t.vendorPanels.cRate.feeName} / ${t.common.amount}`)
      return
    }

    const newRate: Partial<VendorCRate> = {
      fee_type: newFeeType,
      fee_name: newFeeName.trim(),
      gateway_code: newGateway || undefined,
      amount: parseFloat(newAmount),
      currency: newCurrency,
      min_amount: newMinAmount ? parseFloat(newMinAmount) : undefined,
    }

    // Save all existing + new
    const allRates = [...rates.map((r) => ({
      fee_type: r.fee_type,
      fee_name: r.fee_name,
      gateway_code: r.gateway_code,
      amount: r.amount,
      currency: r.currency,
      min_amount: r.min_amount,
    })), newRate]

    setSaving(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/c-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates: allRates }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(t.common.success)
      setShowAdd(false)
      setNewFeeName('')
      setNewAmount('')
      setNewMinAmount('')
      setVersionRefreshKey((k) => k + 1)
      loadRates()
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveFee(index: number) {
    const remaining = rates.filter((_, i) => i !== index).map((r) => ({
      fee_type: r.fee_type,
      fee_name: r.fee_name,
      gateway_code: r.gateway_code,
      amount: r.amount,
      currency: r.currency,
      min_amount: r.min_amount,
    }))

    setSaving(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/c-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates: remaining }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(t.common.success)
      setVersionRefreshKey((k) => k + 1)
      loadRates()
    } catch (err) {
      toast.error(`${t.common.saveFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
  }

  // Batch import handlers
  function parseImportJson(json: string) {
    setImportError(null)
    setImportPreview(null)
    if (!json.trim()) return

    try {
      const parsed = JSON.parse(json)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      const validTypes: CFeeType[] = ['per_mawb', 'per_kg', 'per_hawb']

      const validated: Partial<VendorCRate>[] = arr.map((item: Record<string, unknown>, i: number) => {
        if (!item.fee_type || !validTypes.includes(item.fee_type as CFeeType)) {
          throw new Error(`第 ${i + 1} 筆：fee_type 必須是 per_mawb / per_kg / per_hawb`)
        }
        if (!item.fee_name || typeof item.fee_name !== 'string') {
          throw new Error(`第 ${i + 1} 筆：缺少 fee_name`)
        }
        if (item.amount == null || isNaN(Number(item.amount))) {
          throw new Error(`第 ${i + 1} 筆：缺少有效的 amount`)
        }
        return {
          fee_type: item.fee_type as CFeeType,
          fee_name: String(item.fee_name),
          gateway_code: item.gateway_code ? String(item.gateway_code) : undefined,
          amount: Number(item.amount),
          currency: String(item.currency || 'USD'),
          min_amount: item.min_amount != null ? Number(item.min_amount) : undefined,
        }
      })

      setImportPreview(validated)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t.common.error)
    }
  }

  async function handleConfirmImport() {
    if (!importPreview || importPreview.length === 0) return

    // Merge with existing rates
    const existing = rates.map((r) => ({
      fee_type: r.fee_type, fee_name: r.fee_name,
      gateway_code: r.gateway_code, amount: r.amount,
      currency: r.currency, min_amount: r.min_amount,
    }))
    const allRates = [...existing, ...importPreview]

    setSaving(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/c-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates: allRates }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${t.common.import} ${importPreview.length} ${t.common.records} ${t.common.success}`)
      setShowImport(false)
      setImportJson('')
      setImportPreview(null)
      setVersionRefreshKey((k) => k + 1)
      loadRates()
    } catch (err) {
      toast.error(`${t.common.importFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
  }

  // Group by fee_type for display
  const grouped = (['per_mawb', 'per_kg', 'per_hawb'] as CFeeType[]).map((ft) => ({
    type: ft,
    label: FEE_TYPE_LABELS[ft],
    items: rates.filter((r) => r.fee_type === ft),
  })).filter((g) => g.items.length > 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{vendor.name} — {t.vendorPanels.cRate.title}</CardTitle>
          <div className="flex items-center gap-2">
            {onSwitchToQuick && (
              <Button size="sm" variant="ghost" onClick={onSwitchToQuick} className="text-xs h-7">
                {t.common.quickInput}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
              {t.common.import}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
              {showAdd ? t.common.cancel : t.common.add}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <RateVersionBar vendorId={vendor.id} table="vendor_c_rates" refreshKey={versionRefreshKey} />
        {loading ? (
          <p className="text-sm text-muted-foreground py-4">{t.common.loading}</p>
        ) : rates.length === 0 && !showAdd ? (
          <p className="text-sm text-muted-foreground py-4">{t.common.noData}</p>
        ) : (
          grouped.map((g) => (
            <div key={g.type}>
              <h4 className="text-sm font-medium mb-2">{g.label}</h4>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>{t.vendorPanels.cRate.feeName}</TableHead>
                      <TableHead className="w-24">{t.vendorPanels.bRate.gateway}</TableHead>
                      <TableHead className="w-28">{t.common.amount}</TableHead>
                      <TableHead className="w-20">{t.common.currency}</TableHead>
                      <TableHead className="w-28">MIN</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.items.map((r, i) => {
                      const globalIdx = rates.indexOf(r)
                      return (
                        <TableRow key={r.id || i}>
                          <TableCell>{r.fee_name}</TableCell>
                          <TableCell>{r.gateway_code || t.common.all}</TableCell>
                          <TableCell className="font-mono">{r.amount}</TableCell>
                          <TableCell>{r.currency}</TableCell>
                          <TableCell className="font-mono">
                            {r.min_amount != null ? r.min_amount : '—'}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-700 h-7 px-2"
                              onClick={() => handleRemoveFee(globalIdx)}
                              disabled={saving}
                            >
                              {t.common.delete}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}

        {showAdd && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
            <p className="text-sm font-medium">{t.common.add}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">{t.vendorPanels.cRate.feeType}</Label>
                <Select value={newFeeType} onValueChange={(v) => setNewFeeType(v as CFeeType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FEE_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.vendorPanels.cRate.feeName}</Label>
                <Input
                  value={newFeeName}
                  onChange={(e) => setNewFeeName(e.target.value)}
                  placeholder="例：清關費"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.vendorPanels.bRate.gateway}（{t.common.optional}）</Label>
                <Input
                  value={newGateway}
                  onChange={(e) => setNewGateway(e.target.value.toUpperCase())}
                  placeholder="LAX / JFK"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.common.amount}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.common.currency}</Label>
                <Select value={newCurrency} onValueChange={setNewCurrency}>
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
                <Label className="text-xs">MIN</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newMinAmount}
                  onChange={(e) => setNewMinAmount(e.target.value)}
                  placeholder={t.common.optional}
                />
              </div>
            </div>
            <Button size="sm" onClick={handleAddFee} disabled={saving}>
              {saving ? t.common.saving : t.common.confirm}
            </Button>
          </div>
        )}
      </CardContent>

      {/* Batch Import Dialog */}
      <Dialog open={showImport} onOpenChange={(open) => { if (!open) { setShowImport(false); setImportJson(''); setImportPreview(null); setImportError(null) } }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.common.import} {t.vendorPanels.cRate.title} — {vendor.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">JSON</Label>
              <textarea
                value={importJson}
                onChange={(e) => {
                  setImportJson(e.target.value)
                  parseImportJson(e.target.value)
                }}
                placeholder={`[\n  { "fee_type": "per_mawb", "fee_name": "提单文件费", "amount": 112.10, "currency": "USD" },\n  { "fee_type": "per_kg", "fee_name": "货站费用", "amount": 0.80, "currency": "USD" },\n  { "fee_type": "per_hawb", "fee_name": "清关服务费", "amount": 0.99, "currency": "USD" }\n]`}
                className="w-full h-40 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
              />
              <p className="text-[11px] text-muted-foreground">
                fee_type: per_mawb（按主單）/ per_kg（按公斤）/ per_hawb（按票件）。
                可選欄位：gateway_code、min_amount。
              </p>
            </div>

            {importError && (
              <p className="text-sm text-red-500">{importError}</p>
            )}

            {importPreview && importPreview.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">預覽（{importPreview.length} 筆）</p>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>{t.vendorPanels.cRate.feeType}</TableHead>
                        <TableHead>{t.vendorPanels.cRate.feeName}</TableHead>
                        <TableHead>{t.vendorPanels.bRate.gateway}</TableHead>
                        <TableHead>{t.common.amount}</TableHead>
                        <TableHead>{t.common.currency}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{FEE_TYPE_LABELS[r.fee_type!]}</TableCell>
                          <TableCell>{r.fee_name}</TableCell>
                          <TableCell>{r.gateway_code || t.common.all}</TableCell>
                          <TableCell className="font-mono">{r.amount}</TableCell>
                          <TableCell>{r.currency}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImport(false); setImportJson(''); setImportPreview(null); setImportError(null) }} disabled={saving}>
              {t.common.cancel}
            </Button>
            {importPreview && importPreview.length > 0 && (
              <Button onClick={handleConfirmImport} disabled={saving}>
                {saving ? t.common.importing : `${t.common.confirm} ${t.common.import} ${importPreview.length} ${t.common.records}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
