import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// PATCH — update customer
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, contact_email, contact_phone, notes, is_active } = body

    const update: Record<string, unknown> = {}
    if (name !== undefined) update.name = name?.trim() || undefined
    if (contact_email !== undefined) update.contact_email = contact_email || null
    if (contact_phone !== undefined) update.contact_phone = contact_phone || null
    if (notes !== undefined) update.notes = notes || null
    if (is_active !== undefined) update.is_active = is_active

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('customers')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('PATCH /api/customers/[id] error:', error)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}

// DELETE — deactivate customer (soft delete via is_active=false)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('customers')
      .update({ is_active: false })
      .eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/customers/[id] error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
