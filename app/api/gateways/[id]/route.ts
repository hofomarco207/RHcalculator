import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { code, name_zh, name_en, is_active } = body

    const updateData: Record<string, unknown> = {}
    if (code !== undefined) updateData.code = code
    if (name_zh !== undefined) updateData.name_zh = name_zh
    if (name_en !== undefined) updateData.name_en = name_en
    if (is_active !== undefined) updateData.is_active = is_active

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('gateways')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Gateway update error:', error)
    return NextResponse.json({ error: '更新閘口失敗' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { error } = await supabase
      .from('gateways')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Gateway delete error:', error)
    return NextResponse.json({ error: '刪除口岸失敗' }, { status: 500 })
  }
}
