import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/competitor-rate-cards/compare
 * Query params:
 *   - competitor_name (required)
 *   - service_code (required)
 *   - versions (optional, comma-separated list of version numbers; default = all)
 *
 * Returns all matching rows — caller aggregates by country × version for the trend
 * chart (avg rate/kg across brackets) and per-cell tooltip (all brackets).
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const competitorName = url.searchParams.get('competitor_name')
    const serviceCode = url.searchParams.get('service_code')
    const versionsParam = url.searchParams.get('versions')

    if (!competitorName || !serviceCode) {
      return NextResponse.json(
        { error: 'competitor_name and service_code are required' },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    let query = supabase
      .from('competitor_rate_cards')
      .select('id, competitor_name, service_code, country_code, country_name_en, country_name_zh, version, valid_from, valid_to, is_current, currency, brackets, fuel_surcharge_pct, weight_step, effective_date')
      .eq('competitor_name', competitorName)
      .eq('service_code', serviceCode)
      .order('country_name_en')
      .order('version', { ascending: false })

    if (versionsParam) {
      const vs = versionsParam.split(',').map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n))
      if (vs.length > 0) query = query.in('version', vs) as typeof query
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('GET competitor-rate-cards/compare error:', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
