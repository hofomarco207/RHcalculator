import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('countries')
      .select('*')
      .order('code', { ascending: true })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('Countries fetch error:', error)
    return NextResponse.json({ error: '載入國家失敗' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, name_zh, name_en, currency_code, pricing_mode } = body

    if (!code || !name_zh) {
      return NextResponse.json({ error: '代碼和中文名稱為必填' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('countries')
      .insert({
        code,
        name_zh,
        name_en: name_en || null,
        currency_code: currency_code || null,
        pricing_mode: pricing_mode || 'segmented',
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Country create error:', error)
    return NextResponse.json({ error: '新增國家失敗' }, { status: 500 })
  }
}
