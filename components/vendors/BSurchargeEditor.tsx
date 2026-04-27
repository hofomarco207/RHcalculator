'use client'

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
import { useT } from '@/lib/i18n'
import type { BSurcharge, BSurchargeUnit } from '@/types/vendor'

interface BSurchargeEditorProps {
  surcharges: BSurcharge[]
  onChange: (surcharges: BSurcharge[]) => void
  defaultCurrency?: string
}

const UNIT_OPTIONS: { value: BSurchargeUnit; label: string }[] = [
  { value: 'per_mawb', label: '每主單 (per MAWB)' },
  { value: 'per_kg', label: '每公斤 (per KG)' },
  { value: 'per_kg_with_min', label: '每公斤含最低 (per KG w/ MIN)' },
  { value: 'per_hawb', label: '每票 (per HAWB)' },
  { value: 'conditional', label: '條件收費' },
]

function emptySurcharge(currency: string): BSurcharge {
  return {
    name: '',
    unit: 'per_mawb',
    amount: null,
    rate: null,
    min: null,
    currency,
    condition: null,
    from_notes: false,
  }
}

export function BSurchargeEditor({ surcharges, onChange, defaultCurrency = 'RMB' }: BSurchargeEditorProps) {
  const t = useT()
  function addRow() {
    onChange([...surcharges, emptySurcharge(defaultCurrency)])
  }

  function removeRow(index: number) {
    onChange(surcharges.filter((_, i) => i !== index))
  }

  function updateRow(index: number, patch: Partial<BSurcharge>) {
    onChange(surcharges.map((s, i) => i === index ? { ...s, ...patch } : s))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">附加費項目</Label>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          + 新增附加費
        </Button>
      </div>

      {surcharges.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">
          尚無附加費項目。使用上方按鈕新增，或保持空白使用舊版6欄位。
        </p>
      )}

      {surcharges.map((s, i) => (
        <div key={i} className="rounded-md border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              移除
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* Name */}
            <div className="space-y-1">
              <Label className="text-xs">{t.vendorPanels.cRate.feeName}</Label>
              <Input
                value={s.name}
                onChange={(e) => updateRow(i, { name: e.target.value })}
                placeholder="如：提貨費"
                className="h-8 text-xs"
              />
            </div>

            {/* Unit type */}
            <div className="space-y-1">
              <Label className="text-xs">計費方式</Label>
              <Select value={s.unit} onValueChange={(v) => updateRow(i, { unit: v as BSurchargeUnit })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Currency */}
            <div className="space-y-1">
              <Label className="text-xs">{t.common.currency}</Label>
              <Select value={s.currency} onValueChange={(v) => updateRow(i, { currency: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RMB">RMB</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="HKD">HKD</SelectItem>
                  <SelectItem value="JPY">JPY</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dynamic fields based on unit type */}
          <div className="grid grid-cols-3 gap-2">
            {(s.unit === 'per_mawb' || s.unit === 'per_hawb') && (
              <div className="space-y-1">
                <Label className="text-xs">{t.common.amount}</Label>
                <Input
                  type="number" step="0.01"
                  value={s.amount ?? ''}
                  onChange={(e) => updateRow(i, { amount: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="0.00"
                  className="h-8 text-xs"
                />
              </div>
            )}

            {(s.unit === 'per_kg' || s.unit === 'per_kg_with_min') && (
              <div className="space-y-1">
                <Label className="text-xs">費率/KG</Label>
                <Input
                  type="number" step="0.01"
                  value={s.rate ?? ''}
                  onChange={(e) => updateRow(i, { rate: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="0.00"
                  className="h-8 text-xs"
                />
              </div>
            )}

            {s.unit === 'per_kg_with_min' && (
              <div className="space-y-1">
                <Label className="text-xs">最低收費</Label>
                <Input
                  type="number" step="0.01"
                  value={s.min ?? ''}
                  onChange={(e) => updateRow(i, { min: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="0.00"
                  className="h-8 text-xs"
                />
              </div>
            )}

            {s.unit === 'conditional' && (
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">觸發條件</Label>
                <Input
                  value={s.condition ?? ''}
                  onChange={(e) => updateRow(i, { condition: e.target.value || null })}
                  placeholder="如：含電池加收"
                  className="h-8 text-xs"
                />
              </div>
            )}

            {s.unit === 'conditional' && (
              <div className="space-y-1">
                <Label className="text-xs">{t.common.amount}</Label>
                <Input
                  type="number" step="0.01"
                  value={s.amount ?? ''}
                  onChange={(e) => updateRow(i, { amount: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="0.00"
                  className="h-8 text-xs"
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
