import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('scenarios')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Scenario fetch error:', error)
    return NextResponse.json({ error: '載入方案失敗' }, { status: 500 })
  }
}

/** Columns accepted by PATCH. */
const UPDATABLE_FIELDS = [
  'name', 'weekly_tickets', 'weekly_kg',
  'seg_a', 'vendor_a_id',
  'vendor_bc_id', 'bc_bubble_ratio',
  'vendor_d_id', 'd_competitor_name', 'd_service_code',
  'exchange_rates', 'pricing_mode',
  'results',
] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of UPDATABLE_FIELDS) {
      if (key in body) patch[key] = body[key]
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('scenarios')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('Scenario update error:', error.message, error.details, error.hint, error.code)
      return NextResponse.json({ error: `更新方案失敗: ${error.message}` }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error('Scenario update error (exception):', error)
    return NextResponse.json({ error: '更新方案失敗' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()
    const { error } = await supabase.from('scenarios').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Scenario delete error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
