import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/zone-mappings/[country]/search?q=JOHANNESBURG
 * Search zone_tier_mappings by city or postal_code.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ country: string }> }
) {
  try {
    const { country } = await params
    const q = request.nextUrl.searchParams.get('q')?.trim()

    if (!q || q.length < 2) {
      return NextResponse.json({ error: '搜索詞至少 2 個字元' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('zone_tier_mappings')
      .select('province, city, postal_code, zone, risk_flag')
      .eq('country_code', country)
      .or(`city.ilike.%${q}%,postal_code.ilike.%${q}%`)
      .order('zone')
      .order('city')
      .limit(50)

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('Zone mapping search error:', error)
    return NextResponse.json({ error: '搜索失敗' }, { status: 500 })
  }
}
