import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { BSurcharge } from '@/types/vendor'

/**
 * PATCH /api/vendors/[id]/b-rates/[rateId]
 *
 * Inline edit of a single B段 rate row. Does NOT bump version — updates in place.
 * When `surcharges` is present in the body, the update is broadcast to all rows
 * sharing (vendor_id, service_name, gateway_code) so the 3 weight tiers under a
 * service+gateway keep a consistent surcharge definition.
 *
 * Accepted fields: rate_per_kg, bubble_ratio, currency, transit_days, frequency,
 * flights_per_week, routing, service_type, airline, notes, surcharges,
 * additional_surcharge.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rateId: string }> },
) {
  try {
    const { id, rateId } = await params
    const body = await request.json() as Record<string, unknown>

    const supabase = await createClient()

    // Load the target row (must belong to this vendor and still be current)
    const { data: target, error: fetchErr } = await supabase
      .from('vendor_b_rates')
      .select('id, vendor_id, service_name, gateway_code, is_current')
      .eq('id', rateId)
      .eq('vendor_id', id)
      .single()

    if (fetchErr || !target) {
      return NextResponse.json({ error: '費率不存在或不屬於此供應商' }, { status: 404 })
    }

    if (!target.is_current) {
      return NextResponse.json({ error: '不能編輯歷史版本' }, { status: 400 })
    }

    // Build update payload from allowed fields only
    const ALLOWED = [
      'rate_per_kg', 'bubble_ratio', 'currency', 'transit_days', 'frequency',
      'flights_per_week', 'routing', 'service_type', 'airline', 'notes',
      'additional_surcharge',
    ] as const
    const updates: Record<string, unknown> = {}
    for (const k of ALLOWED) {
      if (k in body) updates[k] = body[k]
    }

    const hasSurcharges = 'surcharges' in body
    const surcharges = hasSurcharges
      ? (Array.isArray(body.surcharges) ? body.surcharges as BSurcharge[] : [])
      : null

    if (Object.keys(updates).length === 0 && !hasSurcharges) {
      return NextResponse.json({ error: '未提供任何可更新欄位' }, { status: 400 })
    }

    // 1) Update just this row with scalar fields
    if (Object.keys(updates).length > 0) {
      const { error: updErr } = await supabase
        .from('vendor_b_rates')
        .update(updates)
        .eq('id', rateId)
      if (updErr) throw updErr
    }

    // 2) Broadcast surcharges to all rows sharing (vendor_id, service_name, gateway_code)
    //    that are still current. This keeps the 3 weight tiers in sync.
    let broadcastCount = 0
    if (hasSurcharges) {
      const query = supabase
        .from('vendor_b_rates')
        .update({ surcharges })
        .eq('vendor_id', id)
        .eq('gateway_code', target.gateway_code)
        .eq('is_current', true)

      // service_name may be null; PostgREST treats `.eq('col', null)` wrong, so use .is for null
      const { data: broadcast, error: bcErr } =
        target.service_name == null
          ? await query.is('service_name', null).select('id')
          : await query.eq('service_name', target.service_name).select('id')

      if (bcErr) throw bcErr
      broadcastCount = broadcast?.length ?? 0
    }

    return NextResponse.json({
      success: true,
      updated_id: rateId,
      surcharges_broadcast_count: broadcastCount,
    })
  } catch (error) {
    console.error('B rate patch error:', error)
    return NextResponse.json({ error: '更新 B段費率失敗' }, { status: 500 })
  }
}

/**
 * DELETE /api/vendors/[id]/b-rates/[rateId]
 * Hard-delete a single B段 row. Intended for removing an errant tier.
 * For version rollbacks use the snapshot endpoint instead.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; rateId: string }> },
) {
  try {
    const { id, rateId } = await params
    const supabase = await createClient()

    const { error } = await supabase
      .from('vendor_b_rates')
      .delete()
      .eq('id', rateId)
      .eq('vendor_id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('B rate delete error:', error)
    return NextResponse.json({ error: '刪除 B段費率失敗' }, { status: 500 })
  }
}
