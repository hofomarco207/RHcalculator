import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('vendor_d_config')
      .select('*')
      .eq('vendor_id', id)
      .eq('is_active', true)
      .order('carrier_code')

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('D config fetch error:', error)
    return NextResponse.json({ error: '載入 D段配置失敗' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { carrier_codes } = body as { carrier_codes: string[] }

    if (!carrier_codes || !Array.isArray(carrier_codes)) {
      return NextResponse.json({ error: '未提供承運商列表' }, { status: 400 })
    }

    const supabase = await createClient()

    // Deactivate all existing
    await supabase
      .from('vendor_d_config')
      .update({ is_active: false })
      .eq('vendor_id', id)

    // Upsert active carriers
    const rows = carrier_codes.map((code) => ({
      vendor_id: id,
      carrier_code: code,
      is_active: true,
    }))

    const { error } = await supabase
      .from('vendor_d_config')
      .upsert(rows, { onConflict: 'vendor_id,carrier_code' })

    if (error) throw error
    return NextResponse.json({ success: true, count: carrier_codes.length })
  } catch (error) {
    console.error('D config save error:', error)
    return NextResponse.json({ error: '儲存 D段配置失敗' }, { status: 500 })
  }
}
