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

    let ratesQuery = supabase
      .from('vendor_d_lookup_rates')
      .select('*')
      .eq('vendor_id', id)

    if (versionParam) {
      ratesQuery = ratesQuery.eq('version', parseInt(versionParam))
    } else {
      ratesQuery = ratesQuery.is('valid_to', null)
    }

    const [ratesRes, areasRes] = await Promise.all([
      ratesQuery
        .order('area_code')
        .order('weight_kg'),
      supabase
        .from('vendor_d_lookup_area_countries')
        .select('*')
        .eq('vendor_id', id),
    ])

    if (ratesRes.error) throw ratesRes.error
    if (areasRes.error) throw areasRes.error

    return NextResponse.json({
      rates: ratesRes.data ?? [],
      area_countries: areasRes.data ?? [],
    })
  } catch (error) {
    console.error('D lookup rates fetch error:', error)
    return NextResponse.json({ error: '載入 D段查表費率失敗' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { rates, area_countries, source, source_file } = body as {
      rates: Array<{
        area_code: string
        area_name?: string
        weight_kg: number
        amount: number
        currency?: string
        additional_surcharge?: number
      }>
      area_countries: Array<{
        area_code: string
        country_code: string
      }>
      source?: string
      source_file?: string
    }

    if (!rates || rates.length === 0) {
      return NextResponse.json({ error: '未提供費率數據' }, { status: 400 })
    }

    const supabase = await createClient()
    const version = await getNextVersion(supabase, 'vendor_d_lookup_rates', id)
    await deactivateCurrentRates(supabase, 'vendor_d_lookup_rates', id)

    const today = new Date().toISOString().split('T')[0]
    const rateRows = rates.map((r) => ({
      vendor_id: id,
      area_code: r.area_code,
      area_name: r.area_name || null,
      weight_kg: r.weight_kg,
      amount: r.amount,
      currency: r.currency || 'JPY',
      additional_surcharge: r.additional_surcharge ?? 0,
      version,
      valid_from: today,
      valid_to: null,
      source: source || null,
      source_file: source_file || null,
      is_current: true,
    }))

    const CHUNK = 500
    for (let i = 0; i < rateRows.length; i += CHUNK) {
      const { error } = await supabase.from('vendor_d_lookup_rates').insert(rateRows.slice(i, i + CHUNK))
      if (error) throw error
    }

    // Upsert area → country mapping
    if (area_countries && area_countries.length > 0) {
      // Clear existing mappings for this vendor
      await supabase.from('vendor_d_lookup_area_countries').delete().eq('vendor_id', id)

      const areaRows = area_countries.map((ac) => ({
        vendor_id: id,
        area_code: ac.area_code,
        country_code: ac.country_code,
      }))
      const { error } = await supabase.from('vendor_d_lookup_area_countries').insert(areaRows)
      if (error) throw error
    }

    return NextResponse.json({ success: true, rate_count: rateRows.length, version })
  } catch (error) {
    console.error('D lookup rates import error:', error)
    return NextResponse.json({ error: '匯入 D段查表費率失敗' }, { status: 500 })
  }
}
