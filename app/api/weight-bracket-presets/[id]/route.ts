import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** PATCH — update preset name, brackets, or is_default */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, brackets, is_default } = body

    const supabase = await createClient()

    // If marking as default, unset previous default for the same country
    if (is_default) {
      const { data: existing } = await supabase
        .from('weight_bracket_presets')
        .select('country_code')
        .eq('id', id)
        .single()
      if (existing) {
        await supabase
          .from('weight_bracket_presets')
          .update({ is_default: false })
          .eq('country_code', existing.country_code)
          .eq('is_default', true)
      }
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) update.name = name.trim()
    if (brackets !== undefined) update.brackets = brackets
    if (is_default !== undefined) update.is_default = is_default

    const { data, error } = await supabase
      .from('weight_bracket_presets')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('PATCH weight-bracket-presets error:', error)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}

/** DELETE — remove a preset */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { error } = await supabase
      .from('weight_bracket_presets')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE weight-bracket-presets error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
