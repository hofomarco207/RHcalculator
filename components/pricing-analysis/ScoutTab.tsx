'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
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
import { useCountry } from '@/lib/context/country-context'
import { getMarginColorClass } from '@/lib/utils/margin'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ScoutResult, ScoutCombination, PriceUnit } from '@/types/pricing-analysis'
import { useT } from '@/lib/i18n'

type PricingMode = 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c'

export function ScoutTab() {
  const { country, pricingMode: countryPricingMode } = useCountry()
  const t = useT()

  const [price, setPrice] = useState('')
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('per_ticket')
  const [weight, setWeight] = useState('')
  const [minMargin, setMinMargin] = useState('15')
  const [selectedMode, setSelectedMode] = useState<PricingMode>(countryPricingMode as PricingMode)

  const [result, setResult] = useState<ScoutResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [savingIdx, setSavingIdx] = useState<number | null>(null)

  async function handleSearch() {
    const p = parseFloat(price)
    const w = parseFloat(weight)
    const mm = parseFloat(minMargin) / 100
    if (!p || !w) return

    setLoading(true)
    setError('')
    setResult(null)
    setExpandedIdx(null)

    try {
      const res = await fetch('/api/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: p,
          price_unit: priceUnit,
          representative_weight: w,
          country_code: country,
          min_margin: mm,
          pricing_mode: selectedMode,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || t.common.operationFailed)
        return
      }
      setResult(await res.json())
    } catch {
      setError(t.common.error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveAsScenario(combo: ScoutCombination, idx: number) {
    setSavingIdx(idx)
    try {
      const isBC = selectedMode === 'bc_combined'
      const isMultiB = selectedMode === 'multi_b'
      const isMultiBB2C = selectedMode === 'multi_b_b2c'

      // Build name
      let nameParts = [combo.vendors.a.name]
      if (isMultiB) {
        nameParts.push(`B1:${combo.vendors.b?.name}`, `B2:${combo.vendors.b2?.name}`)
      } else if (isMultiBB2C) {
        nameParts.push(`B1:${combo.vendors.b?.name}`, `B2C:${combo.vendors.b2c?.name}`)
      } else if (isBC) {
        nameParts.push(combo.vendors.bc?.name ?? '')
      } else {
        nameParts.push(combo.vendors.b?.name ?? '')
      }
      nameParts.push(combo.vendors.d.name)

      const scenarioBody: Record<string, unknown> = {
        name: `Scout: ${nameParts.join('/')}`,
        country_code: country,
        pricing_mode: selectedMode,
        seg_a: { pickup_hkd_per_kg: 0, sorting_hkd_per_kg: 0, include_sorting: false },
        vendor_a_id: combo.vendors.a.id || undefined,
        vendor_d_id: combo.vendors.d.id,
        b_gateway_mode: 'manual',
        b_bubble_rate: 1.1,
      }

      if (isMultiB) {
        scenarioBody.vendor_b_id = combo.vendors.b?.id
        scenarioBody.vendor_b2_id = combo.vendors.b2?.id
        scenarioBody.vendor_c_id = combo.vendors.c?.id
      } else if (isMultiBB2C) {
        scenarioBody.vendor_b_id = combo.vendors.b?.id
        scenarioBody.vendor_b2_id = combo.vendors.b2c?.id  // B2C vendor goes to vendor_b2_id
      } else if (isBC) {
        scenarioBody.vendor_bc_id = combo.vendors.bc?.id
      } else {
        scenarioBody.vendor_b_id = combo.vendors.b?.id
        scenarioBody.vendor_c_id = combo.vendors.c?.id
      }

      const res = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scenarioBody),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || t.common.saveFailed)
        return
      }
      toast.success(t.common.success)
    } catch {
      toast.error(t.common.error)
    } finally {
      setSavingIdx(null)
    }
  }

  const canSearch = !!price && !!weight && !loading
  const isMultiB = selectedMode === 'multi_b'
  const isMultiBB2C = selectedMode === 'multi_b_b2c'
  const isBCCombined = selectedMode === 'bc_combined'

  return (
    <div className="space-y-6">
      {/* Input form */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">{t.pricingAnalysis.evaluate.price} (HKD)</Label>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="例: 35.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.pricingAnalysis.evaluate.priceUnit}</Label>
              <Select value={priceUnit} onValueChange={(v) => setPriceUnit(v as PriceUnit)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_ticket">{t.pricingAnalysis.evaluate.perTicket}</SelectItem>
                  <SelectItem value="per_kg">{t.pricingAnalysis.evaluate.perKg}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.pricingAnalysis.evaluate.representativeWeight} (KG)</Label>
              <Input
                type="number"
                step="0.01"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="例: 0.3"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.pricingAnalysis.scout.minMargin} (%)</Label>
              <Input
                type="number"
                step="1"
                value={minMargin}
                onChange={(e) => setMinMargin(e.target.value)}
                placeholder="15"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t.pricingModes.pricingMode}</Label>
              <Select value={selectedMode} onValueChange={(v) => setSelectedMode(v as PricingMode)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['segmented', 'bc_combined', 'bcd_combined', 'multi_b', 'multi_b_b2c'] as PricingMode[]).map((k) => (
                    <SelectItem key={k} value={k}>{t.pricingModes[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1" />
            <Button onClick={handleSearch} disabled={!canSearch} className="self-end">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.pricingAnalysis.scout.searchCombinations}
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t.pricingAnalysis.scout.totalChecked} {result.total_combinations_checked} {t.pricingAnalysis.scout.combinations}，
              {t.pricingAnalysis.scout.feasibleFound} <strong>{result.feasible_combinations.length}</strong>
            </p>
          </div>

          {result.feasible_combinations.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground text-sm py-12">
                {t.pricingAnalysis.scout.noCombinations}
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-8">#</TableHead>
                  <TableHead className="text-xs">{t.segments.a}</TableHead>
                  {isMultiB ? (
                    <>
                      <TableHead className="text-xs">{t.segments.b1}</TableHead>
                      <TableHead className="text-xs">{t.segments.b2}</TableHead>
                      <TableHead className="text-xs">{t.segments.c}</TableHead>
                    </>
                  ) : isMultiBB2C ? (
                    <>
                      <TableHead className="text-xs">{t.segments.b1}</TableHead>
                      <TableHead className="text-xs">{t.segments.b2c}</TableHead>
                    </>
                  ) : isBCCombined ? (
                    <TableHead className="text-xs">{t.segments.bc}</TableHead>
                  ) : (
                    <>
                      <TableHead className="text-xs">{t.segments.b}</TableHead>
                      <TableHead className="text-xs">{t.segments.c}</TableHead>
                    </>
                  )}
                  <TableHead className="text-xs">{t.segments.d}</TableHead>
                  <TableHead className="text-xs text-center">{t.common.cost}</TableHead>
                  <TableHead className="text-xs text-center">{t.common.margin}</TableHead>
                  <TableHead className="text-xs w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.feasible_combinations.map((combo, i) => (
                  <ComboRow
                    key={i}
                    combo={combo}
                    index={i}
                    pricingMode={selectedMode}
                    expanded={expandedIdx === i}
                    onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
                    onSave={() => handleSaveAsScenario(combo, i)}
                    saving={savingIdx === i}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  )
}

function ComboRow({
  combo,
  index,
  pricingMode,
  expanded,
  onToggle,
  onSave,
  saving,
}: {
  combo: ScoutCombination
  index: number
  pricingMode: PricingMode
  expanded: boolean
  onToggle: () => void
  onSave: () => void
  saving: boolean
}) {
  const t = useT()
  const marginColor = getMarginColorClass(combo.margin)
  const bd = combo.segment_breakdown
  const isMultiB = pricingMode === 'multi_b'
  const isMultiBB2C = pricingMode === 'multi_b_b2c'
  const isBC = pricingMode === 'bc_combined'

  // colSpan for expanded row: # + A + middle cols + D + cost + margin + button
  const colSpan = isMultiB ? 9 : isMultiBB2C ? 8 : isBC ? 7 : 8

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        <TableCell className="text-xs font-mono py-1.5">{index + 1}</TableCell>
        <TableCell className="text-xs py-1.5">{combo.vendors.a.name}</TableCell>
        {isMultiB ? (
          <>
            <TableCell className="text-xs py-1.5">{combo.vendors.b?.name ?? '-'}</TableCell>
            <TableCell className="text-xs py-1.5">{combo.vendors.b2?.name ?? '-'}</TableCell>
            <TableCell className="text-xs py-1.5">{combo.vendors.c?.name ?? '-'}</TableCell>
          </>
        ) : isMultiBB2C ? (
          <>
            <TableCell className="text-xs py-1.5">{combo.vendors.b?.name ?? '-'}</TableCell>
            <TableCell className="text-xs py-1.5">{combo.vendors.b2c?.name ?? '-'}</TableCell>
          </>
        ) : isBC ? (
          <TableCell className="text-xs py-1.5">{combo.vendors.bc?.name ?? '-'}</TableCell>
        ) : (
          <>
            <TableCell className="text-xs py-1.5">{combo.vendors.b?.name ?? '-'}</TableCell>
            <TableCell className="text-xs py-1.5">{combo.vendors.c?.name ?? '-'}</TableCell>
          </>
        )}
        <TableCell className="text-xs py-1.5">{combo.vendors.d.name}</TableCell>
        <TableCell className="text-xs text-center font-mono py-1.5">
          {combo.cost.toFixed(2)}
        </TableCell>
        <TableCell className="text-xs text-center py-1.5">
          <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${marginColor}`}>
            {(combo.margin * 100).toFixed(1)}%
          </span>
        </TableCell>
        <TableCell className="py-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[11px]"
            onClick={(e) => { e.stopPropagation(); onSave() }}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : t.common.save}
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={colSpan} className="bg-muted/30 py-2 px-6">
            <div className="flex gap-6 text-xs flex-wrap">
              <span>{t.segments.a}: <strong className="font-mono">{bd.a.toFixed(2)}</strong></span>
              {isMultiB ? (
                <>
                  <span>{t.segments.b1}: <strong className="font-mono">{bd.b.toFixed(2)}</strong></span>
                  <span>{t.segments.b2}: <strong className="font-mono">{(bd.b2 ?? 0).toFixed(2)}</strong></span>
                  <span>{t.segments.c}: <strong className="font-mono">{bd.c.toFixed(2)}</strong></span>
                </>
              ) : isMultiBB2C ? (
                <>
                  <span>{t.segments.b1}: <strong className="font-mono">{bd.b.toFixed(2)}</strong></span>
                  <span>{t.segments.b2c}: <strong className="font-mono">{(bd.b2c ?? 0).toFixed(2)}</strong></span>
                </>
              ) : isBC ? (
                <span>{t.segments.bc}: <strong className="font-mono">{(bd.bc ?? 0).toFixed(2)}</strong></span>
              ) : (
                <>
                  <span>{t.segments.b}: <strong className="font-mono">{bd.b.toFixed(2)}</strong></span>
                  <span>{t.segments.c}: <strong className="font-mono">{bd.c.toFixed(2)}</strong></span>
                </>
              )}
              <span>{t.segments.d}: <strong className="font-mono">{bd.d.toFixed(2)}</strong></span>
              <span className="text-muted-foreground">
                {t.common.total}: <strong className="font-mono">{combo.cost.toFixed(2)}</strong> HKD
              </span>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
