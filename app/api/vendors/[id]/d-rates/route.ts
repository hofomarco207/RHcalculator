import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { deactivateCurrentRates, getNextVersion } from '@/lib/supabase/query-helpers'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const versionParam = request.nextUrl.searchParams.get('version')
    const supabase = createAdminClient()
    let query = supabase
      .from('vendor_d_rates')
      .select('*')
      .eq('vendor_id', id)

    if (versionParam) {
      query = query.eq('version', parseInt(versionParam))
    } else {
      query = query.eq('is_current', true)
    }

    const { data, error } = await query
      .order('zone', { ascending: true })
      .order('first_weight_kg', { ascending: true })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('D rates fetch error:', error)
    return NextResponse.json({ error: '載入 D段費率失敗' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { rates } = body as { rates: Array<{
      zone?: string
      first_weight_kg: number
      first_weight_price: number
      additional_weight_kg?: number
      additional_weight_price?: number
      currency?: string
      max_weight_kg?: number
      additional_surcharge?: number
      notes?: string
    }> }

    if (!rates || !Array.isArray(rates) || rates.length === 0) {
      return NextResponse.json({ error: '請提供至少一筆費率' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const version = await getNextVersion(supabase, 'vendor_d_rates', id)
    await deactivateCurrentRates(supabase, 'vendor_d_rates', id)

    const today = new Date().toISOString().split('T')[0]
    const rows = rates.map((r) => ({
      vendor_id: id,
      zone: r.zone || null,
      first_weight_kg: Number(r.first_weight_kg),
      first_weight_price: Number(r.first_weight_price),
      additional_weight_kg: Number(r.additional_weight_kg ?? 0),
      additional_weight_price: Number(r.additional_weight_price ?? 0),
      currency: r.currency || 'USD',
      max_weight_kg: r.max_weight_kg ? Number(r.max_weight_kg) : null,
      additional_surcharge: Number(r.additional_surcharge ?? 0),
      notes: r.notes || null,
      version,
      valid_from: today,
      valid_to: null,
      is_current: true,
    }))

    const { error } = await supabase.from('vendor_d_rates').insert(rows)
    if (error) throw error

    return NextResponse.json({ success: true, count: rows.length, version })
  } catch (error) {
    console.error('D rates save error:', error)
    return NextResponse.json({ error: '儲存 D段費率失敗' }, { status: 500 })
  }
}
