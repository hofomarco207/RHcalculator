import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const country = searchParams.get('country') || 'US'
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 500) : 50

    const supabase = await createClient()
    let query = supabase
      .from('scenarios')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (country !== 'all') {
      query = query.eq('country_code', country) as typeof query
    }

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('Scenarios fetch error:', error)
    return NextResponse.json({ error: '載入方案失敗' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const supabase = await createClient()

    // Duplicate name check (same country)
    const scenarioName = body.name || '未命名方案'
    const countryCode = body.country_code || 'US'
    const { data: existing } = await supabase
      .from('scenarios')
      .select('id')
      .eq('name', scenarioName)
      .eq('country_code', countryCode)
      .limit(1)
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `同名方案「${scenarioName}」已存在，請使用不同名稱` },
        { status: 409 }
      )
    }

    const { data, error } = await supabase
      .from('scenarios')
      .insert({
        name: body.name || '未命名方案',
        country_code: body.country_code || 'US',
        weekly_tickets: body.weekly_tickets,
        weekly_kg: body.weekly_kg ?? null,
        zip_source: body.zip_source || 'historical',
        seg_a: body.seg_a,
        vendor_b_id: body.vendor_b_id,
        b_gateway_mode: body.b_gateway_mode || 'manual',
        b_single_gateway: body.b_single_gateway,
        b_manual_proportions: body.b_manual_proportions,
        b_bubble_rate: body.b_bubble_rate ?? 1.1,
        b1_bubble_ratio: body.b1_bubble_ratio ?? null,
        vendor_c_id: body.vendor_c_id,
        c_overrides: body.c_overrides,
        vendor_d_id: body.vendor_d_id,
        d_carrier_proportions: body.d_carrier_proportions,
        exchange_rates: body.exchange_rates,
        vendor_a_id: body.vendor_a_id,
        pricing_mode: body.pricing_mode || 'segmented',
        vendor_bc_id: body.vendor_bc_id || null,
        d_pricing_model: body.d_pricing_model || 'zone_based',
        // B2 multi-leg fields
        vendor_b2_id: body.vendor_b2_id || null,
        b2_service_name: body.b2_service_name || null,
        b2_gateway_mode: body.b2_gateway_mode || null,
        b2_single_gateway: body.b2_single_gateway || null,
        b2_manual_proportions: body.b2_manual_proportions || null,
        use_median_pricing: body.use_median_pricing ?? false,
        bc_bubble_ratio: body.bc_bubble_ratio ?? 1.0,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Scenario create error:', error.message, error.details, error.hint, error.code)
      return NextResponse.json({ error: `新增方案失敗: ${error.message}` }, { status: 500 })
    }
    return NextResponse.json({ id: data.id })
  } catch (error) {
    console.error('Scenario create error (exception):', error)
    return NextResponse.json({ error: '新增方案失敗' }, { status: 500 })
  }
}
