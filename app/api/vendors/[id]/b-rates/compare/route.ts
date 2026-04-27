import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/vendors/[id]/b-rates/compare?versions=1,2,3
 * Returns B-segment rates grouped by version for side-by-side comparison.
 * If `versions` omitted → returns all versions, newest first.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const versionsParam = request.nextUrl.searchParams.get('versions')
    const supabase = await createClient()

    let query = supabase
      .from('vendor_b_rates')
      .select('*')
      .eq('vendor_id', id)

    if (versionsParam) {
      const nums = versionsParam
        .split(',')
        .map((s) => parseInt(s.trim()))
        .filter((n) => Number.isFinite(n))
      if (nums.length === 0) {
        return NextResponse.json({ error: 'Invalid versions param' }, { status: 400 })
      }
      query = query.in('version', nums)
    }

    const { data, error } = await query
      .order('version', { ascending: false })
      .order('gateway_code')
      .order('weight_tier_min_kg')

    if (error) throw error

    // Group by version
    const map = new Map<
      number,
      {
        version: number
        valid_from: string | null
        valid_to: string | null
        is_current: boolean
        rates: unknown[]
      }
    >()
    for (const r of data ?? []) {
      const v = r.version ?? 0
      if (!map.has(v)) {
        map.set(v, {
          version: v,
          valid_from: r.valid_from,
          valid_to: r.valid_to,
          is_current: r.is_current ?? false,
          rates: [],
        })
      }
      map.get(v)!.rates.push(r)
    }

    const versions = [...map.values()].sort((a, b) => b.version - a.version)
    return NextResponse.json({ versions })
  } catch (error) {
    console.error('B rates compare error:', error)
    return NextResponse.json({ error: '載入版本比較失敗' }, { status: 500 })
  }
}
