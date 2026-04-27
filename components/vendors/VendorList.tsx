'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import type { Vendor } from '@/types'

interface VendorListProps {
  vendors: Vendor[]
  loading: boolean
  selectedId?: string
  onSelect: (vendor: Vendor) => void
  onRefresh: () => void
}

export function VendorList({ vendors, loading, selectedId, onSelect, onRefresh }: VendorListProps) {
  const t = useT()
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleToggleActive(e: React.MouseEvent, vendor: Vendor) {
    e.stopPropagation()
    setToggling(vendor.id)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !vendor.is_active }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${vendor.name} ${t.pages.vendors.toggleSuccess.replace('{action}', vendor.is_active ? t.common.disabled : t.common.enabled)}`)
      onRefresh()
    } catch {
      toast.error(t.common.operationFailed)
    } finally {
      setToggling(null)
    }
  }

  async function handleDelete(e: React.MouseEvent, vendor: Vendor) {
    e.stopPropagation()
    if (!confirm(t.pages.vendors.deleteConfirm.replace('{name}', vendor.name))) return
    setDeleting(vendor.id)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success(t.pages.vendors.deleteSuccess.replace('{name}', vendor.name))
      onRefresh()
    } catch {
      toast.error(t.common.deleteFailed)
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">{t.common.loading}</p>
  }

  if (vendors.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          {t.pages.vendors.noVendors}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {vendors.map((v) => (
        <button
          key={v.id}
          onClick={() => onSelect(v)}
          className={`text-left rounded-lg border p-3 transition-colors relative ${
            !v.is_active
              ? 'border-gray-200 bg-gray-50 opacity-50'
              : selectedId === v.id
              ? 'border-[#FF6B00] bg-orange-50'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-start justify-between gap-1">
            <p className={`font-medium text-sm truncate ${!v.is_active ? 'line-through text-gray-400' : ''}`}>
              {v.name}
            </p>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span
                onClick={(e) => handleToggleActive(e, v)}
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-colors ${
                  toggling === v.id
                    ? 'bg-gray-200 text-gray-400'
                    : v.is_active
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-red-100 text-red-600 hover:bg-red-200'
                }`}
              >
                {toggling === v.id ? '...' : v.is_active ? t.common.active : t.common.inactive}
              </span>
              <span
                onClick={(e) => handleDelete(e, v)}
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-colors ${
                  deleting === v.id
                    ? 'bg-gray-200 text-gray-400'
                    : 'text-red-400 hover:bg-red-100 hover:text-red-600'
                }`}
              >
                {deleting === v.id ? '...' : '✕'}
              </span>
            </div>
          </div>
          {v.notes && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{v.notes}</p>
          )}
        </button>
      ))}
    </div>
  )
}
