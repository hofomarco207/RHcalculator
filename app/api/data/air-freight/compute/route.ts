import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { ComputeStrategy } from '@/types'
import { GATEWAYS } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      strategy: ComputeStrategy
      cargo_type?: string
      custom_weeks?: string[]
    }

    const { strategy, cargo_type = '特惠带电', custom_weeks } = body
    const supabase = createAdminClient()

    // Fetch records for the cargo type, ordered by date desc
    const { data: allRecords, error } = await supabase
      .from('air_freight_history')
      .select('*')
      .eq('cargo_type', cargo_type)
      .order('week_start', { ascending: false })

    if (error) throw error
    if (!allRecords || allRecords.length === 0) {
      return NextResponse.json({ error: '無報價數據' }, { status: 404 })
    }

    // Get unique weeks sorted by date desc
    const uniqueWeeks = [...new Set(allRecords.map(r => r.week_label))]

    // Determine which weeks to use based on strategy
    let selectedWeeks: string[]
    switch (strategy) {
      case 'latest':
        selectedWeeks = uniqueWeeks.slice(0, 1)
        break
      case 'avg4w':
        selectedWeeks = uniqueWeeks.slice(0, 4)
        break
      case 'avg8w':
        selectedWeeks = uniqueWeeks.slice(0, 8)
        break
      case 'custom':
        selectedWeeks = custom_weeks ?? uniqueWeeks.slice(0, 1)
        break
      default:
        selectedWeeks = uniqueWeeks.slice(0, 1)
    }

    // Compute average net price per port for selected weeks
    const suggestions: Record<string, { total: number; count: number }> = {}
    for (const record of allRecords) {
      if (!selectedWeeks.includes(record.week_label)) continue
      const key = record.port_code
      if (!suggestions[key]) suggestions[key] = { total: 0, count: 0 }
      suggestions[key].total += record.net_price_hkd_per_kg
      suggestions[key].count += 1
    }

    const result = GATEWAYS.map(port => ({
      port_code: port,
      net_price: suggestions[port]
        ? Math.round((suggestions[port].total / suggestions[port].count) * 100) / 100
        : 0,
      source_weeks: selectedWeeks,
    }))

    return NextResponse.json({ suggestions: result, strategy, cargo_type })
  } catch (error) {
    console.error('Compute error:', error)
    return NextResponse.json({ error: '計算失敗' }, { status: 500 })
  }
}
