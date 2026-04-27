import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/zone-mappings/[country]/distribution
 * Returns zone/tier distribution percentages for a country.
 * Uses RPC for aggregation (avoids PostgREST 1000-row default limit).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ country: string }> }
) {
  try {
    const { country } = await params
    const supabase = await createClient()

    const { data: aggRows, error } = await supabase.rpc('zone_tier_distribution', {
      p_country: country,
    })
    if (error) throw error
    if (!aggRows || aggRows.length === 0) {
      return NextResponse.json({ distribution: null, total_records: 0, zones: [] })
    }

    let total = 0
    const distribution: Record<string, number> = {}
    const zones: string[] = []
    for (const row of aggRows) {
      total += row.cnt
    }
    for (const row of aggRows) {
      distribution[row.zone] = Math.round((row.cnt / total) * 10000) / 10000
      zones.push(row.zone)
    }

    return NextResponse.json({ distribution, total_records: total, zones })
  } catch (error) {
    console.error('Zone distribution error:', error)
    return NextResponse.json({ error: '載入分區分布失敗' }, { status: 500 })
  }
}
