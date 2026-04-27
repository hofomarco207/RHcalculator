import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { WEIGHT_BRACKETS } from '@/types'

/**
 * GET /api/rate-card/weight-distribution
 *
 * Query params:
 *   product_type: 'economy' | 'premium' (required)
 *   period: '30d' | 'all' (default: 'all')
 *   breaks: comma-separated max values for custom brackets (e.g. "0.2,0.5,1,2,5,30")
 *           When omitted, uses default WEIGHT_BRACKETS.
 *
 * Returns weight bracket distribution from shipment_weight_records.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productType = searchParams.get('product_type') ?? 'economy'
    const period = searchParams.get('period') ?? 'all'
    const breaksParam = searchParams.get('breaks')

    // Validate inputs
    const VALID_PRODUCT_TYPES = ['economy', 'premium']
    const VALID_PERIODS = ['30d', 'all']
    if (!VALID_PRODUCT_TYPES.includes(productType)) {
      return NextResponse.json({ error: 'Invalid product_type' }, { status: 400 })
    }
    if (!VALID_PERIODS.includes(period)) {
      return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
    }

    // Parse custom bracket boundaries or use defaults
    const useBrackets = breaksParam
      ? (() => {
          const maxes = breaksParam.split(',').map(Number).filter((n) => !isNaN(n) && n > 0).sort((a, b) => a - b)
          return maxes.map((max, i) => ({
            range: `${i === 0 ? 0 : maxes[i - 1]}<W≤${max}`,
            min: i === 0 ? 0 : maxes[i - 1],
            max,
          }))
        })()
      : WEIGHT_BRACKETS.map((b) => ({ range: b.range, min: b.min, max: b.max }))

    const supabase = await createClient()

    // Build date filter for the period
    let dateFilter: string | null = null
    if (period === '30d') {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      dateFilter = thirtyDaysAgo.toISOString().split('T')[0]
    }

    // Fetch all rows in pages of 1000 (Supabase default limit)
    const PAGE_SIZE = 1000
    let allRows: { billable_weight_kg: number }[] = []
    let page = 0
    let hasMore = true

    while (hasMore) {
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      let query = supabase
        .from('shipment_weight_records')
        .select('billable_weight_kg')
        .eq('product_type', productType)
        .range(from, to)

      if (dateFilter) {
        query = query.gte('shipment_date', dateFilter)
      }

      const { data, error: pageError } = await query
      if (pageError) throw pageError

      const rows = data ?? []
      allRows = allRows.concat(rows)
      hasMore = rows.length === PAGE_SIZE
      page++
    }

    if (allRows.length === 0) {
      return NextResponse.json({ distribution: [], total_records: 0 })
    }

    // Group into weight brackets
    const distribution = useBrackets.map((bracket) => {
      const count = allRows.filter(
        (r) => r.billable_weight_kg > bracket.min && r.billable_weight_kg <= bracket.max
      ).length
      return {
        bracket: bracket.range,
        weight_min: bracket.min,
        weight_max: bracket.max,
        count,
        proportion: 0,
      }
    })

    const totalInBrackets = distribution.reduce((sum, d) => sum + d.count, 0)
    for (const d of distribution) {
      d.proportion = totalInBrackets > 0 ? d.count / totalInBrackets : 0
    }

    return NextResponse.json({
      distribution,
      total_records: allRows.length,
      matched_records: totalInBrackets,
      period,
      product_type: productType,
    })
  } catch (error) {
    console.error('GET /api/rate-card/weight-distribution error:', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
