import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { error } = await supabase
      .from('rate_cards')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Rate card delete error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
