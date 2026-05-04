import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET — list all customers
export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, contact_email, contact_phone, notes, is_active, created_at')
      .order('name', { ascending: true })
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('GET /api/customers error:', error)
    return NextResponse.json({ error: '載入失敗' }, { status: 500 })
  }
}

// POST — create customer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, contact_email, contact_phone, notes } = body
    if (!name?.trim()) return NextResponse.json({ error: '名稱為必填' }, { status: 400 })

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('customers')
      .insert({ name: name.trim(), contact_email: contact_email || null, contact_phone: contact_phone || null, notes: notes || null })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('POST /api/customers error:', error)
    return NextResponse.json({ error: '新增失敗' }, { status: 500 })
  }
}
