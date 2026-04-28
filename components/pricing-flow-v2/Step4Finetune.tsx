'use client'

import { useState, useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { RotateCcw } from 'lucide-react'
import type { DraftCard, DraftCountryBrackets, DraftBracket } from '@/types/pricing-flow'
import { fmtPct, marginColorClass } from './utils'

interface Props {
  draft: DraftCard
  onChange: (draft: DraftCard) => void
}

const VERIFY_WEIGHTS = [
  0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30,
]

const ALL_COUNTRIES = '__ALL__'

export function Step4Finetune({ draft, onChange }: Props) {
  const [selectedCountry, setSelectedCountry] = useState(ALL_COUNTRIES)

  const countryOptions = useMemo(() => {
    return draft.country_brackets
      .map((cb) => ({
        code: cb.country_code,
        label: cb.country_name_zh || cb.country_name_en,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-TW'))
  }, [draft.country_brackets])

  const currentCb = selectedCountry !== ALL_COUNTRIES
    ? draft.country_brackets.find((cb) => cb.country_code === selectedCountry) ?? null
    : null

  function updateBracket(countryCode: string, bracketIdx: number, field: 'rate_per_kg' | 'reg_fee', value: number) {
    const updated = draft.country_brackets.map((cb) => {
      if (cb.country_code !== countryCode) return cb
      const brackets = cb.brackets.map((b, i) =>
        i === bracketIdx ? { ...b, [field]: Math.max(0, value) } : b,
      )
      return { ...cb, brackets }
    })
    onChange({ ...draft, country_brackets: updated })
  }

  // Update rate_per_kg from a % input relative to original_rate_per_kg
  function updateBracketByPct(countryCode: string, bracketIdx: number, pct: number) {
    const cb = draft.country_brackets.find((c) => c.country_code === countryCode)
    const b = cb?.brackets[bracketIdx]
    if (!b) return
    const base = b.original_rate_per_kg ?? b.rate_per_kg
    const newRate = Math.round(base * (1 + pct / 100) * 100) / 100
    updateBracket(countryCode, bracketIdx, 'rate_per_kg', Math.max(0, newRate))
  }

  function resetBracket(countryCode: string, bracketIdx: number) {
    const updated = draft.country_brackets.map((cb) => {
      if (cb.country_code !== countryCode) return cb
      const brackets = cb.brackets.map((b, i) => {
        if (i !== bracketIdx) return b
        const originalRate = b.original_rate_per_kg ?? (
          b.cost_twd != null
            ? Math.round((b.cost_twd / b.representative_weight) * 100) / 100
            : b.rate_per_kg
        )
        return { ...b, rate_per_kg: originalRate, reg_fee: 0 }
      })
      return { ...cb, brackets }
    })
    onChange({ ...draft, country_brackets: updated })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">第 4 步：驗算與微調</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          逐國調整各重量段的運費率及掛號費，右側即時驗算每個重量的報價與毛利
        </p>
      </div>

      {/* Country selector */}
      <div className="flex items-center gap-3">
        <Label className="text-xs shrink-0">選擇國家</Label>
        <Select value={selectedCountry} onValueChange={setSelectedCountry}>
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_COUNTRIES}>全部國家（所有區間一覽）</SelectItem>
            {countryOptions.map((c) => (
              <SelectItem key={c.code} value={c.code}>{c.label} ({c.code})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {draft.country_brackets.length} 個國家
        </span>
      </div>

      {selectedCountry === ALL_COUNTRIES ? (
        <AllCountriesTable
          draft={draft}
          onUpdate={updateBracket}
          onUpdatePct={updateBracketByPct}
          onReset={resetBracket}
        />
      ) : currentCb ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <CountryEditor
            cb={currentCb}
            onUpdate={updateBracket}
            onUpdatePct={updateBracketByPct}
            onReset={resetBracket}
          />
          <WeightVerifyPanel cb={currentCb} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">找不到該國家的資料</p>
      )}
    </div>
  )
}

// ─── All countries table ──────────────────────────────────────────────────────

function AllCountriesTable({
  draft,
  onUpdate,
  onUpdatePct,
  onReset,
}: {
  draft: DraftCard
  onUpdate: (code: string, idx: number, field: 'rate_per_kg' | 'reg_fee', val: number) => void
  onUpdatePct: (code: string, idx: number, pct: number) => void
  onReset: (code: string, idx: number) => void
}) {
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null)
  const hasCost = draft.country_brackets.some((cb) => cb.brackets.some((b) => b.cost_twd != null))

  return (
    <div className="border rounded-lg overflow-auto max-h-[70vh]">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background z-10">國家</TableHead>
            <TableHead>重量段</TableHead>
            <TableHead className="text-right">運費率 (TWD/kg)</TableHead>
            <TableHead className="text-right">掛號費 (TWD)</TableHead>
            <TableHead className="text-right">漲/跌 %</TableHead>
            {hasCost && <TableHead className="text-right">毛利</TableHead>}
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {draft.country_brackets.map((cb) => {
            const isExpanded = expandedCountry === cb.country_code
            const cbHasCost = cb.brackets.some((b) => b.cost_twd != null)
            return (
              <>
                {/* Country header row */}
                <TableRow
                  key={`hdr-${cb.country_code}`}
                  className="bg-muted/30 cursor-pointer hover:bg-muted/50"
                  onClick={() => setExpandedCountry(isExpanded ? null : cb.country_code)}
                >
                  <TableCell colSpan={hasCost ? 7 : 6} className="font-medium py-2">
                    <span className="flex items-center gap-2">
                      <span>{cb.country_name_zh || cb.country_name_en}</span>
                      <Badge variant="outline" className="text-[9px]">{cb.country_code}</Badge>
                      <span className="text-muted-foreground text-[10px]">{cb.brackets.length} 段</span>
                      <span className="ml-auto text-muted-foreground">{isExpanded ? '▲' : '▼'}</span>
                    </span>
                  </TableCell>
                </TableRow>
                {/* Bracket rows */}
                {isExpanded && cb.brackets.map((b, i) => {
                  const baseRate = b.original_rate_per_kg ?? b.rate_per_kg
                  const pctChange = baseRate > 0 ? (b.rate_per_kg - baseRate) / baseRate * 100 : 0
                  const price = b.rate_per_kg * b.representative_weight + b.reg_fee
                  const margin = cbHasCost && b.cost_twd != null && price > 0
                    ? (price - b.cost_twd) / price
                    : null
                  return (
                    <TableRow key={`${cb.country_code}-${i}`}>
                      <TableCell className="sticky left-0 bg-background" />
                      <TableCell className="font-mono">{b.label}</TableCell>
                      <TableCell className="text-right">
                        <NumInput
                          value={b.rate_per_kg}
                          onChange={(v) => onUpdate(cb.country_code, i, 'rate_per_kg', v)}
                          step={1}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <NumInput
                          value={b.reg_fee}
                          onChange={(v) => onUpdate(cb.country_code, i, 'reg_fee', v)}
                          step={1}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <PctInput
                          value={pctChange}
                          onChange={(pct) => onUpdatePct(cb.country_code, i, pct)}
                        />
                      </TableCell>
                      {hasCost && (
                        <TableCell className={`text-right font-mono ${margin != null ? marginColorClass(margin) : ''}`}>
                          {margin != null ? fmtPct(margin) : '—'}
                        </TableCell>
                      )}
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onReset(cb.country_code, i)}>
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ─── Single country editor ────────────────────────────────────────────────────

function CountryEditor({
  cb,
  onUpdate,
  onUpdatePct,
  onReset,
}: {
  cb: DraftCountryBrackets
  onUpdate: (code: string, idx: number, field: 'rate_per_kg' | 'reg_fee', val: number) => void
  onUpdatePct: (code: string, idx: number, pct: number) => void
  onReset: (code: string, idx: number) => void
}) {
  const hasCost = cb.brackets.some((b) => b.cost_twd != null)
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        {cb.country_name_zh || cb.country_name_en}
        <Badge variant="outline" className="ml-2 text-[10px]">{cb.country_code}</Badge>
      </p>
      <div className="border rounded-lg overflow-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>重量段</TableHead>
              <TableHead className="text-right">運費率 (TWD/kg)</TableHead>
              <TableHead className="text-right">掛號費 (TWD)</TableHead>
              <TableHead className="text-right">漲/跌 %</TableHead>
              {hasCost && <TableHead className="text-right">毛利</TableHead>}
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cb.brackets.map((b, i) => {
              const baseRate = b.original_rate_per_kg ?? b.rate_per_kg
              const pctChange = baseRate > 0 ? (b.rate_per_kg - baseRate) / baseRate * 100 : 0
              const price = b.rate_per_kg * b.representative_weight + b.reg_fee
              const margin = b.cost_twd != null && price > 0 ? (price - b.cost_twd) / price : null
              return (
                <TableRow key={i}>
                  <TableCell className="font-mono">{b.label}</TableCell>
                  <TableCell className="text-right">
                    <NumInput
                      value={b.rate_per_kg}
                      onChange={(v) => onUpdate(cb.country_code, i, 'rate_per_kg', v)}
                      step={0.1}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <NumInput
                      value={b.reg_fee}
                      onChange={(v) => onUpdate(cb.country_code, i, 'reg_fee', v)}
                      step={1}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <PctInput
                      value={pctChange}
                      onChange={(pct) => onUpdatePct(cb.country_code, i, pct)}
                    />
                  </TableCell>
                  {hasCost && (
                    <TableCell className={`text-right font-mono ${margin != null ? marginColorClass(margin) : ''}`}>
                      {margin != null ? fmtPct(margin) : '—'}
                    </TableCell>
                  )}
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onReset(cb.country_code, i)}>
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ─── Weight verification panel ────────────────────────────────────────────────

function WeightVerifyPanel({ cb }: { cb: DraftCountryBrackets }) {
  const hasCost = cb.brackets.some((b) => b.cost_twd != null)

  const verifyRows = useMemo(() => {
    const lastMax = cb.brackets[cb.brackets.length - 1]?.weight_max ?? Infinity
    return VERIFY_WEIGHTS
      .filter((w) => w <= lastMax)
      .map((w) => {
        const bracket = cb.brackets.find((b) => w > b.weight_min && w <= b.weight_max)
          ?? (w <= (cb.brackets[0]?.weight_min ?? 0) ? cb.brackets[0] : null)
        if (!bracket) return null
        const price = bracket.rate_per_kg * w + bracket.reg_fee
        const costAtW = bracket.cost_twd != null
          ? bracket.cost_twd * (w / bracket.representative_weight)
          : null
        const margin = costAtW != null && price > 0 ? (price - costAtW) / price : null
        return { weight: w, price, cost: costAtW, margin, bracket: bracket.label }
      })
      .filter(Boolean) as Array<{ weight: number; price: number; cost: number | null; margin: number | null; bracket: string }>
  }, [cb])

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">重量驗算表</p>
      <div className="border rounded-lg overflow-auto max-h-[60vh]">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>重量 (kg)</TableHead>
              <TableHead>所在區間</TableHead>
              <TableHead className="text-right">報價 (TWD)</TableHead>
              {hasCost && <TableHead className="text-right">估算成本</TableHead>}
              {hasCost && <TableHead className="text-right">毛利</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {verifyRows.map((row) => (
              <TableRow key={row.weight}>
                <TableCell className="font-mono">{row.weight}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-[10px]">{row.bracket}</TableCell>
                <TableCell className="text-right font-mono">{Math.round(row.price)}</TableCell>
                {hasCost && (
                  <TableCell className="text-right font-mono text-blue-600">
                    {row.cost != null ? Math.round(row.cost) : '—'}
                  </TableCell>
                )}
                {hasCost && (
                  <TableCell className={`text-right font-mono ${row.margin != null ? marginColorClass(row.margin) : ''}`}>
                    {row.margin != null ? fmtPct(row.margin) : '—'}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ─── Number inputs ────────────────────────────────────────────────────────────

function NumInput({
  value, onChange, step,
}: { value: number; onChange: (v: number) => void; step: number }) {
  return (
    <Input
      type="number"
      value={value}
      min={0}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="h-6 w-24 text-right text-xs py-0 px-1.5 inline-flex"
    />
  )
}

// Allows negative values for down-pricing
function PctInput({
  value, onChange,
}: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5">
      <Input
        type="number"
        value={parseFloat(value.toFixed(2))}
        step={0.1}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-6 w-20 text-right text-xs py-0 px-1.5 inline-flex"
      />
      <span className="text-[10px] text-muted-foreground">%</span>
    </div>
  )
}
