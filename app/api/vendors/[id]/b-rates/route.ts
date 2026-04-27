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
      .from('vendor_b_rates')
      .select('*')
      .eq('vendor_id', id)

    if (versionParam) {
      query = query.eq('version', parseInt(versionParam))
    } else {
      // Current: is_current=true OR valid_to IS NULL (transition period)
      query = query.eq('is_current', true)
    }

    const { data, error } = await query
      .order('gateway_code')
      .order('weight_tier_min_kg')

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('B rates fetch error:', error)
    return NextResponse.json({ error: '載入 B段報價失敗' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { rates } = body as { rates: Record<string, unknown>[] }

    if (!rates || !Array.isArray(rates) || rates.length === 0) {
      return NextResponse.json({ error: '未提供報價數據' }, { status: 400 })
    }

    const supabase = await createClient()
    const version = await getNextVersion(supabase, 'vendor_b_rates', id)
    await deactivateCurrentRates(supabase, 'vendor_b_rates', id)

    const today = new Date().toISOString().split('T')[0]
    const rows = rates.map((r) => ({
      vendor_id: id,
      service_name: r.service_name || null,
      gateway_code: r.gateway_code,
      airline: r.airline || null,
      weight_tier_min_kg: r.weight_tier_min_kg,
      rate_per_kg: r.rate_per_kg,
      currency: r.currency || 'RMB',
      bubble_ratio: r.bubble_ratio ?? 1.0,
      transit_days: r.transit_days || null,
      frequency: r.frequency || null,
      flights_per_week: r.flights_per_week ?? 7,
      pickup_fee: r.pickup_fee ?? 0,
      handling_fee: r.handling_fee ?? 0,
      operation_fee: r.operation_fee ?? 0,
      document_fee: r.document_fee ?? 0,
      battery_check_fee: r.battery_check_fee ?? 0,
      customs_fee: r.customs_fee ?? 0,
      airport_transfer_fee: r.airport_transfer_fee ?? 0,
      magnetic_check_fee: r.magnetic_check_fee ?? 0,
      additional_surcharge: r.additional_surcharge ?? 0,
      surcharges: Array.isArray(r.surcharges) ? r.surcharges : [],
      routing: r.routing || null,
      service_type: r.service_type || null,
      notes: r.notes || null,
      version,
      valid_from: today,
      valid_to: null,
      is_current: true,
    }))

    const CHUNK = 500
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error } = await supabase.from('vendor_b_rates').insert(chunk)
      if (error) throw error
    }

    return NextResponse.json({ success: true, count: rows.length, version })
  } catch (error) {
    console.error('B rates import error:', error)
    return NextResponse.json({ error: '匯入 B段報價失敗' }, { status: 500 })
  }
}
