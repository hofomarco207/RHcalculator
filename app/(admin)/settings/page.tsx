'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { toast } from 'sonner'
import { useCountry } from '@/lib/context/country-context'
import { useT } from '@/lib/i18n'
import { CompetitorImportDialog } from '@/components/settings/CompetitorImportDialog'
import { CompetitorCompareDialog } from '@/components/settings/CompetitorCompareDialog'
import { COUNTRY_SEED, getCountryFlag } from '@/lib/data/country-seed'
import type { Country, Gateway, Carrier } from '@/types'
import type { YuntuProductSheet } from '@/lib/excel/competitor-importer'

// ─── Countries Tab ───────────────────────────────────────────────────────────

function CountriesTab() {
  const [countries, setCountries] = useState<Country[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingCountry, setEditingCountry] = useState<Country | null>(null)
  const [form, setForm] = useState({ code: '', name_zh: '', name_en: '', currency_code: 'USD', pricing_mode: 'segmented' as 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c' })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Country | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadCountries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/countries')
      const data = await res.json()
      if (Array.isArray(data)) setCountries(data)
    } catch (err) {
      console.error('Failed to load countries:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCountries() }, [loadCountries])

  function openCreate() {
    setEditingCountry(null)
    setForm({ code: '', name_zh: '', name_en: '', currency_code: 'USD', pricing_mode: 'segmented' })
    setShowDialog(true)
  }

  function openEdit(c: Country) {
    setEditingCountry(c)
    setForm({ code: c.code, name_zh: c.name_zh, name_en: c.name_en || '', currency_code: c.currency_code || 'USD', pricing_mode: c.pricing_mode || 'segmented' })
    setShowDialog(true)
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name_zh.trim()) {
      toast.error('代碼和中文名稱為必填')
      return
    }
    setSaving(true)
    try {
      if (editingCountry) {
        const res = await fetch(`/api/countries/${editingCountry.code}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name_zh: form.name_zh.trim(),
            name_en: form.name_en.trim() || null,
            currency_code: form.currency_code,
            pricing_mode: form.pricing_mode,
          }),
        })
        if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
        toast.success(`已更新國家「${form.name_zh.trim()}」`)
      } else {
        const res = await fetch('/api/countries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: form.code.trim().toUpperCase(),
            name_zh: form.name_zh.trim(),
            name_en: form.name_en.trim() || null,
            currency_code: form.currency_code,
            pricing_mode: form.pricing_mode,
          }),
        })
        if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
        toast.success(`已新增國家「${form.name_zh.trim()}」`)
      }
      setShowDialog(false)
      loadCountries()
    } catch (err) {
      toast.error(`儲存失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(c: Country) {
    try {
      const res = await fetch(`/api/countries/${c.code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !c.is_active }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      toast.success(`已${c.is_active ? '停用' : '啟用'}國家「${c.name_zh}」`)
      loadCountries()
    } catch (err) {
      toast.error(`操作失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/countries/${deleteTarget.code}`, { method: 'DELETE' })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      toast.success(`已刪除國家「${deleteTarget.name_zh}」及相關數據`)
      setDeleteTarget(null)
      loadCountries()
    } catch (err) {
      toast.error(`刪除失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-semibold">國家列表</CardTitle>
          <Button size="sm" onClick={openCreate}>新增國家</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500 py-4 text-center">載入中...</p>
          ) : countries.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">尚無國家資料</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">代碼</TableHead>
                  <TableHead>中文名稱</TableHead>
                  <TableHead>英文名稱</TableHead>
                  <TableHead className="w-24">定價模式</TableHead>
                  <TableHead className="w-20">狀態</TableHead>
                  <TableHead className="w-32 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {countries.map((c) => (
                  <TableRow key={c.code}>
                    <TableCell className="font-mono font-medium">{getCountryFlag(c.code)} {c.code}</TableCell>
                    <TableCell>{c.name_zh}</TableCell>
                    <TableCell className="text-gray-500">{c.name_en || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={c.pricing_mode === 'bc_combined' ? 'outline' : 'secondary'}>
                        {c.pricing_mode === 'bc_combined' ? 'BC合併' : '分段'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.is_active ? 'default' : 'secondary'}>
                        {c.is_active ? '啟用' : '停用'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                        編輯
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(c)}
                        className={c.is_active ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}
                      >
                        {c.is_active ? '停用' : '啟用'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(c)}
                        className="text-red-600 hover:text-red-700"
                      >
                        刪除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showDialog && (
        <Dialog open onOpenChange={(open) => !open && setShowDialog(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingCountry ? '編輯國家' : '新增國家'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {!editingCountry ? (
                <div className="space-y-1.5">
                  <Label>選擇國家</Label>
                  <Select
                    value={form.code}
                    onValueChange={(code) => {
                      const seed = COUNTRY_SEED.find((c) => c.code === code)
                      if (seed) {
                        setForm({ ...form, code: seed.code, name_zh: seed.name_zh, name_en: seed.name_en })
                      } else {
                        setForm({ ...form, code })
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="搜索或選擇國家..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {COUNTRY_SEED
                        .filter((c) => !countries.some((existing) => existing.code === c.code))
                        .map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.flag} {c.code} — {c.name_zh} ({c.name_en})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400">建立後不可修改代碼</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>國家代碼</Label>
                  <Input value={form.code} disabled />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>中文名稱</Label>
                <Input
                  value={form.name_zh}
                  onChange={(e) => setForm({ ...form, name_zh: e.target.value })}
                  placeholder="例：美國"
                  autoFocus={!!editingCountry}
                />
              </div>
              <div className="space-y-1.5">
                <Label>英文名稱（選填）</Label>
                <Input
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  placeholder="例：United States"
                />
              </div>
              <div className="space-y-1.5">
                <Label>幣種</Label>
                <Select value={form.currency_code} onValueChange={(v) => setForm({ ...form, currency_code: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="RMB">RMB</SelectItem>
                    <SelectItem value="HKD">HKD</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>定價模式</Label>
                <Select value={form.pricing_mode} onValueChange={(v) => setForm({ ...form, pricing_mode: v as 'segmented' | 'bc_combined' | 'bcd_combined' | 'multi_b' | 'multi_b_b2c' })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="segmented">分段定價 (A+B+C+D)</SelectItem>
                    <SelectItem value="bc_combined">BC合併定價 (A+BC+D)</SelectItem>
                    <SelectItem value="bcd_combined">BCD合併定價 (A+BCD)</SelectItem>
                    <SelectItem value="multi_b">多段空運 (A+B1+B2+C+D)</SelectItem>
                    <SelectItem value="multi_b_b2c">多段空運+包清 (A+B1+B2C+D)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>取消</Button>
              <Button onClick={handleSave} disabled={saving || !form.code.trim() || !form.name_zh.trim()}>
                {saving ? '儲存中...' : editingCountry ? '更新' : '新增'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <Dialog open onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>確認刪除國家</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>
                即將刪除國家 <strong>{getCountryFlag(deleteTarget.code)} {deleteTarget.name_zh}</strong>（{deleteTarget.code}）
              </p>
              <p className="text-muted-foreground">以下關聯數據將一併刪除：</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>所有成本方案</li>
                <li>所有已生成的價卡</li>
                <li>所有競對價卡</li>
                <li>Weight Break 數據</li>
                <li>口岸和承運商將被停用</li>
              </ul>
              <p className="text-orange-600 font-medium">此操作無法撤銷</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>取消</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? '刪除中...' : '確認刪除'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

// ─── Gateways Tab ────────────────────────────────────────────────────────────

function GatewaysTab() {
  const { country: defaultCountry, countries } = useCountry()
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry)
  const [gateways, setGateways] = useState<Gateway[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingGateway, setEditingGateway] = useState<Gateway | null>(null)
  const [form, setForm] = useState({ code: '', country_code: '', name_zh: '', name_en: '' })
  const [saving, setSaving] = useState(false)

  const loadGateways = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/gateways?country=${selectedCountry}`)
      const data = await res.json()
      if (Array.isArray(data)) setGateways(data)
    } catch (err) {
      console.error('Failed to load gateways:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedCountry])

  useEffect(() => { loadGateways() }, [loadGateways])

  function openCreate() {
    setEditingGateway(null)
    setForm({ code: '', country_code: selectedCountry, name_zh: '', name_en: '' })
    setShowDialog(true)
  }

  function openEdit(g: Gateway) {
    setEditingGateway(g)
    setForm({ code: g.code, country_code: g.country_code, name_zh: g.name_zh || '', name_en: g.name_en || '' })
    setShowDialog(true)
  }

  async function handleSave() {
    if (!form.code.trim() || !form.country_code) {
      toast.error('代碼和國家為必填')
      return
    }
    setSaving(true)
    try {
      if (editingGateway) {
        const res = await fetch(`/api/gateways/${editingGateway.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: form.code.trim().toUpperCase(),
            name_zh: form.name_zh.trim() || null,
            name_en: form.name_en.trim() || null,
          }),
        })
        if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
        toast.success(`已更新口岸「${form.code.trim().toUpperCase()}」`)
      } else {
        const res = await fetch('/api/gateways', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: form.code.trim().toUpperCase(),
            country_code: form.country_code,
            name_zh: form.name_zh.trim() || null,
            name_en: form.name_en.trim() || null,
          }),
        })
        if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
        toast.success(`已新增口岸「${form.code.trim().toUpperCase()}」`)
      }
      setShowDialog(false)
      loadGateways()
    } catch (err) {
      toast.error(`儲存失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(g: Gateway) {
    try {
      const res = await fetch(`/api/gateways/${g.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !g.is_active }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      toast.success(`已${g.is_active ? '停用' : '啟用'}口岸「${g.code}」`)
      loadGateways()
    } catch (err) {
      toast.error(`操作失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    }
  }

  async function deleteGateway(g: Gateway) {
    if (!confirm(`確定要永久刪除口岸「${g.code}」嗎？此操作無法復原。`)) return
    try {
      const res = await fetch(`/api/gateways/${g.id}`, { method: 'DELETE' })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      toast.success(`已刪除口岸「${g.code}」`)
      loadGateways()
    } catch (err) {
      toast.error(`刪除失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-4">
            <CardTitle className="text-base font-semibold">口岸列表</CardTitle>
            <Select value={selectedCountry} onValueChange={setSelectedCountry}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name_zh} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={openCreate}>新增口岸</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500 py-4 text-center">載入中...</p>
          ) : gateways.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">該國家尚無口岸資料</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">代碼</TableHead>
                  <TableHead className="w-20">國家</TableHead>
                  <TableHead>中文名稱</TableHead>
                  <TableHead>英文名稱</TableHead>
                  <TableHead className="w-20">狀態</TableHead>
                  <TableHead className="w-32 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gateways.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono font-medium">{g.code}</TableCell>
                    <TableCell className="font-mono">{g.country_code}</TableCell>
                    <TableCell>{g.name_zh || '-'}</TableCell>
                    <TableCell className="text-gray-500">{g.name_en || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={g.is_active ? 'default' : 'secondary'}>
                        {g.is_active ? '啟用' : '停用'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="outline" size="sm" onClick={() => openEdit(g)}>
                        編輯
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(g)}
                        className={g.is_active ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}
                      >
                        {g.is_active ? '停用' : '啟用'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteGateway(g)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        刪除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showDialog && (
        <Dialog open onOpenChange={(open) => !open && setShowDialog(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingGateway ? '編輯口岸' : '新增口岸'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>口岸代碼</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="例：LAX, JFK"
                  maxLength={5}
                  autoFocus
                />
                <p className="text-xs text-gray-400">3-5 字元，如 LAX、JFK、ORD</p>
              </div>
              {!editingGateway && (
                <div className="space-y-1.5">
                  <Label>所屬國家</Label>
                  <Select value={form.country_code} onValueChange={(v) => setForm({ ...form, country_code: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name_zh} ({c.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>中文名稱（選填）</Label>
                <Input
                  value={form.name_zh}
                  onChange={(e) => setForm({ ...form, name_zh: e.target.value })}
                  placeholder="例：洛杉磯"
                />
              </div>
              <div className="space-y-1.5">
                <Label>英文名稱（選填）</Label>
                <Input
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  placeholder="例：Los Angeles"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>取消</Button>
              <Button onClick={handleSave} disabled={saving || !form.code.trim()}>
                {saving ? '儲存中...' : editingGateway ? '更新' : '新增'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

// ─── Carriers Tab ────────────────────────────────────────────────────────────

function CarriersTab() {
  const { country: defaultCountry, countries } = useCountry()
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry)
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null)
  const [form, setForm] = useState({ code: '', country_code: '', name: '' })
  const [saving, setSaving] = useState(false)

  const loadCarriers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/carriers?country=${selectedCountry}`)
      const data = await res.json()
      if (Array.isArray(data)) setCarriers(data)
    } catch (err) {
      console.error('Failed to load carriers:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedCountry])

  useEffect(() => { loadCarriers() }, [loadCarriers])

  function openCreate() {
    setEditingCarrier(null)
    setForm({ code: '', country_code: selectedCountry, name: '' })
    setShowDialog(true)
  }

  function openEdit(c: Carrier) {
    setEditingCarrier(c)
    setForm({ code: c.code, country_code: c.country_code, name: c.name || '' })
    setShowDialog(true)
  }

  async function handleSave() {
    if (!form.code.trim() || !form.country_code) {
      toast.error('代碼和國家為必填')
      return
    }
    setSaving(true)
    try {
      if (editingCarrier) {
        const res = await fetch(`/api/carriers/${editingCarrier.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: form.code.trim().toUpperCase(),
            name: form.name.trim() || null,
          }),
        })
        if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
        toast.success(`已更新承運商「${form.code.trim().toUpperCase()}」`)
      } else {
        const res = await fetch('/api/carriers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: form.code.trim().toUpperCase(),
            country_code: form.country_code,
            name: form.name.trim() || null,
          }),
        })
        if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
        toast.success(`已新增承運商「${form.code.trim().toUpperCase()}」`)
      }
      setShowDialog(false)
      loadCarriers()
    } catch (err) {
      toast.error(`儲存失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(c: Carrier) {
    try {
      const res = await fetch(`/api/carriers/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !c.is_active }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      toast.success(`已${c.is_active ? '停用' : '啟用'}承運商「${c.code}」`)
      loadCarriers()
    } catch (err) {
      toast.error(`操作失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    }
  }

  async function deleteCarrier(c: Carrier) {
    if (!confirm(`確定要永久刪除承運商「${c.code}」嗎？此操作無法復原。`)) return
    try {
      const res = await fetch(`/api/carriers/${c.id}`, { method: 'DELETE' })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      toast.success(`已刪除承運商「${c.code}」`)
      loadCarriers()
    } catch (err) {
      toast.error(`刪除失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-4">
            <CardTitle className="text-base font-semibold">承運商列表</CardTitle>
            <Select value={selectedCountry} onValueChange={setSelectedCountry}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name_zh} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={openCreate}>新增承運商</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500 py-4 text-center">載入中...</p>
          ) : carriers.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">該國家尚無承運商資料</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">代碼</TableHead>
                  <TableHead className="w-20">國家</TableHead>
                  <TableHead>名稱</TableHead>
                  <TableHead className="w-20">狀態</TableHead>
                  <TableHead className="w-32 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carriers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-medium">{c.code}</TableCell>
                    <TableCell className="font-mono">{c.country_code}</TableCell>
                    <TableCell>{c.name || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={c.is_active ? 'default' : 'secondary'}>
                        {c.is_active ? '啟用' : '停用'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                        編輯
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(c)}
                        className={c.is_active ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}
                      >
                        {c.is_active ? '停用' : '啟用'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteCarrier(c)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        刪除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showDialog && (
        <Dialog open onOpenChange={(open) => !open && setShowDialog(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingCarrier ? '編輯承運商' : '新增承運商'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>承運商代碼</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="例：USPS, GOFO"
                  maxLength={10}
                  autoFocus
                />
              </div>
              {!editingCarrier && (
                <div className="space-y-1.5">
                  <Label>所屬國家</Label>
                  <Select value={form.country_code} onValueChange={(v) => setForm({ ...form, country_code: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name_zh} ({c.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>名稱（選填）</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例：United States Postal Service"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>取消</Button>
              <Button onClick={handleSave} disabled={saving || !form.code.trim()}>
                {saving ? '儲存中...' : editingCarrier ? '更新' : '新增'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

// ─── Competitor Rate Cards Tab ───────────────────────────────────────────────

interface CompetitorBracket {
  weight_range: string
  weight_min: number
  weight_max: number
  rate_per_kg: number
  reg_fee: number
}
interface CompetitorCard {
  id: string
  competitor_name: string
  service_code: string
  country_name_en: string
  country_name_zh: string
  country_code: string | null
  brackets: CompetitorBracket[]
  effective_date: string | null
  created_at: string
  updated_at: string
  fuel_surcharge_pct: number
  version?: number
  valid_from?: string | null
  valid_to?: string | null
  is_current?: boolean
  vendor_label?: string | null
  source_file?: string | null
  previous_brackets?: CompetitorBracket[] | null
  previous_version?: number | null
  previous_valid_from?: string | null
}

interface BracketChange {
  weight_range: string
  old_rate: number | null
  new_rate: number | null
  old_reg_fee: number | null
  new_reg_fee: number | null
}

function computeBracketChanges(
  current: CompetitorBracket[] | null | undefined,
  previous: CompetitorBracket[] | null | undefined,
): BracketChange[] {
  if (!previous || previous.length === 0) return []
  const curMap = new Map(current?.map((b) => [b.weight_range, b]) ?? [])
  const prevMap = new Map(previous.map((b) => [b.weight_range, b]))
  const allRanges = new Set<string>([...curMap.keys(), ...prevMap.keys()])
  const out: BracketChange[] = []
  for (const range of allRanges) {
    const cur = curMap.get(range)
    const prev = prevMap.get(range)
    const curRate = cur?.rate_per_kg ?? null
    const prevRate = prev?.rate_per_kg ?? null
    const curReg = cur?.reg_fee ?? null
    const prevReg = prev?.reg_fee ?? null
    if (curRate === prevRate && curReg === prevReg) continue
    out.push({
      weight_range: range,
      old_rate: prevRate,
      new_rate: curRate,
      old_reg_fee: prevReg,
      new_reg_fee: curReg,
    })
  }
  // Sort by weight_min if possible
  out.sort((a, b) => {
    const getMin = (r: string) => parseFloat(r.match(/^([0-9.]+)/)?.[1] ?? '0')
    return getMin(a.weight_range) - getMin(b.weight_range)
  })
  return out
}

// ─── Customers Tab ───────────────────────────────────────────────────────────

interface Customer {
  id: string
  name: string
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
  is_active: boolean
  created_at: string
}

function CustomersTab() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState({ name: '', contact_email: '', contact_phone: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/customers')
      const data = await res.json()
      if (Array.isArray(data)) setCustomers(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm({ name: '', contact_email: '', contact_phone: '', notes: '' })
    setShowDialog(true)
  }

  function openEdit(c: Customer) {
    setEditing(c)
    setForm({ name: c.name, contact_email: c.contact_email ?? '', contact_phone: c.contact_phone ?? '', notes: c.notes ?? '' })
    setShowDialog(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('名稱為必填'); return }
    setSaving(true)
    try {
      const body = { name: form.name.trim(), contact_email: form.contact_email || null, contact_phone: form.contact_phone || null, notes: form.notes || null }
      const res = editing
        ? await fetch(`/api/customers/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      toast.success(editing ? '已更新客戶' : '已新增客戶')
      setShowDialog(false)
      load()
    } catch (err) {
      toast.error(`儲存失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(c: Customer) {
    try {
      const res = await fetch(`/api/customers/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !c.is_active }) })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      toast.success(c.is_active ? '已停用客戶' : '已啟用客戶')
      load()
    } catch (err) {
      toast.error(`操作失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">客戶管理</CardTitle>
          <Button size="sm" onClick={openCreate}>新增客戶</Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">載入中...</p>
        ) : customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無客戶，請先新增。</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>聯絡信箱</TableHead>
                  <TableHead>聯絡電話</TableHead>
                  <TableHead>備註</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id} className={c.is_active ? '' : 'opacity-50'}>
                    <TableCell className="font-medium text-sm">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.contact_email ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.contact_phone ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{c.notes ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={c.is_active ? 'default' : 'secondary'} className="text-xs cursor-pointer" onClick={() => toggleActive(c)}>
                        {c.is_active ? '啟用' : '停用'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(c)}>編輯</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Create/Edit dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => { if (!o) setShowDialog(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? '編輯客戶' : '新增客戶'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>名稱 *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="客戶名稱" />
            </div>
            <div className="space-y-1">
              <Label>聯絡信箱</Label>
              <Input value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} placeholder="email@example.com" type="email" />
            </div>
            <div className="space-y-1">
              <Label>聯絡電話</Label>
              <Input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} placeholder="+886 ..." />
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="選填備註" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? '儲存中...' : '儲存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function CompetitorTab() {
  const t = useT()
  const [cards, setCards] = useState<CompetitorCard[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [savingFsc, setSavingFsc] = useState<string | null>(null)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [bracketSearch, setBracketSearch] = useState('')
  const [importPreview, setImportPreview] = useState<{
    products: YuntuProductSheet[]
    sourceFile: string
    competitorName: string
    existingLabels: Record<string, string | null>
  } | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [collapsedTiers, setCollapsedTiers] = useState<Record<string, boolean>>({})
  const [compareTarget, setCompareTarget] = useState<{
    competitor_name: string
    service_code: string
    label?: string
  } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null)
  const [editLabelDraft, setEditLabelDraft] = useState('')
  const [renaming, setRenaming] = useState(false)

  const loadCards = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/competitor-rate-cards?with_previous=1')
      const data = await res.json()
      if (Array.isArray(data)) setCards(data)
    } catch { /* non-fatal */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadCards() }, [loadCards])

  async function handleFscUpdate(cardId: string, newPct: number) {
    setSavingFsc(cardId)
    try {
      const res = await fetch(`/api/competitor-rate-cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fuel_surcharge_pct: newPct }),
      })
      if (!res.ok) throw new Error()
      setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, fuel_surcharge_pct: newPct } : c))
      toast.success('FSC % saved')
    } catch {
      toast.error('Failed to save FSC %')
    } finally {
      setSavingFsc(null)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, format: 'yuntu' | 'ecms') {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const buf = await file.arrayBuffer()

      if (format === 'yuntu') {
        // Scan all sheets, then hand off to preview dialog for per-sheet naming + selection.
        const { parseYuntuWorkbook } = await import('@/lib/excel/competitor-importer')
        const products = parseYuntuWorkbook(buf)
        if (products.length === 0) {
          toast.error('沒有偵測到任何產品 sheet')
          return
        }
        // Pre-fill labels from existing cards so users don't have to re-enter each version.
        const existingLabels: Record<string, string | null> = {}
        for (const c of cards) {
          if (c.competitor_name === '雲途' && c.vendor_label) {
            existingLabels[c.service_code] = c.vendor_label
          }
        }
        setImportPreview({
          products,
          sourceFile: file.name,
          competitorName: '雲途',
          existingLabels,
        })
      } else {
        // ECMS — single-shot import (legacy behaviour; one sheet per country)
        const { parseEcmsExcel } = await import('@/lib/excel/competitor-importer')
        const parsed = parseEcmsExcel(buf)
        if (parsed.length === 0) {
          toast.error('沒有解析到任何資料')
          return
        }
        const res = await fetch('/api/competitor-rate-cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cards: parsed, source_file: file.name }),
        })
        if (!res.ok) {
          const err = await res.json()
          toast.error(err.error || '匯入失敗')
          return
        }
        const result = await res.json()
        toast.success(`已匯入 ${result.imported} 筆 ECMS 競對價卡`)
        loadCards()
      }
    } catch (err) {
      toast.error(`解析失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  async function handleDeleteGroup(competitorName: string, serviceCode: string) {
    if (!confirm(`確定要刪除「${competitorName} - ${serviceCode}」的全部版本與國家資料嗎？此動作無法復原。`)) return
    setDeleting(`${competitorName}||${serviceCode}`)
    try {
      const qs = new URLSearchParams({ competitor_name: competitorName, service_code: serviceCode })
      const res = await fetch(`/api/competitor-rate-cards?${qs}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || '刪除失敗')
        return
      }
      toast.success(`已刪除 ${competitorName} - ${serviceCode}`)
      loadCards()
    } catch (err) {
      toast.error(`刪除失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    } finally {
      setDeleting(null)
    }
  }

  async function handleRenameGroup(competitorName: string, serviceCode: string, nextLabel: string) {
    const trimmed = nextLabel.trim()
    if (!trimmed) {
      toast.error('名稱不可為空')
      return
    }
    setRenaming(true)
    try {
      const qs = new URLSearchParams({ competitor_name: competitorName, service_code: serviceCode })
      const res = await fetch(`/api/competitor-rate-cards?${qs}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_label: trimmed }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || '更名失敗')
        return
      }
      setCards((prev) =>
        prev.map((c) =>
          c.competitor_name === competitorName && c.service_code === serviceCode
            ? { ...c, vendor_label: trimmed }
            : c,
        ),
      )
      toast.success('已更新顯示名稱')
      setEditingGroupKey(null)
    } catch (err) {
      toast.error(`更名失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    } finally {
      setRenaming(false)
    }
  }

  const grouped = cards.reduce<Record<string, CompetitorCard[]>>((acc, c) => {
    const key = `${c.competitor_name} - ${c.service_code}`
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  // Split groups by price tier (A價/C價) based on service_code suffix.
  // Non-Yuntu competitors (e.g. ECMS) have no tier suffix → bucket "其他".
  type TierKey = 'C' | 'A' | 'other'
  const TIER_META: Record<TierKey, { label: string; hint: string; color: string }> = {
    C: { label: 'C價（批發）', hint: '對內成本比較', color: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
    A: { label: 'A價（零售）', hint: '對外零售參考', color: 'bg-purple-50 text-purple-700 ring-purple-600/20' },
    other: { label: '其他', hint: '未標記 tier 的資料（如 ECMS）', color: 'bg-muted text-muted-foreground ring-border' },
  }
  const tierBuckets: Record<TierKey, Array<[string, CompetitorCard[]]>> = { C: [], A: [], other: [] }
  for (const entry of Object.entries(grouped)) {
    const sc = entry[1][0].service_code
    if (sc.endsWith('-C')) tierBuckets.C.push(entry)
    else if (sc.endsWith('-A')) tierBuckets.A.push(entry)
    else tierBuckets.other.push(entry)
  }

  // Determine the latest card per competitor+country for "Latest" badge
  const latestCardIds = new Set<string>()
  for (const group of Object.values(grouped)) {
    const byCountry = group.reduce<Record<string, CompetitorCard[]>>((acc, c) => {
      const ck = c.country_code || c.country_name_en
      if (!acc[ck]) acc[ck] = []
      acc[ck].push(c)
      return acc
    }, {})
    for (const countryCards of Object.values(byCountry)) {
      if (countryCards.length > 1) {
        const sorted = [...countryCards].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        latestCardIds.add(sorted[0].id)
      }
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base font-semibold">{t.settings.competitor.title}</CardTitle>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="competitor-upload-yuntu"
            className="cursor-pointer inline-flex items-center px-3 py-1.5 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent"
          >
            {importing ? t.common.importing : t.settings.competitor.importYuntu}
          </Label>
          <input
            id="competitor-upload-yuntu"
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => handleFileUpload(e, 'yuntu')}
            disabled={importing}
          />
          <Label
            htmlFor="competitor-upload-ecms"
            className="cursor-pointer inline-flex items-center px-3 py-1.5 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent"
          >
            {importing ? t.common.importing : t.settings.competitor.importEcms}
          </Label>
          <input
            id="competitor-upload-ecms"
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => handleFileUpload(e, 'ecms')}
            disabled={importing}
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">載入中...</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            {t.settings.competitor.noCards}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                className="underline text-blue-600 hover:text-blue-700"
                onClick={() => {
                  const keys = Object.keys(grouped)
                  const anyExpanded = keys.some((k) => !collapsedGroups[k])
                  const next: Record<string, boolean> = {}
                  for (const k of keys) next[k] = anyExpanded
                  setCollapsedGroups(next)
                }}
              >
                {Object.keys(grouped).some((k) => !collapsedGroups[k]) ? '全部摺疊' : '全部展開'}
              </button>
              <span className="text-muted-foreground">
                共 {Object.keys(grouped).length} 個產品組
              </span>
            </div>
            {(['C', 'A', 'other'] as TierKey[]).map((tierKey) => {
              const bucket = tierBuckets[tierKey]
              if (bucket.length === 0) return null
              const meta = TIER_META[tierKey]
              const tierCollapsed = !!collapsedTiers[tierKey]
              return (
                <div key={tierKey} className="space-y-2">
                  <div
                    className="flex items-center gap-2 cursor-pointer select-none"
                    onClick={() => setCollapsedTiers((prev) => ({ ...prev, [tierKey]: !prev[tierKey] }))}
                  >
                    <span className="text-muted-foreground text-xs w-3 inline-block">
                      {tierCollapsed ? '▶' : '▼'}
                    </span>
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {bucket.length} 個產品組 · {meta.hint}
                    </span>
                  </div>
                  {!tierCollapsed && (
                  <div className="space-y-3 pl-5">
                  {bucket.map(([key, group]) => {
              const first = group[0]
              const competitorName = first.competitor_name
              const serviceCode = first.service_code
              const displayLabel = first.vendor_label || key
              const version = first.version
              const importedAt = first.created_at ? first.created_at.slice(0, 10) : null
              const sourceFile = first.source_file
              const deleteKey = `${competitorName}||${serviceCode}`
              const isDeleting = deleting === deleteKey
              const isCollapsed = !!collapsedGroups[key]
              return (
              <div key={key} className="rounded-md border">
                <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 bg-muted/30">
                  <div
                    className="flex items-baseline gap-2 flex-wrap min-w-0 text-left cursor-pointer hover:opacity-80 select-none"
                    onClick={() => setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))}
                  >
                    <span className="text-muted-foreground text-xs w-3 inline-block">{isCollapsed ? '▶' : '▼'}</span>
                    {editingGroupKey === key ? (
                      <Input
                        type="text"
                        autoFocus
                        value={editLabelDraft}
                        onChange={(e) => setEditLabelDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') {
                            handleRenameGroup(competitorName, serviceCode, editLabelDraft)
                          } else if (e.key === 'Escape') {
                            setEditingGroupKey(null)
                          }
                        }}
                        onBlur={() => {
                          if (editLabelDraft.trim() && editLabelDraft.trim() !== displayLabel) {
                            handleRenameGroup(competitorName, serviceCode, editLabelDraft)
                          } else {
                            setEditingGroupKey(null)
                          }
                        }}
                        disabled={renaming}
                        className="h-7 text-sm w-60 px-2"
                      />
                    ) : (
                      <h4
                        className="text-sm font-medium border-b border-dashed border-transparent hover:border-muted-foreground/50 hover:text-blue-600"
                        title="點一下重新命名"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditLabelDraft(displayLabel)
                          setEditingGroupKey(key)
                        }}
                      >
                        {displayLabel}
                      </h4>
                    )}
                    <span className="font-mono text-[11px] text-muted-foreground">{serviceCode}</span>
                    {version != null && (
                      <span className="inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
                        v{version}
                        {importedAt && <span className="ml-1 text-blue-500/80">· 匯入 {importedAt}</span>}
                      </span>
                    )}
                    {sourceFile && (
                      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[260px]">
                        {sourceFile}
                      </span>
                    )}
                    <span className="text-muted-foreground text-xs">({group.length} 國家)</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setCompareTarget({
                        competitor_name: competitorName,
                        service_code: serviceCode,
                        label: displayLabel,
                      })}
                    >
                      比較版本
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteGroup(competitorName, serviceCode)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? '刪除中…' : '刪除'}
                    </Button>
                  </div>
                </div>
                {!isCollapsed && (
                <div className="px-3 pb-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t.common.country}</TableHead>
                      <TableHead className="text-xs">{t.common.code}</TableHead>
                      <TableHead className="text-xs">{t.settings.competitor.bracketCount}</TableHead>
                      <TableHead className="text-xs">FSC %</TableHead>
                      <TableHead className="text-xs">{t.settings?.competitor?.importedAt ?? t.common.updatedAt}</TableHead>
                      <TableHead className="text-xs">變更</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.map((c) => {
                      const isExpanded = expandedCardId === c.id
                      const filteredBrackets = bracketSearch && isExpanded
                        ? c.brackets.filter((b) => b.weight_range.toLowerCase().includes(bracketSearch.toLowerCase()))
                        : c.brackets
                      const changes = computeBracketChanges(c.brackets, c.previous_brackets)
                      return (
                        <React.Fragment key={c.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => {
                              setExpandedCardId(isExpanded ? null : c.id)
                              setBracketSearch('')
                            }}
                          >
                            <TableCell className="text-xs">
                              <span className="inline-block w-4 text-muted-foreground">{isExpanded ? '▼' : '▶'}</span>
                              {c.country_name_zh} ({c.country_name_en})
                            </TableCell>
                            <TableCell className="text-xs font-mono">{c.country_code || '-'}</TableCell>
                            <TableCell className="text-xs">{c.brackets.length} {t.common.brackets}</TableCell>
                            <TableCell className="text-xs" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="100"
                                  className="h-7 w-16 text-xs px-1.5"
                                  defaultValue={c.fuel_surcharge_pct ?? 0}
                                  onBlur={(e) => {
                                    const val = parseFloat(e.target.value) || 0
                                    if (val !== (c.fuel_surcharge_pct ?? 0)) {
                                      handleFscUpdate(c.id, val)
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      (e.target as HTMLInputElement).blur()
                                    }
                                  }}
                                  disabled={savingFsc === c.id}
                                />
                                <span className="text-muted-foreground">%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                {new Date(c.created_at).toLocaleDateString()}
                                {latestCardIds.has(c.id) && (
                                  <span className="inline-flex items-center rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                    {t.settings?.competitor?.latest ?? '最新'}
                                  </span>
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs" onClick={(e) => e.stopPropagation()}>
                              {changes.length > 0 ? (
                                <div className="group relative inline-block">
                                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/30 cursor-help">
                                    <span>🚩</span>
                                    {changes.length} 段變更
                                  </span>
                                  <div className="invisible group-hover:visible absolute z-50 right-0 top-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-lg p-3 min-w-[320px] text-xs space-y-1">
                                    <div className="font-medium border-b pb-1 mb-1">
                                      v{c.previous_version} → v{c.version} 變更
                                    </div>
                                    {changes.map((ch, i) => {
                                      const rateChanged = ch.old_rate !== ch.new_rate
                                      const regChanged = ch.old_reg_fee !== ch.new_reg_fee
                                      return (
                                        <div key={i} className="flex items-baseline justify-between gap-3">
                                          <span className="text-muted-foreground font-mono">{ch.weight_range}</span>
                                          <span className="font-mono">
                                            {rateChanged && (
                                              <span className="mr-1">
                                                運費 {ch.old_rate == null ? '—' : ch.old_rate.toFixed(1)} → {ch.new_rate == null ? '—' : ch.new_rate.toFixed(1)}
                                              </span>
                                            )}
                                            {regChanged && (
                                              <span className="text-muted-foreground">
                                                掛號 {ch.old_reg_fee == null ? '—' : ch.old_reg_fee.toFixed(0)} → {ch.new_reg_fee == null ? '—' : ch.new_reg_fee.toFixed(0)}
                                              </span>
                                            )}
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : c.previous_brackets ? (
                                <span className="text-[10px] text-muted-foreground">無變化</span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={6} className="p-0 bg-muted/30">
                                <div className="px-6 py-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Input
                                      type="text"
                                      placeholder={t.settings.competitor.searchBrackets}
                                      value={bracketSearch}
                                      onChange={(e) => setBracketSearch(e.target.value)}
                                      className="h-7 w-48 text-xs"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {filteredBrackets.length}/{c.brackets.length}
                                    </span>
                                  </div>
                                  <div className="max-h-64 overflow-y-auto rounded border border-border">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-muted/50">
                                          <TableHead className="text-[11px] py-1.5">{t.settings.competitor.weightRange}</TableHead>
                                          <TableHead className="text-[11px] py-1.5 text-right">{t.settings.competitor.freightRate}</TableHead>
                                          <TableHead className="text-[11px] py-1.5 text-right">{t.settings.competitor.regFee}</TableHead>
                                          <TableHead className="text-[11px] py-1.5 text-right">{t.settings.competitor.totalPrice}</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {filteredBrackets.length === 0 ? (
                                          <TableRow>
                                            <TableCell colSpan={4} className="text-xs text-center text-muted-foreground py-3">
                                              {t.settings.competitor.noSearchResults}
                                            </TableCell>
                                          </TableRow>
                                        ) : (
                                          filteredBrackets.map((b, i) => {
                                            const midWeight = (b.weight_min + b.weight_max) / 2
                                            const totalPrice = b.rate_per_kg * midWeight + b.reg_fee
                                            return (
                                              <TableRow key={i}>
                                                <TableCell className="text-xs py-1 font-mono">{b.weight_range}</TableCell>
                                                <TableCell className="text-xs py-1 text-right font-mono">{b.rate_per_kg.toFixed(1)}</TableCell>
                                                <TableCell className="text-xs py-1 text-right font-mono">{b.reg_fee.toFixed(0)}</TableCell>
                                                <TableCell className="text-xs py-1 text-right font-mono">{totalPrice.toFixed(1)}</TableCell>
                                              </TableRow>
                                            )
                                          })
                                        )}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
                </div>
                )}
              </div>
              )
            })}
                  </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {importPreview && (
        <CompetitorImportDialog
          open={!!importPreview}
          onOpenChange={(open) => { if (!open) setImportPreview(null) }}
          products={importPreview.products}
          competitorName={importPreview.competitorName}
          sourceFile={importPreview.sourceFile}
          existingLabels={importPreview.existingLabels}
          onImported={() => { setImportPreview(null); loadCards() }}
        />
      )}
      {compareTarget && (
        <CompetitorCompareDialog
          open={!!compareTarget}
          onOpenChange={(open) => { if (!open) setCompareTarget(null) }}
          competitorName={compareTarget.competitor_name}
          serviceCode={compareTarget.service_code}
          productLabel={compareTarget.label}
        />
      )}
    </Card>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const t = useT()
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={t.pages.settings.title}
        description={t.pages.settings.description}
      />

      <Tabs defaultValue="countries">
        <TabsList>
          <TabsTrigger value="countries">{t.pages.settings.countries}</TabsTrigger>
          <TabsTrigger value="gateways">{t.pages.settings.gateways}</TabsTrigger>
          <TabsTrigger value="carriers">{t.pages.settings.carriers}</TabsTrigger>
          <TabsTrigger value="competitor">{t.pages.settings.competitorCards}</TabsTrigger>
          <TabsTrigger value="customers">客戶</TabsTrigger>
        </TabsList>

        <TabsContent value="countries" className="mt-4">
          <CountriesTab />
        </TabsContent>

        <TabsContent value="gateways" className="mt-4">
          <GatewaysTab />
        </TabsContent>

        <TabsContent value="carriers" className="mt-4">
          <CarriersTab />
        </TabsContent>

        <TabsContent value="competitor" className="mt-4">
          <CompetitorTab />
        </TabsContent>

        <TabsContent value="customers" className="mt-4">
          <CustomersTab />
        </TabsContent>

      </Tabs>
    </div>
  )
}
