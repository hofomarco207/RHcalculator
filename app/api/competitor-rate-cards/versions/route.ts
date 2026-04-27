import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/competitor-rate-cards/versions
 * Returns version metadata grouped by (competitor_name, service_code).
 *
 * Response shape:
 *   [{
 *     competitor_name, service_code, product_name_zh?, versions: [
 *       { version, valid_from, valid_to, is_current, source_file, country_count, first_created_at }
 *     ]
 *   }]
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const competitorName = url.searchParams.get('competitor_name')
    const serviceCode = url.searchParams.get('service_code')
    const supabase = await createClient()

    let query = supabase
      .from('competitor_rate_cards')
      .select('competitor_name, service_code, vendor_label, version, valid_from, valid_to, is_current, source_file, created_at')
      .order('competitor_name')
      .order('service_code')
      .order('version', { ascending: false })

    if (competitorName) query = query.eq('competitor_name', competitorName) as typeof query
    if (serviceCode) query = query.eq('service_code', serviceCode) as typeof query

    const { data, error } = await query
    if (error) throw error

    // Aggregate
    type Row = {
      competitor_name: string
      service_code: string
      vendor_label: string | null
      version: number
      valid_from: string | null
      valid_to: string | null
      is_current: boolean
      source_file: string | null
      created_at: string
    }
    const groups = new Map<string, {
      competitor_name: string
      service_code: string
      vendor_label: string | null
      versions: Map<number, {
        version: number
        valid_from: string | null
        valid_to: string | null
        is_current: boolean
        source_file: string | null
        country_count: number
        first_created_at: string
      }>
    }>()

    for (const r of (data ?? []) as Row[]) {
      const key = `${r.competitor_name}||${r.service_code}`
      let g = groups.get(key)
      if (!g) {
        g = {
          competitor_name: r.competitor_name,
          service_code: r.service_code,
          vendor_label: r.vendor_label,
          versions: new Map(),
        }
        groups.set(key, g)
      }
      // Prefer a non-null vendor_label at any version
      if (!g.vendor_label && r.vendor_label) g.vendor_label = r.vendor_label
      let v = g.versions.get(r.version)
      if (!v) {
        v = {
          version: r.version,
          valid_from: r.valid_from,
          valid_to: r.valid_to,
          is_current: r.is_current,
          source_file: r.source_file,
          country_count: 0,
          first_created_at: r.created_at,
        }
        g.versions.set(r.version, v)
      }
      v.country_count += 1
      if (r.created_at < v.first_created_at) v.first_created_at = r.created_at
    }

    const result = [...groups.values()].map((g) => ({
      competitor_name: g.competitor_name,
      service_code: g.service_code,
      vendor_label: g.vendor_label,
      versions: [...g.versions.values()].sort((a, b) => b.version - a.version),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET competitor-rate-cards/versions error:', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
