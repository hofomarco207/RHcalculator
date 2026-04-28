import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const segment = searchParams.get('segment')
    const includeInactive = searchParams.get('include_inactive') === 'true'

    const supabase = createAdminClient()
    let query = supabase
      .from('vendors')
      .select('*')
      .order('created_at', { ascending: false })

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
    const { name, segment, notes, config } = body

    if (!name || !segment) {
      return NextResponse.json({ error: '名稱和段別為必填' }, { status: 400 })
    }
    if (!['A', 'BC', 'D'].includes(segment)) {
      return NextResponse.json({ error: '段別必須是 A、BC 或 D' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('vendors')
      .insert({
        name,
        segment,
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
