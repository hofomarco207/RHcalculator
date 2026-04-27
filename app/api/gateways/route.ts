import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const country = searchParams.get('country')

    const supabase = await createClient()
    let query = supabase
      .from('gateways')
      .select('*')
      .order('code', { ascending: true })

    if (country) {
      query = query.eq('country_code', country)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('Gateways fetch error:', error)
    return NextResponse.json({ error: '載入閘口失敗' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, country_code, name_zh, name_en } = body

    if (!code || !country_code) {
      return NextResponse.json({ error: '代碼和國家代碼為必填' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('gateways')
      .insert({
        code,
        country_code,
        name_zh: name_zh || null,
        name_en: name_en || null,
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Gateway create error:', error)
    return NextResponse.json({ error: '新增閘口失敗' }, { status: 500 })
  }
}
