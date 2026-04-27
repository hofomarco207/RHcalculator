import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
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

/** Columns accepted by PATCH — mirror POST whitelist + use_median_pricing. */
const UPDATABLE_FIELDS = [
  'name', 'country_code', 'weekly_tickets', 'weekly_kg', 'zip_source',
  'seg_a', 'vendor_a_id',
  'vendor_b_id', 'b_gateway_mode', 'b_single_gateway', 'b_manual_proportions',
  'b_bubble_rate', 'b1_bubble_ratio',
  'vendor_c_id', 'c_overrides',
  'vendor_d_id', 'd_carrier_proportions', 'd_pricing_model',
  'exchange_rates', 'pricing_mode',
  'vendor_bc_id', 'vendor_bcd_id',
  'flights_per_week',
  'vendor_b2_id', 'b2_service_name', 'b2_gateway_mode', 'b2_single_gateway', 'b2_manual_proportions',
  'use_median_pricing', 'bc_bubble_ratio',
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

    const supabase = await createClient()
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
    const supabase = await createClient()
    const { error } = await supabase.from('scenarios').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Scenario delete error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
