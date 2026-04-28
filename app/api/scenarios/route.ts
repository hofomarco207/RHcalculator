import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const limitParam = new URL(request.url).searchParams.get('limit')
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 500) : 50

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('scenarios')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit)

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
    const supabase = createAdminClient()

    const scenarioName = body.name || '未命名方案'
    const { data: existing } = await supabase
      .from('scenarios')
      .select('id')
      .eq('name', scenarioName)
      .limit(1)
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `同名方案「${scenarioName}」已存在，請使用不同名稱` },
        { status: 409 },
      )
    }

    const { data, error } = await supabase
      .from('scenarios')
      .insert({
        name: scenarioName,
        weekly_tickets: body.weekly_tickets,
        weekly_kg: body.weekly_kg ?? null,
        seg_a: body.seg_a,
        vendor_a_id: body.vendor_a_id ?? null,
        vendor_bc_id: body.vendor_bc_id ?? null,
        bc_bubble_ratio: body.bc_bubble_ratio ?? 1.0,
        vendor_d_id: body.vendor_d_id ?? null,
        d_competitor_name: body.d_competitor_name ?? null,
        d_service_code: body.d_service_code ?? null,
        exchange_rates: body.exchange_rates,
        pricing_mode: 'bc_combined',
      })
      .select('id')
      .single()

    if (error) {
      console.error('Scenario create error:', error.message, error.details)
      return NextResponse.json({ error: `新增方案失敗: ${error.message}` }, { status: 500 })
    }
    return NextResponse.json({ id: data.id })
  } catch (error) {
    console.error('Scenario create error (exception):', error)
    return NextResponse.json({ error: '新增方案失敗' }, { status: 500 })
  }
}
