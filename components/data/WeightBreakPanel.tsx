'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCountry } from '@/lib/context/country-context'
import { useT } from '@/lib/i18n'
import type { WeightBreakDataset } from '@/types/weight-break'

export function WeightBreakPanel() {
  const { country } = useCountry()
  const t = useT()
  const [datasets, setDatasets] = useState<WeightBreakDataset[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [label, setLabel] = useState('')
  const [period, setPeriod] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedEntries, setExpandedEntries] = useState<Array<{ weight_kg: number; order_count: number }>>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadDatasets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/weight-break?country_code=${country}`)
      const data = await res.json()
      if (Array.isArray(data)) setDatasets(data)
    } catch { /* non-fatal */ }
    setLoading(false)
  }, [country])

  useEffect(() => { loadDatasets() }, [loadDatasets])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!label.trim()) {
      toast.error(t.weightBreak.labelRequired)
      return
    }

    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const { parseWeightBreakExcel } = await import('@/lib/excel/weight-break-importer')
      const entries = parseWeightBreakExcel(buf)

      const res = await fetch('/api/weight-break', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country_code: country,
          label: label.trim(),
          period: period.trim() || null,
          entries,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || t.common.importFailed)
        return
      }

      const result = await res.json()
      toast.success(t.weightBreak.imported.replace('{n}', String(result.entries_count)))
      setLabel('')
      setPeriod('')
      loadDatasets()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.common.importFailed)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/weight-break/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setDatasets((prev) => prev.filter((d) => d.id !== id))
      if (expandedId === id) setExpandedId(null)
      toast.success(t.common.success)
    } catch {
      toast.error(t.common.deleteFailed)
    } finally {
      setDeletingId(null)
    }
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    try {
      const res = await fetch(`/api/weight-break/${id}`)
      const data = await res.json()
      setExpandedEntries(data.entries ?? [])
    } catch {
      setExpandedEntries([])
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{t.weightBreak.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload form */}
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">{t.weightBreak.datasetLabel}</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t.weightBreak.labelPlaceholder}
              className="h-8 text-sm w-48"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.weightBreak.period}</Label>
            <Input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2026-Q1"
              className="h-8 text-sm w-32"
            />
          </div>
          <div>
            <Label
              htmlFor="wb-upload"
              className={`cursor-pointer inline-flex items-center px-3 py-1.5 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent ${
                importing || !label.trim() ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              {importing ? (
                <><Loader2 className="h-3 w-3 animate-spin mr-1" />{t.common.importing}</>
              ) : (
                t.weightBreak.uploadExcel
              )}
            </Label>
            <input
              id="wb-upload"
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
              disabled={importing || !label.trim()}
            />
          </div>
        </div>

        {/* Datasets list */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> {t.common.loading}
          </div>
        ) : datasets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t.weightBreak.noDatasets}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t.weightBreak.datasetLabel}</TableHead>
                <TableHead className="text-xs">{t.weightBreak.period}</TableHead>
                <TableHead className="text-xs text-center">{t.weightBreak.totalOrders}</TableHead>
                <TableHead className="text-xs">{t.common.createdAt}</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.map((ds) => (
                <React.Fragment key={ds.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleExpand(ds.id)}
                  >
                    <TableCell className="text-xs">
                      <span className="inline-block w-4 text-muted-foreground">{expandedId === ds.id ? '▼' : '▶'}</span>
                      {ds.label}
                    </TableCell>
                    <TableCell className="text-xs">{ds.period || '-'}</TableCell>
                    <TableCell className="text-xs text-center font-mono">{ds.total_orders?.toLocaleString() ?? '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(ds.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-xs" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-red-500 hover:text-red-700"
                        onClick={() => handleDelete(ds.id)}
                        disabled={deletingId === ds.id}
                      >
                        {deletingId === ds.id ? t.common.deleting : t.common.delete}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedId === ds.id && (
                    <TableRow key={`${ds.id}-detail`}>
                      <TableCell colSpan={5} className="p-0 bg-muted/30">
                        <div className="px-6 py-3 max-h-48 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="text-[11px] py-1">{t.weightBreak.weightKg}</TableHead>
                                <TableHead className="text-[11px] py-1 text-center">{t.weightBreak.orderCount}</TableHead>
                                <TableHead className="text-[11px] py-1 text-center">{t.weightBreak.totalWeight}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {expandedEntries.map((e, i) => (
                                <TableRow key={i}>
                                  <TableCell className="text-xs py-0.5 font-mono">{e.weight_kg}</TableCell>
                                  <TableCell className="text-xs py-0.5 text-center font-mono">{e.order_count.toLocaleString()}</TableCell>
                                  <TableCell className="text-xs py-0.5 text-center font-mono">
                                    {(e.weight_kg * e.order_count).toFixed(1)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
