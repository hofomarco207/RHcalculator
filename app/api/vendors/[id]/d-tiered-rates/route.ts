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
      .from('vendor_d_tiered_rates')
      .select('*')
      .eq('vendor_id', id)

    if (versionParam) {
      query = query.eq('version', parseInt(versionParam))
    } else {
      query = query.is('valid_to', null)
    }

    const { data, error } = await query
      .order('country_code')
      .order('weight_min_kg')

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('D tiered rates fetch error:', error)
    return NextResponse.json({ error: '載入 D段分段費率失敗' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { rates, source, source_file } = body as {
      rates: Array<{
        country_code: string
        country_name?: string
        weight_min_kg: number
        weight_max_kg: number
        rate_per_kg: number
        registration_fee?: number
        currency?: string
        min_chargeable_weight_kg?: number
        transit_days?: string
        additional_surcharge?: number
      }>
      source?: string
      source_file?: string
    }

    if (!rates || !Array.isArray(rates) || rates.length === 0) {
      return NextResponse.json({ error: '未提供費率數據' }, { status: 400 })
    }

    const supabase = await createClient()
    const version = await getNextVersion(supabase, 'vendor_d_tiered_rates', id)
    await deactivateCurrentRates(supabase, 'vendor_d_tiered_rates', id)

    const today = new Date().toISOString().split('T')[0]
    const rows = rates.map((r) => ({
      vendor_id: id,
      country_code: r.country_code,
      country_name: r.country_name || null,
      weight_min_kg: r.weight_min_kg,
      weight_max_kg: r.weight_max_kg,
      rate_per_kg: r.rate_per_kg,
      registration_fee: r.registration_fee ?? 0,
      currency: r.currency || 'HKD',
      min_chargeable_weight_kg: r.min_chargeable_weight_kg || null,
      transit_days: r.transit_days || null,
      additional_surcharge: r.additional_surcharge ?? 0,
      version,
      valid_from: today,
      valid_to: null,
      source: source || null,
      source_file: source_file || null,
      is_current: true,
    }))

    const CHUNK = 500
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from('vendor_d_tiered_rates').insert(rows.slice(i, i + CHUNK))
      if (error) throw error
    }

    return NextResponse.json({ success: true, count: rows.length, version })
  } catch (error) {
    console.error('D tiered rates import error:', error)
    return NextResponse.json({ error: '匯入 D段分段費率失敗' }, { status: 500 })
  }
}
