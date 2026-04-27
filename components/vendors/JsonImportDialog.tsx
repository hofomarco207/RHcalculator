'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

interface JsonImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendorId: string
  segment: 'A' | 'B' | 'C' | 'D'
  onImportSuccess: () => void
}

const SEGMENT_LABELS: Record<string, string> = {
  A: 'A段 攬收',
  B: 'B段 空運',
  C: 'C段 清關',
  D: 'D段 尾程',
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  records: Record<string, unknown>[]
}

function validateSegmentA(items: unknown[]): string[] {
  const errors: string[] = []
  items.forEach((item, i) => {
    const obj = item as Record<string, unknown>
    if (obj.pickup_hkd_per_kg === undefined || obj.pickup_hkd_per_kg === null) {
      errors.push(`第 ${i + 1} 筆：缺少 pickup_hkd_per_kg`)
    }
    if (obj.sorting_hkd_per_kg === undefined || obj.sorting_hkd_per_kg === null) {
      errors.push(`第 ${i + 1} 筆：缺少 sorting_hkd_per_kg`)
    }
  })
  return errors
}

function validateSegmentB(items: unknown[]): string[] {
  const errors: string[] = []
  items.forEach((item, i) => {
    const obj = item as Record<string, unknown>
    if (!obj.gateway_code) errors.push(`第 ${i + 1} 筆：缺少 gateway_code`)
    if (obj.rate_per_kg === undefined || obj.rate_per_kg === null) {
      errors.push(`第 ${i + 1} 筆：缺少 rate_per_kg`)
    }
    if (obj.weight_tier_min_kg === undefined || obj.weight_tier_min_kg === null) {
      errors.push(`第 ${i + 1} 筆：缺少 weight_tier_min_kg`)
    }
  })
  return errors
}

function validateSegmentC(items: unknown[]): string[] {
  const errors: string[] = []
  const validFeeTypes = ['per_mawb', 'per_kg', 'per_hawb']
  items.forEach((item, i) => {
    const obj = item as Record<string, unknown>
    if (!obj.fee_type) {
      errors.push(`第 ${i + 1} 筆：缺少 fee_type`)
    } else if (!validFeeTypes.includes(obj.fee_type as string)) {
      errors.push(`第 ${i + 1} 筆：fee_type 必須為 per_mawb、per_kg 或 per_hawb（目前為 "${obj.fee_type}"）`)
    }
    if (!obj.fee_name) errors.push(`第 ${i + 1} 筆：缺少 fee_name`)
    if (obj.amount === undefined || obj.amount === null) {
      errors.push(`第 ${i + 1} 筆：缺少 amount`)
    }
  })
  return errors
}

function validateSegmentD(items: unknown[]): string[] {
  const errors: string[] = []
  items.forEach((item, i) => {
    const obj = item as Record<string, unknown>
    if (!obj.carrier) errors.push(`第 ${i + 1} 筆：缺少 carrier`)
    if (obj.zone === undefined || obj.zone === null) {
      errors.push(`第 ${i + 1} 筆：缺少 zone`)
    }
    if (obj.weight_oz_min === undefined || obj.weight_oz_min === null) {
      errors.push(`第 ${i + 1} 筆：缺少 weight_oz_min`)
    }
    if (obj.weight_oz_max === undefined || obj.weight_oz_max === null) {
      errors.push(`第 ${i + 1} 筆：缺少 weight_oz_max`)
    }
    if (obj.price_usd === undefined || obj.price_usd === null) {
      errors.push(`第 ${i + 1} 筆：缺少 price_usd`)
    }
  })
  return errors
}

function validate(segment: 'A' | 'B' | 'C' | 'D', raw: string): ValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { valid: false, errors: ['JSON 格式錯誤，請確認語法正確'], records: [] }
  }

  if (!Array.isArray(parsed)) {
    return { valid: false, errors: ['JSON 必須為陣列（Array）格式'], records: [] }
  }

  if (parsed.length === 0) {
    return { valid: false, errors: ['陣列不能為空'], records: [] }
  }

  const items = parsed as unknown[]
  let fieldErrors: string[] = []

  switch (segment) {
    case 'A':
      fieldErrors = validateSegmentA(items)
      break
    case 'B':
      fieldErrors = validateSegmentB(items)
      break
    case 'C':
      fieldErrors = validateSegmentC(items)
      break
    case 'D':
      fieldErrors = validateSegmentD(items)
      break
  }

  // Show at most 5 errors to avoid flooding the UI
  const capped = fieldErrors.slice(0, 5)
  if (fieldErrors.length > 5) {
    capped.push(`... 還有 ${fieldErrors.length - 5} 個錯誤`)
  }

  return {
    valid: fieldErrors.length === 0,
    errors: capped,
    records: fieldErrors.length === 0 ? (items as Record<string, unknown>[]) : [],
  }
}

