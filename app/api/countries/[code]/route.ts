import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const body = await request.json()
    const { name_zh, name_en, currency_code, is_active } = body

    const updateData: Record<string, unknown> = {}
    if (name_zh !== undefined) updateData.name_zh = name_zh
    if (name_en !== undefined) updateData.name_en = name_en
    if (currency_code !== undefined) updateData.currency_code = currency_code
    if (is_active !== undefined) updateData.is_active = is_active
    if (body.pricing_mode !== undefined) updateData.pricing_mode = body.pricing_mode

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('countries')
      .update(updateData)
      .eq('code', code)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Country update error:', error)
    return NextResponse.json({ error: '更新國家失敗' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const supabase = await createClient()

    // 1. Cascade: delete scenarios (references vendors + country)
    await supabase
      .from('scenarios')
      .delete()
      .eq('country_code', code)

    // 2. Cascade: delete rate cards
    await supabase
      .from('rate_cards')
      .delete()
      .eq('country_code', code)

    // 3. Cascade: delete competitor rate cards
    await supabase
      .from('competitor_rate_cards')
      .delete()
      .eq('country_code', code)

    // 4. Cascade: delete weight break datasets
    await supabase
      .from('weight_break_datasets')
      .delete()
      .eq('country_code', code)

    // 5. Cascade: delete gateways
    await supabase
      .from('gateways')
      .delete()
      .eq('country_code', code)

    // 6. Cascade: delete carriers + their rates (carrier_proportions, last_mile_rates)
    const { data: carriers } = await supabase
      .from('carriers')
      .select('id')
      .eq('country_code', code)
    if (carriers?.length) {
      const carrierIds = carriers.map(c => c.id)
      await supabase.from('carrier_proportions').delete().in('carrier_id', carrierIds)
      await supabase.from('last_mile_rates').delete().in('carrier_id', carrierIds)
    }
    await supabase
      .from('carriers')
      .delete()
      .eq('country_code', code)

    // 7. Cascade: delete vendors + their child rate tables
    const { data: vendors } = await supabase
      .from('vendors')
      .select('id')
      .eq('country_code', code)
    if (vendors?.length) {
      const vendorIds = vendors.map(v => v.id)
      await Promise.all([
        supabase.from('vendor_b_rates').delete().in('vendor_id', vendorIds),
        supabase.from('vendor_c_rates').delete().in('vendor_id', vendorIds),
        supabase.from('vendor_bc_rates').delete().in('vendor_id', vendorIds),
        supabase.from('vendor_d_config').delete().in('vendor_id', vendorIds),
        supabase.from('vendor_d_rates').delete().in('vendor_id', vendorIds),
        supabase.from('vendor_d_tiered_rates').delete().in('vendor_id', vendorIds),
        supabase.from('vendor_d_lookup_rates').delete().in('vendor_id', vendorIds),
        supabase.from('vendor_d_lookup_area_countries').delete().in('vendor_id', vendorIds),
        supabase.from('vendor_bcd_rates').delete().in('vendor_id', vendorIds),
      ])
    }
    await supabase
      .from('vendors')
      .delete()
      .eq('country_code', code)

    // 8. Delete the country itself
    const { data, error } = await supabase
      .from('countries')
      .delete()
      .eq('code', code)
      .select('*')
      .single()
    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Country delete error:', error)
    const msg = error instanceof Error ? error.message : JSON.stringify(error)
    return NextResponse.json({ error: `刪除國家失敗：${msg}` }, { status: 500 })
  }
}
