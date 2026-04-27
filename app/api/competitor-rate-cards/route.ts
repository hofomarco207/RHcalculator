import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type CrcRow = {
  id: string
  competitor_name: string
  service_code: string
  country_code: string | null
  country_name_en: string
  country_name_zh: string
  version: number
  valid_from: string | null
  valid_to: string | null
  is_current: boolean
  [k: string]: unknown
}

/**
 * GET — list competitor rate cards.
 * Query params:
 *   - country_code: filter by country
 *   - include_history=1: include all versions (default: only `is_current = true`)
 *   - with_previous=1: annotate each current row with previous_brackets + previous_version
 *   - competitor_name, service_code: optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const countryCode = url.searchParams.get('country_code')
    const competitorName = url.searchParams.get('competitor_name')
    const serviceCode = url.searchParams.get('service_code')
    const includeHistory = url.searchParams.get('include_history') === '1'
    const withPrevious = url.searchParams.get('with_previous') === '1'
    const supabase = await createClient()

    let query = supabase
      .from('competitor_rate_cards')
      .select('*')
      .order('competitor_name')
      .order('service_code')
      .order('country_name_en')
      .order('version', { ascending: false })

    if (!includeHistory) {
      query = query.eq('is_current', true) as typeof query
    }
    if (countryCode) query = query.eq('country_code', countryCode) as typeof query
    if (competitorName) query = query.eq('competitor_name', competitorName) as typeof query
    if (serviceCode) query = query.eq('service_code', serviceCode) as typeof query

    const { data, error } = await query
    if (error) throw error

    const rows = data ?? []
    if (!withPrevious || rows.length === 0) {
      return NextResponse.json(rows)
    }

    // Fetch prior versions (version - 1) for each row in a single query.
    const pairs = new Set<string>()
    for (const r of rows as CrcRow[]) {
      pairs.add(`${r.competitor_name}||${r.service_code}`)
    }
    const prevByKey = new Map<string, { brackets: unknown; version: number; valid_from: string | null }>()
    for (const pair of pairs) {
      const [cn, sc] = pair.split('||')
      const { data: history } = await supabase
        .from('competitor_rate_cards')
        .select('competitor_name, service_code, country_name_en, version, valid_from, brackets')
        .eq('competitor_name', cn)
        .eq('service_code', sc)
        .order('version', { ascending: false })
      for (const h of (history ?? []) as Array<{
        competitor_name: string
        service_code: string
        country_name_en: string
        version: number
        valid_from: string | null
        brackets: unknown
      }>) {
        // Pick the first (highest version) that is strictly less than the current row's version
        const currentRow = (rows as CrcRow[]).find(
          (r) =>
            r.competitor_name === h.competitor_name &&
            r.service_code === h.service_code &&
            r.country_name_en === h.country_name_en,
        )
        if (!currentRow) continue
        if (h.version >= currentRow.version) continue
        const key = `${h.competitor_name}||${h.service_code}||${h.country_name_en}`
        if (prevByKey.has(key)) continue // already have a closer-to-current one (history ordered desc)
        prevByKey.set(key, { brackets: h.brackets, version: h.version, valid_from: h.valid_from })
      }
    }
    const enriched = (rows as CrcRow[]).map((r) => {
      const key = `${r.competitor_name}||${r.service_code}||${r.country_name_en}`
      const prev = prevByKey.get(key)
      return {
        ...r,
        previous_brackets: prev?.brackets ?? null,
        previous_version: prev?.version ?? null,
        previous_valid_from: prev?.valid_from ?? null,
      }
    })
    return NextResponse.json(enriched)
  } catch (error) {
    console.error('GET competitor-rate-cards error:', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}

/**
 * POST — import competitor rate cards as a new version.
 * Body: { cards: ParsedCompetitorCard[], source_file?: string, effective_date?: string }
 * Versioning policy per key = (competitor_name, service_code, country_code | country_name_en):
 *   1. Look up latest version number for the key → nextVersion = latest + 1 (or 1)
 *   2. Set valid_to = today on all existing `is_current = true` rows for that key (trigger
 *      will flip is_current to false)
 *   3. Insert new row with version = nextVersion, valid_from = effective_date ?? today,
 *      valid_to = null, is_current = true.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      cards,
      source_file,
    } = body as {
      cards: Array<{
        competitor_name: string
        service_code: string
        country_name_en: string
        country_name_zh: string
        country_code?: string
        brackets: Array<{
          weight_range: string
          weight_min: number
          weight_max: number
          rate_per_kg: number
          reg_fee: number
        }>
        pricing_formula?: string
        currency?: string
        effective_date?: string
        fuel_surcharge_pct?: number
        weight_step?: number
        vendor_label?: string
      }>
      source_file?: string
    }

    if (!cards?.length) {
      return NextResponse.json({ error: '沒有資料' }, { status: 400 })
    }

    const supabase = await createClient()

    // Validate country codes
    const { data: countries } = await supabase.from('countries').select('code')
    const validCodes = new Set((countries ?? []).map((c: { code: string }) => c.code))

    // Pre-fetch the latest version per key so we can increment without a round-trip per card.
    // Key shape: `${competitor_name}||${service_code}||${country_name_en}`.
    // We deliberately use country_name_en (not country_code) because the `countries` table
    // may change between imports, flipping the stored country_code between a valid code and
    // NULL — that would break key matching. Names are stable.
    const keyOf = (c: { competitor_name: string; service_code: string; country_name_en: string }): string =>
      `${c.competitor_name}||${c.service_code}||${c.country_name_en}`

    const neededKeys = new Set(cards.map(keyOf))
    const keyToNextVersion = new Map<string, number>()

    // Narrow the query to the affected (competitor_name, service_code) pairs
    const pairs = new Set(cards.map((c) => `${c.competitor_name}||${c.service_code}`))
    for (const pair of pairs) {
      const [cn, sc] = pair.split('||')
      const { data: existing, error: fetchErr } = await supabase
        .from('competitor_rate_cards')
        .select('competitor_name, service_code, country_code, country_name_en, version, is_current, id')
        .eq('competitor_name', cn)
        .eq('service_code', sc)
      if (fetchErr) throw fetchErr
      for (const row of (existing ?? []) as CrcRow[]) {
        const k = keyOf(row)
        if (!neededKeys.has(k)) continue
        const prev = keyToNextVersion.get(k) ?? 0
        if (row.version > prev) keyToNextVersion.set(k, row.version)
      }
    }

    // Deactivate ALL previously-current rows for the affected (competitor, service) pairs.
    // Matching by country is brittle because country_code storage depends on whether the
    // code is in the `countries` table at import time — so a code may switch between
    // "ZA" and NULL across imports, which breaks per-country matching. Deactivating the
    // whole pair keeps the invariant "only the latest version has is_current=true".
    // Countries dropped from the new import remain in history (is_current=false) and
    // are still visible via the /compare endpoint.
    const today = new Date().toISOString().slice(0, 10)
    for (const pair of pairs) {
      const [cn, sc] = pair.split('||')
      const { error } = await supabase
        .from('competitor_rate_cards')
        .update({ valid_to: today })
        .eq('competitor_name', cn)
        .eq('service_code', sc)
        .is('valid_to', null)
      if (error) console.error('deactivate error:', error.message)
    }

    // Build rows with incremented version
    const rows = cards.map((c) => {
      const k = keyOf(c)
      const nextVersion = (keyToNextVersion.get(k) ?? 0) + 1
      const code = c.country_code && validCodes.has(c.country_code) ? c.country_code : null
      return {
        competitor_name: c.competitor_name,
        service_code: c.service_code,
        country_name_en: c.country_name_en,
        country_name_zh: c.country_name_zh,
        country_code: code,
        brackets: c.brackets,
        pricing_formula: c.pricing_formula ?? 'per_kg_plus_reg',
        currency: c.currency ?? 'HKD',
        effective_date: c.effective_date || null,
        fuel_surcharge_pct: c.fuel_surcharge_pct ?? 0,
        weight_step: c.weight_step ?? 0,
        vendor_label: c.vendor_label ?? null,
        source_file: source_file ?? null,
        version: nextVersion,
        valid_from: c.effective_date || today,
        valid_to: null,
        is_current: true,
      }
    })

    const { data, error } = await supabase
      .from('competitor_rate_cards')
      .insert(rows)
      .select('id, country_name_en, version')

    if (error) {
      console.error('Supabase insert error:', error.message, error.details, error.hint)
      throw new Error(error.message)
    }
    return NextResponse.json({ imported: data?.length ?? 0 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '匯入失敗'
    console.error('POST competitor-rate-cards error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * PATCH — bulk-update a whole (competitor_name + service_code) group.
 * Currently only `vendor_label` is supported — it's display-only metadata
 * duplicated across every row of the group, so renaming needs to touch all
 * versions and all countries at once.
 * Query params: competitor_name, service_code (both required).
 * Body: { vendor_label: string | null }
 */
