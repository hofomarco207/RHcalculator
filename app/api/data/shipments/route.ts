import { NextRequest, NextResponse } from 'next/server'
import { read, utils } from 'xlsx'
import { createAdminClient } from '@/lib/supabase/server'

const VALID_GATEWAYS = ['LAX', 'JFK', 'ORD', 'DFW', 'MIA']

// GET — list all import batches
export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('import_batches')
      .select('id, filename, record_count, date_start, date_end, status, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ batches: data ?? [] })
  } catch (error) {
    console.error('GET /api/data/shipments error:', error)
    return NextResponse.json({ error: '載入失敗' }, { status: 500 })
  }
}

// POST — upload Excel with field mapping, create batch + insert records
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const mappingRaw = formData.get('mapping') as string | null

    if (!file) return NextResponse.json({ error: '未上傳文件' }, { status: 400 })
    if (!mappingRaw) return NextResponse.json({ error: '未提供欄位對應' }, { status: 400 })

    const mapping: Record<string, string> = JSON.parse(mappingRaw)
    const customerId = (formData.get('customer_id') as string | null) || null
    const shipDate = (formData.get('ship_date') as string | null) || null

    const buffer = await file.arrayBuffer()
    const wb = read(buffer, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = utils.sheet_to_json<Record<string, unknown>>(sheet)

    // Transform columns using user's mapping
    const shipments = rows
      .map((row) => {
        const gateway = mapping.gateway && mapping.gateway !== '_none'
          ? String(row[mapping.gateway] ?? '').toUpperCase().trim()
          : ''
        const zip_code = mapping.zip_code && mapping.zip_code !== '_none'
          ? String(row[mapping.zip_code] ?? '').trim()
          : ''
        const weight_kg = mapping.weight_kg && mapping.weight_kg !== '_none'
          ? parseFloat(String(row[mapping.weight_kg] ?? 0))
          : NaN
        const carrier = mapping.carrier && mapping.carrier !== '_none'
          ? String(row[mapping.carrier] ?? '').trim() || undefined
          : undefined
        const shipment_date = mapping.shipment_date && mapping.shipment_date !== '_none'
          ? String(row[mapping.shipment_date] ?? '').trim() || undefined
          : undefined

        return { gateway, zip_code, weight_kg, carrier, shipment_date }
      })
      .filter((r) => VALID_GATEWAYS.includes(r.gateway) && !isNaN(r.weight_kg) && r.weight_kg > 0)

    if (shipments.length === 0) {
      return NextResponse.json(
        { error: '未能解析任何有效出貨記錄，請確認欄位對應是否正確，gateway 須為 LAX/JFK/ORD/DFW/MIA，weight_kg 須大於 0' },
        { status: 400 }
      )
    }

    // Compute date range
    const dates = shipments
      .map((s) => s.shipment_date)
      .filter((d): d is string => !!d)
      .sort()
    const date_start = dates[0] ?? null
    const date_end = dates[dates.length - 1] ?? null

    const supabase = createAdminClient()

    // Create batch record
    const { data: batch, error: batchError } = await supabase
      .from('import_batches')
      .insert({
        filename: file.name,
        record_count: shipments.length,
        date_start,
        date_end,
        status: 'imported',
      })
      .select()
      .single()

    if (batchError) throw batchError

    // Insert shipment records in chunks of 500
    const CHUNK = 500
    for (let i = 0; i < shipments.length; i += CHUNK) {
      const chunk = shipments.slice(i, i + CHUNK).map((s) => ({
        ...s,
        batch_id: batch.id,
        ...(customerId ? { customer_id: customerId } : {}),
        ...(shipDate ? { ship_date: shipDate } : {}),
      }))
      const { error } = await supabase.from('historical_shipments').insert(chunk)
      if (error) throw error
    }

    return NextResponse.json({ success: true, batch_id: batch.id, record_count: shipments.length })
  } catch (error) {
    console.error('POST /api/data/shipments error:', error)
    return NextResponse.json({ error: '匯入失敗，請檢查文件格式' }, { status: 500 })
  }
}

// DELETE — delete a batch and all its shipments + computed distributions
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const batch_id = searchParams.get('batch_id')
    if (!batch_id) return NextResponse.json({ error: '缺少 batch_id' }, { status: 400 })

    const supabase = createAdminClient()

    // Delete shipments first (FK constraint)
    const { error: shipmentsErr } = await supabase
      .from('historical_shipments')
      .delete()
      .eq('batch_id', batch_id)
    if (shipmentsErr) throw shipmentsErr

    // Delete computed distributions for this batch
    const { error: distErr } = await supabase
      .from('computed_distributions')
      .delete()
      .eq('batch_id', batch_id)
    if (distErr) throw distErr

    // Delete the batch itself
    const { error: batchErr } = await supabase
      .from('import_batches')
      .delete()
      .eq('id', batch_id)
    if (batchErr) throw batchErr

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/data/shipments error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
