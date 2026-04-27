import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deactivateCurrentRates, getNextVersion } from '@/lib/supabase/query-helpers'

/**
 * POST /api/vendors/[id]/b-rates/snapshot
 *
 * Snapshot current active B段 rates as a new version. Duplicates all
 * `is_current = true` rows, bumps `version`, sets `valid_from = today`,
 * then marks the old rows as historical (`valid_to = today`, `is_current = false`).
 *
 * Used by the "📸 存成新版本" button in RateVersionBar — lets Marco freeze
 * the current state before further inline edits so old prices remain queryable.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Fetch current active rows
    const { data: current, error: fetchErr } = await supabase
      .from('vendor_b_rates')
      .select('*')
      .eq('vendor_id', id)
      .eq('is_current', true)

    if (fetchErr) throw fetchErr
    if (!current || current.length === 0) {
      return NextResponse.json({ error: '無當前費率可存版' }, { status: 400 })
    }

    const nextVersion = await getNextVersion(supabase, 'vendor_b_rates', id)
    const today = new Date().toISOString().split('T')[0]

    // Build new rows by copying current rows and stripping fields set by DB
    const newRows = current.map((row) => {
      const { id: _oldId, created_at: _c, ...rest } = row as Record<string, unknown>
      return {
        ...rest,
        version: nextVersion,
        valid_from: today,
        valid_to: null,
        is_current: true,
      }
    })

    // Deactivate the old rows first, then insert the new ones
    await deactivateCurrentRates(supabase, 'vendor_b_rates', id)

    const CHUNK = 500
    for (let i = 0; i < newRows.length; i += CHUNK) {
      const chunk = newRows.slice(i, i + CHUNK)
      const { error } = await supabase.from('vendor_b_rates').insert(chunk)
      if (error) throw error
    }

    return NextResponse.json({
      success: true,
      version: nextVersion,
      count: newRows.length,
    })
  } catch (error) {
    console.error('B rates snapshot error:', error)
    return NextResponse.json({ error: '存版失敗' }, { status: 500 })
  }
}
