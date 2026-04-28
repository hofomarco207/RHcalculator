import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { data: card, error } = await supabase
      .from('rate_cards')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error || !card) {
      return NextResponse.json({ error: '找不到價卡' }, { status: 404 })
    }

    const { data: brackets } = await supabase
      .from('rate_card_country_brackets')
      .select('*')
      .eq('rate_card_id', id)
      .order('country_name_en')

    return NextResponse.json({ ...card, country_brackets: brackets ?? [] })
  } catch (error) {
    console.error('GET rate-card error:', error)
    return NextResponse.json({ error: '載入失敗' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('rate_cards')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE rate-card error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
