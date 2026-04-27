'use client'

import { useState, useEffect, useMemo } from 'react'
import type { RateCardBracket, ProductType, WeightBracketDistribution } from '@/types'
import { getMarginColorClass } from '@/lib/utils/margin'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useT } from '@/lib/i18n'

interface WeightedMarginPanelProps {
  brackets: RateCardBracket[]
  productType: ProductType
}

type Period = '30d' | 'all'

export function WeightedMarginPanel({ brackets, productType }: WeightedMarginPanelProps) {
  const t = useT()
  const [distribution, setDistribution] = useState<WeightBracketDistribution[] | null>(null)
  const [totalRecords, setTotalRecords] = useState(0)
  const [matchedRecords, setMatchedRecords] = useState(0)
  const [period, setPeriod] = useState<Period>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Build breaks param from actual bracket boundaries
  const breaksParam = brackets.map((b) => b.weight_max_kg).join(',')

  useEffect(() => {
    const controller = new AbortController()
    async function fetchDistribution() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/rate-card/weight-distribution?product_type=${productType}&period=${period}&breaks=${breaksParam}`,
          { signal: controller.signal }
        )
        if (!res.ok) throw new Error('server')
        const data = await res.json()
        setDistribution(data.distribution ?? [])
        setTotalRecords(data.total_records ?? 0)
        setMatchedRecords(data.matched_records ?? 0)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setError(err instanceof Error ? err.message : t.common.error)
        setDistribution(null)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }
    fetchDistribution()
    return () => controller.abort()
  }, [productType, period, breaksParam])

  const weightedMargin = useMemo(() => {
    if (!distribution || distribution.length === 0) return null

    let totalWeightedMargin = 0
    let matched = 0
    for (const dist of distribution) {
      const bracket = brackets.find(
        (b) => b.weight_min_kg === dist.weight_min && b.weight_max_kg === dist.weight_max
      )
      if (bracket) {
        totalWeightedMargin += bracket.actual_margin * dist.proportion
        matched++
      }
    }
    return matched > 0 ? totalWeightedMargin : null
  }, [brackets, distribution])

  const bracketDetails = useMemo(() => {
    if (!distribution) return []
    return distribution.map((dist) => {
      const bracket = brackets.find(
        (b) => b.weight_min_kg === dist.weight_min && b.weight_max_kg === dist.weight_max
      )
      return {
        range: dist.bracket,
        proportion: dist.proportion,
        count: dist.count,
        margin: bracket?.actual_margin ?? 0,
        contribution: (bracket?.actual_margin ?? 0) * dist.proportion,
      }
    })
  }, [brackets, distribution])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t.common.loading}
      </div>
    )
  }

  if (error) {
    const isServerError = error === 'server'
    return (
      <div className="py-3 text-sm text-muted-foreground">
        {isServerError
          ? t.common.loadFailed
          : t.common.operationFailed}
      </div>
    )
  }

  if (!distribution || distribution.length === 0 || totalRecords === 0) {
    return (
      <div className="py-3 text-sm text-muted-foreground">
        {t.common.noData}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header: Overall margin + period toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{t.pages.rateCard.weightedMargin}</span>
          {weightedMargin !== null && (
            <span
              className={`inline-block px-2.5 py-1 rounded text-sm font-mono font-semibold ${getMarginColorClass(weightedMargin)}`}
            >
              {(weightedMargin * 100).toFixed(1)}%
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {matchedRecords.toLocaleString()} {t.common.records}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={period === '30d' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPeriod('30d')}
          >
            30d
          </Button>
          <Button
            variant={period === 'all' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPeriod('all')}
          >
            {t.common.all}
          </Button>
        </div>
      </div>

      {/* Bracket breakdown */}
      <div className="grid grid-cols-6 gap-2 text-xs">
        {bracketDetails.map((d) => (
          <div
            key={d.range}
            className="rounded border px-2 py-1.5 space-y-0.5"
          >
            <div className="font-medium text-muted-foreground truncate" title={d.range}>
              {d.range}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t.common.proportion}</span>
              <span className="font-mono">{(d.proportion * 100).toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t.common.margin}</span>
              <span className={`font-mono ${getMarginColorClass(d.margin)}`}>
                {(d.margin * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">貢獻</span>
              <span className="font-mono">{(d.contribution * 100).toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
