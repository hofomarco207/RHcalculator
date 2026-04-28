'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2 } from 'lucide-react'
import type { DraftCard, GlobalRateCard } from '@/types/pricing-flow'

interface Props {
  draft: DraftCard
  existingCards: GlobalRateCard[]
  onSaved: (cardId: string, version: number) => void
}

type OutputMode = 'new' | 'version'

export function Step6Output({ draft, existingCards, onSaved }: Props) {
  const [mode, setMode] = useState<OutputMode>('new')
  const [productName, setProductName] = useState(draft.product_name || '')
  const [productCode, setProductCode] = useState(draft.product_code || '')
  const [targetCardId, setTargetCardId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const handleSave = useCallback(async () => {
    if (saving || saved) return
    setError(null)

    if (!productName.trim()) {
      setError('請輸入產品名稱')
      return
    }
    if (mode === 'version' && !targetCardId) {
      setError('請選擇要更新版本的價卡')
      return
    }

    setSaving(true)
    try {
      // Determine product_code: new mode = user input; version mode = existing card's code
      let code = productCode.trim() || productName.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '').slice(0, 40)
      if (mode === 'version') {
        const target = existingCards.find((c) => c.id === targetCardId)
        if (target) code = target.product_code
      }

      const payload = {
        product_name: productName.trim(),
        product_code: code,
        source: 'manual',
        currency: 'TWD',
        fuel_surcharge_pct: 0,
        weight_step: 0,
        country_brackets: draft.country_brackets.map((cb) => ({
          country_code: cb.country_code,
          country_name_en: cb.country_name_en,
          country_name_zh: cb.country_name_zh ?? null,
          brackets: cb.brackets.map((b) => ({
            weight_min: b.weight_min,
            weight_max: b.weight_max,
            rate_per_kg: b.rate_per_kg,
            reg_fee: b.reg_fee,
            cost_hkd: null,
          })),
        })),
      }

      const res = await fetch('/api/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '儲存失敗')
      }

      const result = await res.json()
      setSaved(true)
      onSaved(result.id, result.version)
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }, [draft, productName, productCode, mode, targetCardId, existingCards, saving, saved, onSaved])

  const countryCount = draft.country_brackets.length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">第 6 步：輸出</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          儲存為系統價卡（{countryCount} 個國家）
        </p>
      </div>

      {saved ? (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">已成功儲存</p>
            <p className="text-xs text-green-600 mt-0.5">「{productName}」已寫入資料總覽</p>
          </div>
        </div>
      ) : (
        <div className="space-y-5 max-w-lg">
          {/* Output mode */}
          <div className="space-y-2">
            <Label className="text-sm">儲存方式</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as OutputMode)}>
              <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${mode === 'new' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                <RadioGroupItem value="new" />
                <div>
                  <p className="text-sm font-medium">成為新價卡</p>
                  <p className="text-xs text-muted-foreground">建立全新產品代碼</p>
                </div>
              </label>
              <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${mode === 'version' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                <RadioGroupItem value="version" />
                <div>
                  <p className="text-sm font-medium">作為新版本</p>
                  <p className="text-xs text-muted-foreground">覆蓋現有價卡，舊版自動封存</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* New card fields */}
          {mode === 'new' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">產品名稱</Label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="例如：全球專線服務"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">產品代碼（選填）</Label>
                <Input
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value.toUpperCase())}
                  placeholder="例如：HKTHZXR（留空自動生成）"
                  className="text-sm font-mono"
                />
              </div>
            </div>
          )}

          {/* Version of existing card */}
          {mode === 'version' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">選擇哪一張現行價卡</Label>
                <Select value={targetCardId} onValueChange={setTargetCardId}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="— 選擇現行價卡 —" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingCards.filter((c) => c.is_current).map((c) => (
                      <SelectItem key={c.id} value={c.id!}>
                        <div className="flex items-center gap-2">
                          <span>{c.product_name}</span>
                          <Badge variant="outline" className="text-[9px]">{c.product_code}</Badge>
                          <span className="text-muted-foreground text-[10px]">v{c.version}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">新版本名稱</Label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="例如：全球專線服務 2026-Q2"
                  className="text-sm"
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />儲存中…</> : '確認儲存'}
          </Button>
        </div>
      )}
    </div>
  )
}
