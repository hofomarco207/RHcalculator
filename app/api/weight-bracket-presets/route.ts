import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/** GET — list presets for a country */
export async function GET(request: NextRequest) {
  try {
    const country = new URL(request.url).searchParams.get('country')
    if (!country) return NextResponse.json({ error: 'country required' }, { status: 400 })

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('weight_bracket_presets')
      .select('*')
      .eq('country_code', country)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('GET weight-bracket-presets error:', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}

/** POST — create a new preset */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, country_code, brackets, is_default } = body

    if (!name?.trim() || !country_code || !Array.isArray(brackets) || brackets.length === 0) {
      return NextResponse.json({ error: '名稱、國家、區間不能為空' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // If marking as default, unset previous default for this country
    if (is_default) {
      await supabase
        .from('weight_bracket_presets')
        .update({ is_default: false })
        .eq('country_code', country_code)
        .eq('is_default', true)
    }

    const { data, error } = await supabase
      .from('weight_bracket_presets')
      .insert({
        name: name.trim(),
        country_code,
        brackets,
        is_default: is_default ?? false,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('POST weight-bracket-presets error:', error)
    return NextResponse.json({ error: '儲存失敗' }, { status: 500 })
  }
}