function getPreviewFields(segment: 'A' | 'B' | 'C' | 'D', record: Record<string, unknown>): string {
  switch (segment) {
    case 'A':
      return `攬收 ${record.pickup_hkd_per_kg} HKD/kg，分揀 ${record.sorting_hkd_per_kg} HKD/kg`
    case 'B':
      return `${record.gateway_code}，${record.weight_tier_min_kg}kg+，${record.rate_per_kg} ${record.currency ?? 'RMB'}/kg`
    case 'C':
      return `${record.fee_type}：${record.fee_name}，${record.amount} ${record.currency ?? 'USD'}`
    case 'D':
      return `${record.carrier} Zone ${record.zone}，${record.weight_oz_min}–${record.weight_oz_max} oz，$${record.price_usd}`
  }
}

export function JsonImportDialog({
  open,
  onOpenChange,
  vendorId,
  segment,
  onImportSuccess,
}: JsonImportDialogProps) {
  const [jsonText, setJsonText] = useState('')
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [importing, setImporting] = useState(false)

  function handleClear() {
    setJsonText('')
    setValidationResult(null)
  }

  function handleValidate() {
    const result = validate(segment, jsonText.trim())
    setValidationResult(result)
  }

  async function handleImport() {
    if (!validationResult?.valid || validationResult.records.length === 0) return

    setImporting(true)
    try {
      const res = await fetch(`/api/vendors/${vendorId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment, data: validationResult.records }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '匯入失敗')
      }

      const result = await res.json()
      toast.success(`已成功匯入 ${result.count} 筆 ${SEGMENT_LABELS[segment]} 資料`)
      onImportSuccess()
      onOpenChange(false)
      handleClear()
    } catch (err) {
      toast.error(`匯入失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    } finally {
      setImporting(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      handleClear()
    }
    onOpenChange(nextOpen)
  }

  const previewRecords = validationResult?.records.slice(0, 3) ?? []
  const totalCount = validationResult?.records.length ?? 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>JSON 匯入 — {SEGMENT_LABELS[segment]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                貼上 JSON 陣列資料（每個元素代表一筆費率）
              </p>
              {jsonText && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  清除
                </button>
              )}
            </div>
            <Textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                setValidationResult(null)
              }}
              placeholder={getPlaceholder(segment)}
              className="font-mono text-xs min-h-[220px] resize-y"
            />
          </div>

          {validationResult && (
            <div
              className={`rounded-md border p-3 text-sm space-y-2 ${
                validationResult.valid
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {validationResult.valid ? (
                <>
                  <p className="font-medium">驗證通過，共 {totalCount} 筆記錄</p>
                  {previewRecords.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium opacity-75">前 {previewRecords.length} 筆預覽：</p>
                      {previewRecords.map((r, i) => (
                        <p key={i} className="text-xs font-mono opacity-90">
                          {i + 1}. {getPreviewFields(segment, r)}
                        </p>
                      ))}
                      {totalCount > 3 && (
                        <p className="text-xs opacity-60">... 還有 {totalCount - 3} 筆</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="font-medium">驗證失敗</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {validationResult.errors.map((e, i) => (
                      <li key={i} className="text-xs">{e}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={importing}
          >
            取消
          </Button>
          <Button
            variant="secondary"
            onClick={handleValidate}
            disabled={!jsonText.trim() || importing}
          >
            驗證
          </Button>
          <Button
            onClick={handleImport}
            disabled={!validationResult?.valid || importing}
          >
            {importing ? '匯入中...' : `匯入 ${validationResult?.valid ? `(${totalCount} 筆)` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function getPlaceholder(segment: 'A' | 'B' | 'C' | 'D'): string {
  switch (segment) {
    case 'A':
      return `[
  {
    "pickup_hkd_per_kg": 1.5,
    "sorting_hkd_per_kg": 0.5,
    "include_sorting": true
  }
]`
    case 'B':
      return `[
  {
    "gateway_code": "LAX",
    "weight_tier_min_kg": 300,
    "rate_per_kg": 28.5,
    "currency": "RMB",
    "service_name": "廣州凱創"
  }
]`
    case 'C':
      return `[
  {
    "fee_type": "per_mawb",
    "fee_name": "清關費",
    "amount": 120,
    "currency": "USD"
  }
]`
    case 'D':
      return `[
  {
    "carrier": "USPS",
    "zone": 1,
    "weight_oz_min": 0,
    "weight_oz_max": 4,
    "price_usd": 4.5
  }
]`
  }
}
