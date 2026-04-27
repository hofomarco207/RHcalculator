import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** PATCH — update competitor rate card fields (e.g. fuel_surcharge_pct) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()
    const supabase = await createClient()

    const updateFields: Record<string, unknown> = {}
    if (body.fuel_surcharge_pct !== undefined) {
      updateFields.fuel_surcharge_pct = Number(body.fuel_surcharge_pct) || 0
    }
    if (typeof body.vendor_label === 'string') {
      updateFields.vendor_label = body.vendor_label.trim() || null
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('competitor_rate_cards')
      .update(updateFields)
      .eq('id', id)
      .select('id, fuel_surcharge_pct')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('PATCH competitor-rate-card error:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
