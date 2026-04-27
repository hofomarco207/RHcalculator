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
      .from('vendor_bcd_rates')
      .select('*')
      .eq('vendor_id', id)
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) throw error
    return NextResponse.json(data?.[0] ?? null)
  } catch (error) {
    console.error('BCD rates fetch error:', error)
    return NextResponse.json({ error: '載入 BCD 費率失敗' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { rate_per_kg, handling_fee_per_unit, currency, notes } = body

    if (rate_per_kg == null || isNaN(Number(rate_per_kg))) {
      return NextResponse.json({ error: '請提供有效的每公斤費率' }, { status: 400 })
    }

    const supabase = await createClient()

    // Deactivate old rates
    await supabase
      .from('vendor_bcd_rates')
      .update({ is_current: false })
      .eq('vendor_id', id)
      .eq('is_current', true)

    // Insert new rate
    const { error } = await supabase.from('vendor_bcd_rates').insert({
      vendor_id: id,
      rate_per_kg: Number(rate_per_kg),
      handling_fee_per_unit: Number(handling_fee_per_unit ?? 0),
      currency: currency || 'USD',
      notes: notes || null,
      is_current: true,
    })
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('BCD rates save error:', error)
    return NextResponse.json({ error: '儲存 BCD 費率失敗' }, { status: 500 })
  }
}
