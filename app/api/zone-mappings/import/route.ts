import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface MappingRow {
  province?: string
  city?: string
  postal_code?: string
  zip?: string
  zone?: string
  tier?: string
  risk_flag?: string
  high_risk?: boolean
}

/**
 * POST /api/zone-mappings/import
 * Bulk import zone/tier mappings for a country.
 *
 * Supports chunked upload:
 *   - First chunk: { country_code, replace: true, mappings: [...] }  ← deletes old data first
 *   - Subsequent:  { country_code, mappings: [...] }                 ← append only
 *
 * Also supports province_breakdown format (server-side expansion):
 *   { meta: { country_code }, province_breakdown: [{ province, Tier1: N, ... }] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // ── Resolve country_code ──────────────────────────────────────────
    const country_code: string = body.country_code ?? body.meta?.country_code
    if (!country_code) {
      return NextResponse.json({ error: '需要 country_code（頂層或 meta.country_code）' }, { status: 400 })
    }

    // ── Build flat rows from either format ────────────────────────────
    let rows: Array<{
      country_code: string
      province: string | null
      city: string | null
      postal_code: string | null
      zone: string
      risk_flag: string | null
    }>

    if (Array.isArray(body.mappings) && body.mappings.length > 0) {
      // Flat mappings — zone/tier and postal_code/zip are aliases
      const mappings = body.mappings as MappingRow[]
      const invalid = mappings.findIndex((m) => !m.zone && !m.tier)
      if (invalid >= 0) {
        return NextResponse.json({ error: `第 ${invalid + 1} 筆缺少 zone/tier 欄位` }, { status: 400 })
      }
      rows = mappings.map((m) => ({
        country_code,
        province: m.province || null,
        city: m.city || null,
        postal_code: m.postal_code || m.zip || null,
        zone: (m.zone || m.tier)!,
        risk_flag: m.risk_flag || (m.high_risk ? 'high_risk' : null),
      }))
    } else if (Array.isArray(body.province_breakdown) && body.province_breakdown.length > 0) {
      // Expand province_breakdown server-side
      const SKIP_KEYS = new Set(['province', 'high_risk_count', 'total', 'tiers'])
      rows = []
      for (const pb of body.province_breakdown) {
        const tierMap: Record<string, number> = pb.tiers ? { ...pb.tiers } : {}
        for (const [key, val] of Object.entries(pb)) {
          if (!SKIP_KEYS.has(key) && typeof val === 'number' && val > 0) {
            tierMap[key] = val
          }
        }
        for (const [zone, cnt] of Object.entries(tierMap)) {
          for (let i = 0; i < cnt; i++) {
            rows.push({
              country_code,
              province: pb.province || null,
              city: null,
              postal_code: null,
              zone,
              risk_flag: null,
            })
          }
        }
      }
      if (rows.length === 0) {
        return NextResponse.json({ error: 'province_breakdown 無有效資料' }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: '需要 mappings 陣列或 province_breakdown' }, { status: 400 })
    }

    const supabase = await createClient()

    // Delete existing data only when replace flag is set (first chunk)
    if (body.replace) {
      const { error: delError } = await supabase
        .from('zone_tier_mappings')
        .delete()
        .eq('country_code', country_code)
      if (delError) throw delError
    }

    // Insert in chunks of 500 (Supabase safe batch size)
    const CHUNK = 500
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error } = await supabase.from('zone_tier_mappings').insert(chunk)
      if (error) throw error
    }

    // Compute distribution from this batch
    const zoneCounts: Record<string, number> = {}
    for (const r of rows) {
      zoneCounts[r.zone] = (zoneCounts[r.zone] ?? 0) + 1
    }

    return NextResponse.json({
      success: true,
      country_code,
      inserted: rows.length,
      zone_count: Object.keys(zoneCounts).length,
      distribution: Object.fromEntries(
        Object.entries(zoneCounts).map(([z, c]) => [z, Math.round((c / rows.length) * 10000) / 10000])
      ),
    })
  } catch (error) {
    console.error('Zone mappings import error:', error)
    return NextResponse.json({ error: '匯入分區資料失敗' }, { status: 500 })
  }
}
