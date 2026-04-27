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
import { useCountry } from '@/lib/context/country-context'

interface VendorFormProps {
  defaultSegment: 'A' | 'B' | 'C' | 'D' | 'BC' | 'BCD'
  onClose: () => void
  onCreated: () => void
}

export function VendorForm({ defaultSegment, onClose, onCreated }: VendorFormProps) {
  const t = useT()
  const { country } = useCountry()

  const SEGMENT_LABELS: Record<string, string> = {
    A: t.segments.aFull,
    B: t.segments.bFull,
    C: t.segments.cFull,
    D: t.segments.dFull,
    BC: t.segments.bcFull,
    BCD: t.segments.bcdFull,
  }
  const [name, setName] = useState('')
  const [segment, setSegment] = useState<'A' | 'B' | 'C' | 'D' | 'BC' | 'BCD'>(defaultSegment)
  const [notes, setNotes] = useState('')
  const [simpleRate, setSimpleRate] = useState(false)
  const [perPiece, setPerPiece] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) {
      toast.error(t.pages.vendors.vendorName)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          segment,
          country_code: segment === 'A' ? 'GLB' : country,
          notes: notes.trim() || undefined,
          config: segment === 'D' && perPiece
            ? { per_piece: true }
            : ['B', 'C', 'D'].includes(segment) && simpleRate ? { simple_rate: true } : undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success(t.pages.vendors.vendorCreated)
      onCreated()
    } catch (err) {
      toast.error(`${t.pages.vendors.createFailed}：${err instanceof Error ? err.message : t.common.error}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.pages.vendors.addVendor}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t.pages.vendors.vendorName}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.pages.vendors.vendorNamePlaceholder}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.pages.vendors.segment}</Label>
            <Select value={segment} onValueChange={(v) => { setSegment(v as typeof segment); setSimpleRate(false); setPerPiece(false) }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SEGMENT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {['B', 'C', 'D'].includes(segment) && (
            <div className="flex items-center gap-2">
              <input
                id="simple-rate"
                type="checkbox"
                checked={simpleRate}
                onChange={(e) => { setSimpleRate(e.target.checked); if (e.target.checked) setPerPiece(false) }}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="simple-rate" className="cursor-pointer font-normal">
                {t.pages.vendors.simpleRate}
              </Label>
            </div>
          )}
          {segment === 'D' && (
            <div className="flex items-center gap-2">
              <input
                id="per-piece"
                type="checkbox"
                checked={perPiece}
                onChange={(e) => { setPerPiece(e.target.checked); if (e.target.checked) setSimpleRate(false) }}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="per-piece" className="cursor-pointer font-normal">
                {t.pages.vendors.perPiece ?? '按件計費（固定金額，不看重量）'}
              </Label>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t.common.notes}（{t.common.optional}）</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.pages.vendors.notesPlaceholder}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t.common.cancel}</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? t.common.saving : t.common.add}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
