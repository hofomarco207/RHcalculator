'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WeightPoint } from '@/types'
import { WEIGHT_BRACKETS } from '@/types'
import { useCountry } from '@/lib/context/country-context'
import { Loader2 } from 'lucide-react'

interface Preset {
  id: string
  name: string
  brackets: WeightPoint[]
  is_default: boolean
}

interface BracketEditorProps {
  brackets: WeightPoint[]
  onChange: (brackets: WeightPoint[]) => void
}

export function BracketEditor({ brackets, onChange }: BracketEditorProps) {
  const { country } = useCountry()
  const [newMin, setNewMin] = useState('')
  const [newMax, setNewMax] = useState('')
  const [newRep, setNewRep] = useState('')

  // Preset state
  const [presets, setPresets] = useState<Preset[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState<string>('')
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSave, setShowSave] = useState(false)

  // Load presets for country
  const fetchPresets = useCallback(async () => {
    try {
      const res = await fetch(`/api/weight-bracket-presets?country=${country}`)
      if (res.ok) setPresets(await res.json())
    } catch { /* non-fatal */ }
  }, [country])

  useEffect(() => {
    fetchPresets()
    setSelectedPresetId('')
  }, [fetchPresets])

  function addBracket() {
    const min = parseFloat(newMin)
    const max = parseFloat(newMax)
    const rep = parseFloat(newRep) || max
    if (isNaN(min) || isNaN(max) || min >= max) return
    if (rep < min || rep > max) return

    const updated = [
      ...brackets,
      { range: `${min}<W≤${max}`, min, max, representative: rep },
    ].sort((a, b) => a.min - b.min)

    onChange(updated)
    setSelectedPresetId('')
    setNewMin(String(max))
    setNewMax('')
    setNewRep('')
  }

  function removeBracket(index: number) {
    onChange(brackets.filter((_, i) => i !== index))
    setSelectedPresetId('')
  }

  function resetToDefault() {
    onChange([...WEIGHT_BRACKETS])
    setSelectedPresetId('')
  }

  function loadPreset(presetId: string) {
    if (presetId === '__default__') {
      resetToDefault()
      setSelectedPresetId(presetId)
      return
    }
    const preset = presets.find((p) => p.id === presetId)
    if (preset) {
      onChange(preset.brackets)
      setSelectedPresetId(presetId)
    }
  }

  async function handleSave() {
    if (!saveName.trim() || brackets.length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/weight-bracket-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveName.trim(),
          country_code: country,
          brackets,
        }),
      })
      if (res.ok) {
        const created = await res.json()
        await fetchPresets()
        setSelectedPresetId(created.id)
        setSaveName('')
        setShowSave(false)
      }
    } catch { /* non-fatal */ }
    setSaving(false)
  }

  async function handleOverwrite() {
    if (!selectedPresetId || selectedPresetId === '__default__') return
    setSaving(true)
    try {
      await fetch(`/api/weight-bracket-presets/${selectedPresetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brackets }),
      })
      await fetchPresets()
    } catch { /* non-fatal */ }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selectedPresetId || selectedPresetId === '__default__') return
    try {
      await fetch(`/api/weight-bracket-presets/${selectedPresetId}`, { method: 'DELETE' })
      await fetchPresets()
      resetToDefault()
    } catch { /* non-fatal */ }
  }

  return (
    <div className="space-y-3">
      {/* Header: label + preset selector */}
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
          重量區間
        </Label>
        <div className="flex items-center gap-1.5 flex-1 justify-end">
          <Select value={selectedPresetId} onValueChange={loadPreset}>
            <SelectTrigger className="h-7 text-xs w-40">
              <SelectValue placeholder="載入配置…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">系統預設</SelectItem>
              {presets.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{p.is_default ? ' ★' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Save / overwrite / delete actions */}
          {selectedPresetId && selectedPresetId !== '__default__' && (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleOverwrite} disabled={saving}>
                覆寫
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={handleDelete}>
                刪除
              </Button>
            </>
          )}

          {!showSave ? (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowSave(true)}>
              另存新配置
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="配置名稱"
                className="h-7 text-xs w-28"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving || !saveName.trim()}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : '存'}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowSave(false); setSaveName('') }}>
                取消
              </Button>
            </div>
          )}
        </div>
      </div>

      {brackets.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Min KG</TableHead>
              <TableHead className="text-xs">Max KG</TableHead>
              <TableHead className="text-xs">代表重量</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brackets.map((b, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-xs py-1">{b.min}</TableCell>
                <TableCell className="font-mono text-xs py-1">{b.max}</TableCell>
                <TableCell className="font-mono text-xs py-1">{b.representative}</TableCell>
                <TableCell className="py-1">
                  <button
                    onClick={() => removeBracket(i)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="grid grid-cols-4 gap-2 items-end">
        <div className="space-y-0.5">
          <Label className="text-[10px]">Min KG</Label>
          <Input
            type="number"
            step="0.01"
            value={newMin}
            onChange={(e) => setNewMin(e.target.value)}
            placeholder="0"
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px]">Max KG</Label>
          <Input
            type="number"
            step="0.01"
            value={newMax}
            onChange={(e) => setNewMax(e.target.value)}
            placeholder="0.5"
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px]">代表重量</Label>
          <Input
            type="number"
            step="0.01"
            value={newRep}
            onChange={(e) => setNewRep(e.target.value)}
            placeholder="= Max"
            className="h-7 text-xs"
          />
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addBracket}>
          新增
        </Button>
      </div>
    </div>
  )
}
