import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeDistributions } from '@/lib/calculations/zones'
import type { GatewayCode, ZipZoneMapping, HistoricalShipment } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { batch_ids: string[] }
    const { batch_ids } = body

    if (!batch_ids || batch_ids.length === 0) {
      return NextResponse.json({ error: '請選擇至少一個批次' }, { status: 400 })
    }

    const supabase = await createClient()

    // Fetch shipments for the selected batches
    const { data: shipmentRows, error: shipmentsErr } = await supabase
      .from('historical_shipments')
      .select('*')
      .in('batch_id', batch_ids)

    if (shipmentsErr) throw shipmentsErr

    const shipments = (shipmentRows ?? []) as HistoricalShipment[]

    if (shipments.length === 0) {
      return NextResponse.json({ error: '選定批次中無出貨記錄' }, { status: 404 })
    }

    // Fetch all zip→zone mappings
    const { data: zoneMappingRows, error: zoneErr } = await supabase
      .from('zip_zone_mapping')
      .select('*')

    if (zoneErr) throw zoneErr

    const zoneMappings = (zoneMappingRows ?? []) as ZipZoneMapping[]

    // Compute distributions
    const distributions = computeDistributions(
      shipments.map((s) => ({ ...s, gateway: s.gateway as GatewayCode })),
      zoneMappings
    )

    // Upsert into computed_distributions using the first batch_id as reference
    const refBatchId = batch_ids[0]
    const { error: upsertErr } = await supabase
      .from('computed_distributions')
      .upsert(
        { batch_id: refBatchId, ...distributions },
        { onConflict: 'batch_id' }
      )

    if (upsertErr) throw upsertErr

    return NextResponse.json({ success: true, distributions, batch_id: refBatchId, record_count: shipments.length })
  } catch (error) {
    console.error('POST /api/data/shipments/compute error:', error)
    return NextResponse.json({ error: '計算失敗' }, { status: 500 })
  }
}
