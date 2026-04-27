import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const segment = searchParams.get('segment')
    const country = searchParams.get('country') || 'US'

    const includeInactive = searchParams.get('include_inactive') === 'true'

    const supabase = await createClient()
    let query = supabase
      .from('vendors')
      .select('*')
      .order('created_at', { ascending: false })

    // A段是香港倉操作，適用所有國家，不過濾 country
    if (segment !== 'A') {
      query = query.eq('country_code', country)
    }

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    if (segment) {
      query = query.eq('segment', segment)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('Vendors fetch error:', error)
    return NextResponse.json({ error: '載入供應商失敗' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, segment, country_code, notes, config } = body

    if (!name || !segment) {
      return NextResponse.json({ error: '名稱和段別為必填' }, { status: 400 })
    }
    if (!['A', 'B', 'C', 'D', 'BC', 'BCD'].includes(segment)) {
      return NextResponse.json({ error: '段別必須是 A、B、C、D、BC 或 BCD' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('vendors')
      .insert({
        name,
        segment,
        country_code: country_code || 'US',
        notes: notes || null,
        config: config || null,
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Vendor create error:', error)
    return NextResponse.json({ error: '新增供應商失敗' }, { status: 500 })
  }
}
