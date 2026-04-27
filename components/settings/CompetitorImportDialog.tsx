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
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { YuntuProductSheet } from '@/lib/excel/competitor-importer'

interface CompetitorImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: YuntuProductSheet[]
  competitorName: string
  sourceFile: string
  /**
   * Map of existing vendor_label per service_code from the current versions
   * already in the DB (so that re-importing v2 pre-fills the label the user
   * customized on v1). If missing, defaults to `${competitorName} - ${service_code}`.
   */
  existingLabels?: Record<string, string | null>
  onImported: () => void
}

/**
 * Preview + per-sheet naming dialog for Yuntu competitor imports.
 *
 * For every product sheet the user can:
 *   - toggle whether to import it
 *   - customize the display label (vendor_label) — per sheet, as requested
 */
type PriceTier = 'A' | 'C'

function stripTierSuffix(label: string | null | undefined): string {
  if (!label) return ''
  return label.replace(/-[AC]價$/, '')
}

export function CompetitorImportDialog({
  open,
  onOpenChange,
  products,
  competitorName,
  sourceFile,
  existingLabels,
  onImported,
}: CompetitorImportDialogProps) {
  // Yuntu publishes two price sheets per product: A價 (retail) and C價
  // (wholesale). The versioning key is (competitor_name, service_code,
  // country_code), so we suffix service_code with -A / -C to keep the two
  // tiers as independent cards that version independently.
  const [tier, setTier] = useState<PriceTier>('C')
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    products.reduce<Record<string, boolean>>((acc, p) => {
      acc[p.service_code] = true
      return acc
    }, {}),
  )
  // Label inputs store the BASE name (no -A價/-C價 suffix). On submit we
  // append the suffix for the chosen tier so the displayed label always
  // matches the stored tier.
  const [labels, setLabels] = useState<Record<string, string>>(() =>
    products.reduce<Record<string, string>>((acc, p) => {
      const suffixed = existingLabels?.[`${p.service_code}-${tier}`]
      acc[p.service_code] = stripTierSuffix(suffixed) || `${competitorName} - ${p.service_code}`
      return acc
    }, {}),
  )
  const [importing, setImporting] = useState(false)

  function handleTierChange(next: PriceTier) {
    setTier(next)
    // Refresh label defaults from whichever tier's existing cards we have.
    setLabels(
      products.reduce<Record<string, string>>((acc, p) => {
        const suffixed = existingLabels?.[`${p.service_code}-${next}`]
        acc[p.service_code] = stripTierSuffix(suffixed) || `${competitorName} - ${p.service_code}`
        return acc
      }, {}),
    )
  }

  async function handleImport() {
    const selectedProducts = products.filter((p) => selected[p.service_code])
    if (selectedProducts.length === 0) {
      toast.error('請至少選一個產品匯入')
      return
    }

    const tierSuffixCode = `-${tier}`
    const tierSuffixLabel = `-${tier}價`

    const cards = selectedProducts.flatMap((p) =>
      p.cards.map((c) => ({
        ...c,
        service_code: `${c.service_code}${tierSuffixCode}`,
        vendor_label: `${labels[p.service_code] || `${competitorName} - ${p.service_code}`}${tierSuffixLabel}`,
      })),
    )

    setImporting(true)
    try {
      const res = await fetch('/api/competitor-rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards, source_file: sourceFile }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || '匯入失敗')
        return
      }
      const result = await res.json()
      toast.success(`已匯入 ${result.imported} 筆（${selectedProducts.length} 個產品）`)
      onImported()
      onOpenChange(false)
    } catch (err) {
      toast.error(`匯入失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    } finally {
      setImporting(false)
    }
  }

  function toggleAll(v: boolean) {
    setSelected(
      products.reduce<Record<string, boolean>>((acc, p) => {
        acc[p.service_code] = v
        return acc
      }, {}),
    )
  }

  const allSelected = products.every((p) => selected[p.service_code])
  const noneSelected = products.every((p) => !selected[p.service_code])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-[720px] w-[720px] sm:!max-w-[720px] !p-0 !gap-0"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '85vh',
          maxHeight: '85vh',
          overflow: 'hidden',
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle>匯入預覽 — {competitorName}</DialogTitle>
          <p className="text-xs text-muted-foreground font-mono truncate">
            {sourceFile}
          </p>
        </DialogHeader>

        <div
          className="px-6 py-3 space-y-3"
          style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}
        >
          <div className="rounded-md border bg-muted/40 px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-medium">價格類型</span>
              <div className="inline-flex rounded-md border bg-background overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-1 text-xs font-medium transition ${
                    tier === 'C'
                      ? 'bg-blue-600 text-white'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  onClick={() => handleTierChange('C')}
                >
                  C價（批發）
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 text-xs font-medium transition ${
                    tier === 'A'
                      ? 'bg-blue-600 text-white'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  onClick={() => handleTierChange('A')}
                >
                  A價（零售）
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A/C 價會存成獨立價卡，顯示名稱自動加上「-{tier}價」後綴，可在戰價時並排比較。
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              className="underline text-blue-600 hover:text-blue-700"
              onClick={() => toggleAll(!allSelected || noneSelected)}
            >
              {allSelected ? '全部取消' : '全部勾選'}
            </button>
            <span className="text-muted-foreground">
              偵測到 {products.length} 個產品 sheet
            </span>
          </div>

          <div className="space-y-2">
            {products.map((p) => {
              const checked = !!selected[p.service_code]
              const totalBrackets = p.cards.reduce((s, c) => s + c.brackets.length, 0)
              const inheritedLabel = existingLabels?.[`${p.service_code}-${tier}`]
              return (
                <div
                  key={p.service_code}
                  className="rounded-md border p-3 space-y-2 bg-card"
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setSelected((prev) => ({ ...prev, [p.service_code]: !!v }))
                      }
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-medium text-sm">{p.product_name_zh}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {p.service_code}-{tier}
                        </span>
                        {p.effective_date && (
                          <span className="text-[11px] text-muted-foreground">
                            生效 {p.effective_date}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {p.cards.length} 國 · {totalBrackets} 重量段
                      </div>
                    </div>
                  </div>
                  {checked && (
                    <div className="pl-7 space-y-1">
                      <label className="text-[11px] text-muted-foreground">
                        顯示名稱{inheritedLabel && (
                          <span className="ml-1 text-emerald-700">（沿用舊版）</span>
                        )}
                        <span className="ml-1 text-muted-foreground/70">
                          → 儲存為「{labels[p.service_code] || `${competitorName} - ${p.service_code}`}-{tier}價」
                        </span>
                      </label>
                      <Input
                        type="text"
                        value={labels[p.service_code] ?? ''}
                        onChange={(e) =>
                          setLabels((prev) => ({ ...prev, [p.service_code]: e.target.value }))
                        }
                        placeholder={`${competitorName} - ${p.service_code}`}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter className="gap-2 px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={importing}>
            {importing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            匯入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
