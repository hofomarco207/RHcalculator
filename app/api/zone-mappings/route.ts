import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/zone-mappings?country=ZA
 * Returns summary of zone_tier_mappings per country.
 * Uses RPC for aggregation (avoids PostgREST 1000-row default limit).
 */
export async function GET(request: NextRequest) {
  try {
    const country = request.nextUrl.searchParams.get('country')
    const supabase = await createClient()

    const { data: aggRows, error } = await supabase.rpc('zone_tier_distribution', {
      p_country: country ?? null,
    })
    if (error) throw error
    if (!aggRows || aggRows.length === 0) return NextResponse.json([])

    // Group by country
    const countryMap: Record<string, { zones: Record<string, number>; total: number }> = {}
    for (const row of aggRows) {
      if (!countryMap[row.country_code]) {
        countryMap[row.country_code] = { zones: {}, total: 0 }
      }
      const entry = countryMap[row.country_code]
      entry.zones[row.zone] = row.cnt
      entry.total += row.cnt
    }

    // Get earliest created_at per country (single lightweight query)
    const countries = Object.keys(countryMap)
    const importDates: Record<string, string> = {}
    for (const cc of countries) {
      const { data: oldest } = await supabase
        .from('zone_tier_mappings')
        .select('created_at')
        .eq('country_code', cc)
        .order('created_at', { ascending: true })
        .limit(1)
      if (oldest?.[0]) importDates[cc] = oldest[0].created_at
    }

    const summaries = Object.entries(countryMap).map(([cc, entry]) => {
      const distribution: Record<string, number> = {}
      for (const [zone, count] of Object.entries(entry.zones)) {
        distribution[zone] = Math.round((count / entry.total) * 10000) / 10000
      }
      return {
        country_code: cc,
        zone_count: Object.keys(entry.zones).length,
        total_records: entry.total,
        distribution,
        imported_at: importDates[cc] ?? null,
      }
    })

    return NextResponse.json(summaries)
  } catch (error) {
    console.error('Zone mappings list error:', error)
    return NextResponse.json({ error: '載入分區資料失敗' }, { status: 500 })
  }
}
