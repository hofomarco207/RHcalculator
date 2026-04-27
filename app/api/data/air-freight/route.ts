import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseAirFreightExcel } from '@/lib/excel/air-freight-parser'

// GET: List air freight history records
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const cargoType = request.nextUrl.searchParams.get('cargo_type') ?? '特惠带电'

  const { data, error } = await supabase
    .from('air_freight_history')
    .select('*')
    .eq('cargo_type', cargoType)
    .order('week_start', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ records: data })
}

// POST: Import air freight Excel
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const discountStr = formData.get('discount') as string | null

    if (!file) return NextResponse.json({ error: '未上傳文件' }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const parsed = parseAirFreightExcel(buffer)

    if (parsed.records.length === 0) {
      return NextResponse.json({ error: '未能解析任何有效空運報價記錄' }, { status: 400 })
    }

    const supabase = await createClient()

    // Get discount from config or form
    let discount = 0
    if (discountStr !== null) {
      discount = parseFloat(discountStr)
    } else {
      const { data: config } = await supabase
        .from('air_freight_import_config')
        .select('discount_hkd_per_kg')
        .limit(1)
        .single()
      discount = config?.discount_hkd_per_kg ?? 1.2
    }

    // Upsert records (unique on port_code + cargo_type + week_label)
    const rows = parsed.records.map(r => ({
      port_code: r.port_code,
      cargo_type: r.cargo_type,
      week_label: r.week_label,
      raw_price_hkd_per_kg: r.raw_price_hkd_per_kg,
      discount_hkd_per_kg: discount,
    }))

    const { error } = await supabase
      .from('air_freight_history')
      .upsert(rows, { onConflict: 'port_code,cargo_type,week_label' })

    if (error) throw error

    return NextResponse.json({
      success: true,
      record_count: rows.length,
      weeks: parsed.weeks,
      ports: parsed.ports,
      cargo_types: parsed.cargoTypes,
    })
  } catch (error) {
    console.error('Air freight import error:', error)
    return NextResponse.json({ error: '匯入失敗' }, { status: 500 })
  }
}
