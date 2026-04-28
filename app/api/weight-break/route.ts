import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/weight-break?country_code=US
export async function GET(req: NextRequest) {
  const countryCode = req.nextUrl.searchParams.get('country_code')
  const supabase = createAdminClient()

  let query = supabase
    .from('weight_break_datasets')
    .select('*')
    .order('created_at', { ascending: false })

  if (countryCode) {
    query = query.eq('country_code', countryCode)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/weight-break
// Body: { country_code, label, period?, entries: Array<{ weight_kg, order_count }> }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { country_code, label, period, entries } = body

  if (!country_code || !label || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: 'country_code, label, and entries[] required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Calculate total orders
  const totalOrders = entries.reduce((s: number, e: { order_count: number }) => s + (e.order_count || 0), 0)

  // Create dataset
  const { data: dataset, error: dsError } = await supabase
    .from('weight_break_datasets')
    .insert({ country_code, label, period: period || null, total_orders: totalOrders })
    .select()
    .single()

  if (dsError) return NextResponse.json({ error: dsError.message }, { status: 500 })

  // Insert entries
  const entryRows = entries.map((e: { weight_kg: number; order_count: number }) => ({
    dataset_id: dataset.id,
    weight_kg: e.weight_kg,
    order_count: e.order_count,
  }))

  const { error: entryError } = await supabase
    .from('weight_break_entries')
    .insert(entryRows)

  if (entryError) {
    // Clean up dataset on entry insert failure
    await supabase.from('weight_break_datasets').delete().eq('id', dataset.id)
    return NextResponse.json({ error: entryError.message }, { status: 500 })
  }

  return NextResponse.json({ id: dataset.id, total_orders: totalOrders, entries_count: entries.length })
}
