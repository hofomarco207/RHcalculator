import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deactivateCurrentRates, getNextVersion } from '@/lib/supabase/query-helpers'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const versionParam = request.nextUrl.searchParams.get('version')
    const supabase = await createClient()
    let query = supabase
      .from('vendor_bc_rates')
      .select('*')
      .eq('vendor_id', id)

    if (versionParam) {
      query = query.eq('version', parseInt(versionParam))
    } else {
      query = query.eq('is_current', true)
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) throw error
    return NextResponse.json(data?.[0] ?? null)
  } catch (error) {
    console.error('BC rates fetch error:', error)
    return NextResponse.json({ error: '載入 BC 費率失敗' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { rate_per_kg, handling_fee_per_unit, additional_surcharge, currency, notes } = body

    if (rate_per_kg == null || isNaN(Number(rate_per_kg))) {
      return NextResponse.json({ error: '請提供有效的每公斤費率' }, { status: 400 })
    }

    const supabase = await createClient()
    const version = await getNextVersion(supabase, 'vendor_bc_rates', id)
    await deactivateCurrentRates(supabase, 'vendor_bc_rates', id)

    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('vendor_bc_rates').insert({
      vendor_id: id,
      rate_per_kg: Number(rate_per_kg),
      handling_fee_per_unit: Number(handling_fee_per_unit ?? 0),
      additional_surcharge: Number(additional_surcharge ?? 0),
      currency: currency || 'USD',
      notes: notes || null,
      version,
      valid_from: today,
      valid_to: null,
      is_current: true,
    })
    if (error) throw error

    return NextResponse.json({ success: true, version })
  } catch (error) {
    console.error('BC rates save error:', error)
    return NextResponse.json({ error: '儲存 BC 費率失敗' }, { status: 500 })
  }
}
