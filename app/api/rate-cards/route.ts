import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const countryCode = request.nextUrl.searchParams.get('country_code')
    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 30, 500) : 30

    let query = supabase
      .from('rate_cards')
      .select('id, name, product_type, target_margin, brackets, scenario_id, country_code, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (countryCode && countryCode !== 'all') {
      query = query.eq('country_code', countryCode) as typeof query
    }

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('Rate cards fetch error:', error)
    return NextResponse.json({ error: '載入失敗' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, product_type, target_margin, brackets, scenario_id, country_code } = body

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('rate_cards')
      .insert({
        name,
        product_type,
        target_margin,
        brackets,
        ...(scenario_id != null && { scenario_id }),
        ...(country_code != null && { country_code }),
      })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ id: data.id })
  } catch (error) {
    console.error('Rate card save error:', error)
    return NextResponse.json({ error: '儲存失敗' }, { status: 500 })
  }
}