export async function PATCH(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const cn = url.searchParams.get('competitor_name')
    const sc = url.searchParams.get('service_code')
    if (!cn || !sc) {
      return NextResponse.json(
        { error: 'competitor_name and service_code are required' },
        { status: 400 },
      )
    }
    const body = await request.json()
    const nextLabel =
      typeof body.vendor_label === 'string'
        ? body.vendor_label.trim() || null
        : body.vendor_label === null
          ? null
          : undefined
    if (nextLabel === undefined) {
      return NextResponse.json({ error: 'vendor_label is required' }, { status: 400 })
    }
    const supabase = await createClient()
    const { error, count } = await supabase
      .from('competitor_rate_cards')
      .update({ vendor_label: nextLabel }, { count: 'exact' })
      .eq('competitor_name', cn)
      .eq('service_code', sc)
    if (error) throw error
    return NextResponse.json({ updated: count ?? 0 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '更新失敗'
    console.error('PATCH competitor-rate-cards error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * DELETE — hard-delete an entire (competitor_name + service_code) group, including all versions.
 * Query params: competitor_name, service_code (both required).
 */
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const cn = url.searchParams.get('competitor_name')
    const sc = url.searchParams.get('service_code')
    if (!cn || !sc) {
      return NextResponse.json(
        { error: 'competitor_name and service_code are required' },
        { status: 400 },
      )
    }
    const supabase = await createClient()
    const { error } = await supabase
      .from('competitor_rate_cards')
      .delete()
      .eq('competitor_name', cn)
      .eq('service_code', sc)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '刪除失敗'
    console.error('DELETE competitor-rate-cards error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
