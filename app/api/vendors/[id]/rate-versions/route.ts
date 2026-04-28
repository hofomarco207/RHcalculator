import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/vendors/[id]/rate-versions?table=vendor_b_rates
 * Returns distinct version entries for a vendor in a rate table.
 * Each entry: { version, valid_from, valid_to, is_current, count }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const table = request.nextUrl.searchParams.get('table')
    if (!table) {
      return NextResponse.json({ error: 'Missing table param' }, { status: 400 })
    }

    const allowedTables = [
      'vendor_b_rates', 'vendor_c_rates', 'vendor_bc_rates',
      'vendor_d_rates', 'vendor_d_tiered_rates', 'vendor_d_lookup_rates',
    ]
    if (!allowedTables.includes(table)) {
      return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Get all records for this vendor, grouped by version
    const { data, error } = await supabase
      .from(table)
      .select('version, valid_from, valid_to, is_current, created_at')
      .eq('vendor_id', id)
      .order('version', { ascending: false })

    if (error) throw error

    // Group by version
    const versionMap = new Map<number, {
      version: number
      valid_from: string | null
      valid_to: string | null
      is_current: boolean
      count: number
      created_at: string | null
    }>()

    for (const row of (data ?? [])) {
      const v = row.version ?? 0
      if (!versionMap.has(v)) {
        versionMap.set(v, {
          version: v,
          valid_from: row.valid_from,
          valid_to: row.valid_to,
          is_current: row.is_current ?? false,
          count: 1,
          created_at: row.created_at,
        })
      } else {
        versionMap.get(v)!.count++
        // Use earliest created_at and is_current from any row
        if (row.is_current) versionMap.get(v)!.is_current = true
      }
    }

    const versions = [...versionMap.values()].sort((a, b) => b.version - a.version)

    return NextResponse.json(versions)
  } catch (error) {
    console.error('Rate versions fetch error:', error)
    return NextResponse.json({ error: '載入版本資訊失敗' }, { status: 500 })
  }
}
