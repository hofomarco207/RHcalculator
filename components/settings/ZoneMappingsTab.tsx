'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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

// ─── Types ──────────────────────────────────────────────────────────────────

interface CountrySummary {
  country_code: string
  zone_count: number
  total_records: number
  distribution: Record<string, number>
  imported_at: string
}

interface SearchResult {
  province: string | null
  city: string | null
  postal_code: string | null
  zone: string
  risk_flag: string | null
}

interface ImportPreview {
  country_code: string
  total: number
  distribution: Record<string, number>
}

// ─── Distribution Bar ───────────────────────────────────────────────────────

const ZONE_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-purple-500', 'bg-cyan-500', 'bg-orange-500', 'bg-pink-500',
]

function DistributionBar({ distribution }: { distribution: Record<string, number> }) {
  const zones = Object.entries(distribution).sort((a, b) => a[0].localeCompare(b[0]))
  if (zones.length === 0) return <span className="text-gray-400 text-xs">—</span>

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-4 w-full rounded overflow-hidden">
        {zones.map(([zone, pct], i) => (
          <div
            key={zone}
            className={`${ZONE_COLORS[i % ZONE_COLORS.length]} transition-all`}
            style={{ width: `${pct * 100}%` }}
            title={`${zone}: ${(pct * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600">
        {zones.map(([zone, pct], i) => (
          <span key={zone} className="flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-sm ${ZONE_COLORS[i % ZONE_COLORS.length]}`} />
            {zone} {(pct * 100).toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Import Dialog ──────────────────────────────────────────────────────────

function ImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}) {
  const t = useT()
  const [jsonText, setJsonText] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setJsonText('')
    setPreview(null)
    setParseError(null)
  }

  function tryParse(text: string) {
    setJsonText(text)
    setParseError(null)
    setPreview(null)
    try {
      const obj = JSON.parse(text)

      // Format 1: { country_code, mappings: [...] }
      // Format 2: { meta: { country_code }, summary: { tier_distribution }, province_breakdown: [...] }
      const cc = obj.country_code ?? obj.meta?.country_code
      if (!cc) throw new Error('缺少 country_code（支援頂層或 meta.country_code）')

      if (Array.isArray(obj.mappings) && obj.mappings.length > 0) {
        // Format 1: flat mappings — zone/tier are aliases
        const mappings = obj.mappings as Array<Record<string, unknown>>
        const counts: Record<string, number> = {}
        for (const m of mappings) {
          const zone = (m.zone ?? m.tier) as string | undefined
          if (!zone) continue
          counts[zone] = (counts[zone] ?? 0) + 1
        }
        const total = mappings.length
        if (total === 0) throw new Error('mappings 為空')
        const dist: Record<string, number> = {}
        for (const [z, c] of Object.entries(counts)) dist[z] = Math.round((c / total) * 10000) / 10000
        setPreview({ country_code: cc, total, distribution: dist })
      } else if (Array.isArray(obj.province_breakdown) && obj.province_breakdown.length > 0) {
        // Format 2: province_breakdown — supports { tiers: { Tier1: N } } or flat { Tier1: N }
        const SKIP_KEYS = new Set(['province', 'high_risk_count', 'total', 'tiers'])
        const counts: Record<string, number> = {}
        let total = 0
        for (const pb of obj.province_breakdown) {
          // Nested tiers object
          if (pb.tiers && typeof pb.tiers === 'object') {
            for (const [zone, cnt] of Object.entries(pb.tiers)) {
              if (typeof cnt === 'number' && cnt > 0) {
                counts[zone] = (counts[zone] ?? 0) + cnt
                total += cnt
              }
            }
          }
          // Flat tier keys (e.g. { "Tier1": 17518, "Tier2": 2993 })
          for (const [key, val] of Object.entries(pb)) {
            if (!SKIP_KEYS.has(key) && typeof val === 'number' && val > 0) {
              counts[key] = (counts[key] ?? 0) + val
              total += val
            }
          }
        }
        if (total === 0) throw new Error('province_breakdown 無有效資料')
        const dist: Record<string, number> = {}
        for (const [z, c] of Object.entries(counts)) dist[z] = Math.round((c / total) * 10000) / 10000
        setPreview({ country_code: cc, total, distribution: dist })
      } else {
        throw new Error('需要 mappings 陣列或 province_breakdown')
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : t.common.failed)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => tryParse(reader.result as string)
      reader.readAsText(file)
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => tryParse(reader.result as string)
      reader.readAsText(file)
    }
  }

  async function handleImport() {
    if (!preview) return
    setImporting(true)
    try {
      const obj = JSON.parse(jsonText)
      const cc = obj.country_code ?? obj.meta?.country_code

      // If province_breakdown (small payload), send as-is
      if (!Array.isArray(obj.mappings) || obj.mappings.length <= 5000) {
        if (!obj.country_code && obj.meta?.country_code) obj.country_code = cc
        obj.replace = true
        const res = await fetch('/api/zone-mappings/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(obj),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? t.common.importFailed)
        }
        const result = await res.json()
        toast.success(`${cc}: ${result.inserted} ${t.common.records}, ${result.zone_count} zones`)
      } else {
        // Large mappings array — upload in chunks of 5000
        const mappings = obj.mappings as Array<Record<string, unknown>>
        const BATCH = 5000
        let totalInserted = 0
        for (let i = 0; i < mappings.length; i += BATCH) {
          const chunk = mappings.slice(i, i + BATCH)
          const res = await fetch('/api/zone-mappings/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              country_code: cc,
              replace: i === 0,   // only first chunk deletes old data
              mappings: chunk,
            }),
          })
          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error ?? `第 ${Math.floor(i / BATCH) + 1} 批匯入失敗`)
          }
          const result = await res.json()
          totalInserted += result.inserted
        }
        toast.success(`${cc}: ${totalInserted.toLocaleString()} ${t.common.records}, ${Object.keys(preview.distribution).length} zones`)
      }

      reset()
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.common.importFailed)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.settings.zoneMappings.importJson}</DialogTitle>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
            dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
          <p className="text-sm text-gray-500">
            拖放 JSON 檔案或點擊選取
          </p>
          <p className="text-xs text-gray-400 mt-1">
            格式：{'{ country_code, mappings: [{ province, city, postal_code, zone }] }'}
          </p>
        </div>

        {/* Or paste */}
        <div>
          <textarea
            className="w-full h-28 rounded-md border border-gray-300 p-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="或在此貼上 JSON..."
            value={jsonText}
            onChange={(e) => tryParse(e.target.value)}
          />
        </div>

        {parseError && (
          <p className="text-sm text-red-600">{parseError}</p>
        )}

        {preview && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline">{preview.country_code}</Badge>
              <span>{preview.total.toLocaleString()} {t.common.records}</span>
            </div>
            <DistributionBar distribution={preview.distribution} />
            <p className="text-xs text-amber-600">
              匯入將覆蓋 {preview.country_code} 的所有現有分區資料
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleImport} disabled={!preview || importing}>
            {importing ? t.common.importing : t.common.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Country Detail View ────────────────────────────────────────────────────

function CountryDetail({
  country,
  summary,
  onBack,
  onDelete,
}: {
  country: string
  summary: CountrySummary
  onBack: () => void
  onDelete: () => void
}) {
  const t = useT()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSearch() {
    if (searchQuery.trim().length < 2) {
      toast.error('搜索詞至少 2 個字元')
      return
    }
    setSearching(true)
    try {
      const res = await fetch(`/api/zone-mappings/${country}/search?q=${encodeURIComponent(searchQuery.trim())}`)
      if (!res.ok) throw new Error(t.common.operationFailed)
      const data = await res.json()
      setSearchResults(data)
    } catch {
      toast.error(t.common.operationFailed)
    } finally {
      setSearching(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`${t.common.delete} ${country}?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/zone-mappings/${country}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(t.common.deleteFailed)
      toast.success(`${t.common.success}`)
      onDelete()
    } catch {
      toast.error(t.common.deleteFailed)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>← {t.common.back}</Button>
          <h3 className="text-lg font-semibold">{country} {t.settings.zoneMappings.title}</h3>
          <Badge variant="secondary">{summary.total_records.toLocaleString()} {t.common.records}</Badge>
        </div>
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
          {deleting ? t.common.deleting : t.common.delete}
        </Button>
      </div>

      {/* Distribution chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t.settings.zoneMappings.distribution}</CardTitle>
        </CardHeader>
        <CardContent>
          <DistributionBar distribution={summary.distribution} />
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(summary.distribution)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([zone, pct]) => (
                <div key={zone} className="text-center p-2 rounded bg-gray-50">
                  <div className="text-sm font-medium">{zone}</div>
                  <div className="text-lg font-semibold">{(pct * 100).toFixed(1)}%</div>
                  <div className="text-xs text-gray-500">
                    {Math.round(pct * summary.total_records).toLocaleString()} {t.common.records}
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t.common.search}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder={t.settings.zoneMappings.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="max-w-sm"
            />
            <Button size="sm" onClick={handleSearch} disabled={searching}>
              {searching ? t.common.loading : t.common.search}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>省份</TableHead>
                  <TableHead>城市</TableHead>
                  <TableHead>郵遞區號</TableHead>
                  <TableHead>{t.settings.zoneMappings.title}</TableHead>
                  <TableHead>風險</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchResults.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-gray-500">{r.province || '—'}</TableCell>
                    <TableCell>{r.city || '—'}</TableCell>
                    <TableCell className="font-mono">{r.postal_code || '—'}</TableCell>
                    <TableCell><Badge variant="outline">{r.zone}</Badge></TableCell>
                    <TableCell>
                      {r.risk_flag
                        ? <Badge variant="destructive" className="text-xs">{r.risk_flag}</Badge>
                        : <span className="text-gray-400">—</span>
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {searchResults.length === 0 && searchQuery && !searching && (
            <p className="text-sm text-gray-500 py-2">{t.common.noData}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ZoneMappingsTab() {
  const t = useT()
  const [summaries, setSummaries] = useState<CountrySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)

  const loadSummaries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/zone-mappings')
      const data = await res.json()
      if (Array.isArray(data)) setSummaries(data)
    } catch (err) {
      console.error('Failed to load zone mappings:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSummaries() }, [loadSummaries])

  const selectedSummary = summaries.find((s) => s.country_code === selectedCountry)

  if (selectedCountry && selectedSummary) {
    return (
      <CountryDetail
        country={selectedCountry}
        summary={selectedSummary}
        onBack={() => setSelectedCountry(null)}
        onDelete={() => {
          setSelectedCountry(null)
          loadSummaries()
        }}
      />
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-base font-semibold">{t.settings.zoneMappings.title}</CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              管理城市→分區對照表，用於 D段首重/續重和重量段模型的加權計算
            </p>
          </div>
          <Button size="sm" onClick={() => setShowImport(true)}>{t.settings.zoneMappings.importJson}</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500 py-4 text-center">{t.common.loading}</p>
          ) : summaries.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">{t.settings.zoneMappings.noMappings}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">{t.common.country}</TableHead>
                  <TableHead className="w-20">{t.settings.zoneMappings.zoneCount}</TableHead>
                  <TableHead className="w-24">{t.settings.zoneMappings.totalRecords}</TableHead>
                  <TableHead>{t.settings.zoneMappings.distribution}</TableHead>
                  <TableHead className="w-36">{t.settings.zoneMappings.importDate}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((s) => (
                  <TableRow
                    key={s.country_code}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setSelectedCountry(s.country_code)}
                  >
                    <TableCell className="font-mono font-medium">{s.country_code}</TableCell>
                    <TableCell>{s.zone_count}</TableCell>
                    <TableCell>{s.total_records.toLocaleString()}</TableCell>
                    <TableCell>
                      <DistributionBar distribution={s.distribution} />
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {new Date(s.imported_at).toLocaleDateString('zh-TW')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        onSuccess={loadSummaries}
      />
    </>
  )
}
