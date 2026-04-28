import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

type Segment = 'A' | 'B' | 'C' | 'D'

const CHUNK = 500

async function importSegmentA(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  vendorId: string,
  data: Record<string, unknown>[]
): Promise<number> {
  await supabase
    .from('vendor_a_rates')
    .update({ is_current: false })
    .eq('vendor_id', vendorId)
    .eq('is_current', true)

  const rows = data.map((r) => ({
    vendor_id: vendorId,
    pickup_hkd_per_kg: r.pickup_hkd_per_kg,
    sorting_hkd_per_kg: r.sorting_hkd_per_kg,
    include_sorting: r.include_sorting ?? false,
    notes: r.notes || null,
    is_current: true,
  }))

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('vendor_a_rates').insert(rows.slice(i, i + CHUNK))
    if (error) throw error
  }

  return rows.length
}

async function importSegmentB(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  vendorId: string,
  data: Record<string, unknown>[]
): Promise<number> {
  await supabase
    .from('vendor_b_rates')
    .update({ is_current: false })
    .eq('vendor_id', vendorId)
    .eq('is_current', true)

  const rows = data.map((r) => ({
    vendor_id: vendorId,
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
    notes: r.notes || null,
    is_current: true,
  }))

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('vendor_b_rates').insert(rows.slice(i, i + CHUNK))
    if (error) throw error
  }

  return rows.length
}

async function importSegmentC(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  vendorId: string,
  data: Record<string, unknown>[]
): Promise<number> {
  await supabase
    .from('vendor_c_rates')
    .update({ is_current: false })
    .eq('vendor_id', vendorId)
    .eq('is_current', true)

  const rows = data.map((r) => ({
    vendor_id: vendorId,
    fee_type: r.fee_type,
    fee_name: r.fee_name,
    gateway_code: r.gateway_code || null,
    amount: r.amount,
    currency: r.currency || 'USD',
    min_amount: r.min_amount ?? null,
    notes: r.notes || null,
    is_current: true,
  }))

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('vendor_c_rates').insert(rows.slice(i, i + CHUNK))
    if (error) throw error
  }

  return rows.length
}

async function importSegmentD(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  vendorId: string,
  data: Record<string, unknown>[]
): Promise<number> {
  // Delete existing last_mile_rates for this vendor
  await supabase
    .from('last_mile_rates')
    .delete()
    .eq('vendor_id', vendorId)

  const rows = data.map((r) => ({
    vendor_id: vendorId,
    carrier: r.carrier,
    zone: r.zone,
    weight_oz_min: r.weight_oz_min,
    weight_oz_max: r.weight_oz_max,
    price_usd: r.price_usd,
  }))

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('last_mile_rates').insert(rows.slice(i, i + CHUNK))
    if (error) throw error
  }

  return rows.length
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { segment, data } = body as { segment: Segment; data: Record<string, unknown>[] }

    if (!segment || !['A', 'B', 'C', 'D'].includes(segment)) {
      return NextResponse.json({ error: '無效的段別（必須為 A / B / C / D）' }, { status: 400 })
    }

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: '未提供資料或資料為空' }, { status: 400 })
    }

    const supabase = createAdminClient()

    let count = 0
    switch (segment) {
      case 'A':
        count = await importSegmentA(supabase, id, data)
        break
      case 'B':
        count = await importSegmentB(supabase, id, data)
        break
      case 'C':
        count = await importSegmentC(supabase, id, data)
        break
      case 'D':
        count = await importSegmentD(supabase, id, data)
        break
    }

    return NextResponse.json({ success: true, count })
  } catch (error) {
    console.error('Vendor import error:', error)
    return NextResponse.json(
      { error: `匯入失敗：${error instanceof Error ? error.message : '未知錯誤'}` },
      { status: 500 }
    )
  }
}
