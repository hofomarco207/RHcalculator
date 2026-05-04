import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/rate-cards
 * Query params:
 *   - with_brackets=1  : include country_brackets array on each card
 *   - is_current=0     : include all versions (default: only is_current=true)
 *   - product_code     : filter to one product (combine with is_current=0 to list all its versions)
 *   - limit            : max results (default 30, max 200)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const url = new URL(request.url)
    const withBrackets = url.searchParams.get('with_brackets') === '1'
    const allVersions = url.searchParams.get('is_current') === '0'
    const productCode = url.searchParams.get('product_code')
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '30', 10) || 30, 1000)

    let query = supabase
      .from('rate_cards')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!allVersions) {
      query = query.eq('is_current', true) as typeof query
    }
    if (productCode) {
      query = query.eq('product_code', productCode) as typeof query
    }

    const { data, error } = await query
    if (error) throw error
    const cards = data ?? []

    if (cards.length === 0) {
      return NextResponse.json(cards)
    }

    // Always attach country_count (lightweight count query)
    const ids = cards.map((c) => c.id as string)
    const { data: countRows } = await supabase
      .from('rate_card_country_brackets')
      .select('rate_card_id')
      .in('rate_card_id', ids)

    const countMap = new Map<string, number>()
    for (const row of countRows ?? []) {
      const r = row as { rate_card_id: string }
      countMap.set(r.rate_card_id, (countMap.get(r.rate_card_id) ?? 0) + 1)
    }
    const cardsWithCount = cards.map((c) => ({ ...c, country_count: countMap.get(c.id as string) ?? 0 }))

    if (!withBrackets) {
      return NextResponse.json(cardsWithCount)
    }

    // Attach country brackets
    const { data: brackets, error: bErr } = await supabase
      .from('rate_card_country_brackets')
      .select('*')
      .in('rate_card_id', ids)
      .order('country_name_en')

    if (bErr) throw bErr

    const bracketsByCard = new Map<string, unknown[]>()
    for (const b of brackets ?? []) {
      const b_ = b as { rate_card_id: string }
      const arr = bracketsByCard.get(b_.rate_card_id) ?? []
      arr.push(b)
      bracketsByCard.set(b_.rate_card_id, arr)
    }

    const enriched = cardsWithCount.map((c) => ({
      ...c,
      country_brackets: bracketsByCard.get(c.id as string) ?? [],
    }))

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('GET rate-cards error:', error)
    return NextResponse.json({ error: '載入失敗' }, { status: 500 })
  }
}

/**
 * POST /api/rate-cards
 * Body:
 *   {
 *     product_name: string,
 *     product_code?: string,          // auto-generated if omitted
 *     scenario_id?: string,
 *     source?: 'scenario' | 'manual', // default 'scenario'
 *     currency?: string,              // default 'HKD'
 *     fuel_surcharge_pct?: number,
 *     weight_step?: number,
 *     country_brackets: Array<{
 *       country_code: string,
 *       country_name_en: string,
 *       country_name_zh?: string,
 *       brackets: Array<{ weight_min, weight_max, rate_per_kg, reg_fee, cost_hkd? }>,
 *     }>,
 *   }
 *
 * Versioning: if a card with the same product_code exists, increments version and
 * sets valid_to=today on the previous current version.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      product_name,
      product_code: rawCode,
      scenario_id,
      source = 'scenario',
      currency = 'HKD',
      fuel_surcharge_pct = 0,
      weight_step = 0,
      country_brackets,
    } = body as {
      product_name: string
      product_code?: string
      scenario_id?: string
      source?: 'scenario' | 'manual'
      currency?: string
      fuel_surcharge_pct?: number
      weight_step?: number
      country_brackets: Array<{
        country_code: string
        country_name_en: string
        country_name_zh?: string | null
        brackets: Array<{
          weight_min: number
          weight_max: number
          rate_per_kg: number
          reg_fee: number
          cost_hkd?: number
        }>
      }>
    }

    if (!product_name?.trim()) {
      return NextResponse.json({ error: 'product_name required' }, { status: 400 })
    }
    if (!country_brackets?.length) {
      return NextResponse.json({ error: 'country_brackets required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)

    // Auto-generate product_code if not provided
    const product_code =
      rawCode?.trim() ||
      product_name
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9-]/g, '')
        .slice(0, 40) || 'RC'

    // Find latest version for this product_code
    const { data: existing } = await supabase
      .from('rate_cards')
      .select('version')
      .eq('product_code', product_code)
      .order('version', { ascending: false })
      .limit(1)

    const prevVersion = (existing?.[0]?.version as number | undefined) ?? 0
    const nextVersion = prevVersion + 1

    // Deactivate previous current version
    if (prevVersion > 0) {
      await supabase
        .from('rate_cards')
        .update({ valid_to: today })
        .eq('product_code', product_code)
        .is('valid_to', null)
    }

    // Insert new rate card
    const { data: card, error: cardErr } = await supabase
      .from('rate_cards')
      .insert({
        product_code,
        product_name: product_name.trim(),
        scenario_id: scenario_id ?? null,
        source,
        currency,
        fuel_surcharge_pct,
        weight_step,
        version: nextVersion,
        valid_from: today,
        valid_to: null,
        is_current: true,
      })
      .select('id')
      .single()

    if (cardErr) throw cardErr

    // Insert country brackets
    const bracketRows = country_brackets.map((cb) => ({
      rate_card_id: card.id,
      country_code: cb.country_code,
      country_name_en: cb.country_name_en,
      country_name_zh: cb.country_name_zh ?? null,
      brackets: cb.brackets,
    }))

    const { error: bErr } = await supabase.from('rate_card_country_brackets').insert(bracketRows)
    if (bErr) throw bErr

    return NextResponse.json({ id: card.id, version: nextVersion, country_count: bracketRows.length })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '儲存失敗'
    console.error('POST rate-cards error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
