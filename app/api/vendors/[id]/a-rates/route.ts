import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { VendorARate } from '@/types/vendor'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('vendor_a_rates')
      .select('*')
      .eq('vendor_id', id)
      .eq('is_current', true)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('A rates fetch error:', error)
    return NextResponse.json({ error: '載入 A段報價失敗' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { rates } = body as { rates: VendorARate[] }

    if (!rates || !Array.isArray(rates) || rates.length === 0) {
      return NextResponse.json({ error: '未提供報價數據' }, { status: 400 })
    }

    const supabase = await createClient()

    // Deactivate old rates for this vendor
    await supabase
      .from('vendor_a_rates')
      .update({ is_current: false })
      .eq('vendor_id', id)
      .eq('is_current', true)

    // Insert new rates
    const rows = rates.map((r) => ({
      vendor_id: id,
      pickup_hkd_per_kg: r.pickup_hkd_per_kg,
      sorting_hkd_per_kg: r.sorting_hkd_per_kg,
      include_sorting: r.include_sorting ?? false,
      bubble_ratio: r.bubble_ratio ?? 1.0,
      notes: r.notes || null,
      is_current: true,
    }))

    const CHUNK = 500
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error } = await supabase.from('vendor_a_rates').insert(chunk)
      if (error) throw error
    }

    return NextResponse.json({ success: true, count: rows.length })
  } catch (error) {
    console.error('A rates import error:', error)
    return NextResponse.json({ error: '匯入 A段報價失敗' }, { status: 500 })
  }
}
