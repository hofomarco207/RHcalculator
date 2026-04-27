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
      .from('vendor_c_rates')
      .select('*')
      .eq('vendor_id', id)

    if (versionParam) {
      query = query.eq('version', parseInt(versionParam))
    } else {
      query = query.eq('is_current', true)
    }

    const { data, error } = await query
      .order('fee_type')
      .order('fee_name')

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('C rates fetch error:', error)
    return NextResponse.json({ error: '載入 C段報價失敗' }, { status: 500 })
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
      return NextResponse.json({ error: '未提供費率數據' }, { status: 400 })
    }

    const supabase = await createClient()
    const version = await getNextVersion(supabase, 'vendor_c_rates', id)
    await deactivateCurrentRates(supabase, 'vendor_c_rates', id)

    const today = new Date().toISOString().split('T')[0]
    const rows = rates.map((r) => ({
      vendor_id: id,
      fee_type: r.fee_type,
      fee_name: r.fee_name,
      gateway_code: r.gateway_code || null,
      amount: r.amount,
      currency: r.currency || 'USD',
      min_amount: r.min_amount ?? null,
      additional_surcharge: r.additional_surcharge ?? 0,
      notes: r.notes || null,
      version,
      valid_from: today,
      valid_to: null,
      is_current: true,
    }))

    const { error } = await supabase.from('vendor_c_rates').insert(rows)
    if (error) throw error

    return NextResponse.json({ success: true, count: rows.length, version })
  } catch (error) {
    console.error('C rates save error:', error)
    return NextResponse.json({ error: '儲存 C段費率失敗' }, { status: 500 })
  }
}
