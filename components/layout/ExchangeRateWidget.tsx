'use client'

import { useState, useCallback } from 'react'
import { useExchangeRates } from '@/lib/context/exchange-rate-context'
import { useT } from '@/lib/i18n'
import type { ExchangeRates } from '@/types'

const RATE_FIELDS: Array<{ field: keyof ExchangeRates; label: string; hint: string }> = [
  { field: 'usd_hkd', label: 'USD/HKD', hint: '1 USD = ? HKD' },
  { field: 'hkd_rmb', label: 'HKD/RMB', hint: '1 HKD = ? RMB' },
  { field: 'twd_hkd', label: 'TWD/HKD', hint: '1 TWD = ? HKD' },
  { field: 'jpy_hkd', label: 'JPY/HKD', hint: '1 JPY = ? HKD' },
]

export function ExchangeRateWidget() {
  const { rates, loading, updateRate } = useExchangeRates()
  const t = useT()
  const [editingField, setEditingField] = useState<keyof ExchangeRates | null>(null)
  const [editValue, setEditValue] = useState<string>('')

  const handleStartEdit = useCallback((field: keyof ExchangeRates) => {
    const val = rates[field]
    setEditingField(field)
    setEditValue(typeof val === 'number' ? val.toString() : '')
  }, [rates])

  const handleConfirm = useCallback(async () => {
    if (!editingField) return
    const parsed = parseFloat(editValue)
    if (isNaN(parsed) || parsed <= 0) {
      setEditingField(null)
      return
    }
    await updateRate(editingField, parsed)
    setEditingField(null)
  }, [editingField, editValue, updateRate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') setEditingField(null)
  }, [handleConfirm])

  if (loading) return null

  return (
    <div className="px-4 py-3" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563] mb-2">
        {t.sidebar.language === '語言' ? '匯率' : 'Exchange Rates'}
      </p>
      <div className="space-y-1">
        {RATE_FIELDS.map(({ field, label }) => {
          const val = rates[field]
          const displayVal = typeof val === 'number' ? val.toFixed(4) : '—'

          if (editingField === field) {
            return (
              <div key={field} className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#6B7280] w-14 flex-shrink-0 font-mono">{label}</span>
                <input
                  autoFocus
                  type="number"
                  step="0.0001"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleConfirm}
                  onKeyDown={handleKeyDown}
                  className="w-full rounded px-1.5 py-0.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                  style={{
                    backgroundColor: 'rgba(255, 107, 0, 0.15)',
                    border: '1px solid #FF6B00',
                  }}
                />
              </div>
            )
          }

          return (
            <button
              key={field}
              onClick={() => handleStartEdit(field)}
              className="w-full flex items-center justify-between rounded px-1.5 py-0.5 text-xs transition-colors"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255, 255, 255, 0.06)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
              }}
            >
              <span className="text-[#6B7280] font-mono text-[10px]">{label}</span>
              <span className="font-mono text-[#9CA3AF]">{displayVal}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
