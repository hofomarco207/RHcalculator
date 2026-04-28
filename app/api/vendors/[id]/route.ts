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
      .from('vendors')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    if (!data) return NextResponse.json({ error: '找不到供應商' }, { status: 404 })
    return NextResponse.json(data)
  } catch (error) {
    console.error('Vendor fetch error:', error)
    return NextResponse.json({ error: '載入失敗' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, notes, is_active, config, country_code, a_pricing_mode, per_piece_fee, per_piece_currency } = body

    const supabase = createAdminClient()
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (notes !== undefined) updates.notes = notes
    if (is_active !== undefined) updates.is_active = is_active
    if (config !== undefined) updates.config = config
    if (country_code !== undefined) updates.country_code = country_code
    if (a_pricing_mode !== undefined) updates.a_pricing_mode = a_pricing_mode
    if (per_piece_fee !== undefined) updates.per_piece_fee = per_piece_fee
    if (per_piece_currency !== undefined) updates.per_piece_currency = per_piece_currency

    const { data, error } = await supabase
      .from('vendors')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Vendor update error:', error)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    // Delete related rate data first
    const rateTables = [
      'vendor_a_rates', 'vendor_b_rates', 'vendor_c_rates',
      'vendor_d_rates', 'vendor_d_config', 'vendor_d_tiered_rates',
      'vendor_d_lookup_rates', 'vendor_d_lookup_area_countries',
      'vendor_bc_rates', 'vendor_bcd_rates',
    ]
    for (const table of rateTables) {
      await supabase.from(table).delete().eq('vendor_id', id)
    }

    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Vendor delete error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
