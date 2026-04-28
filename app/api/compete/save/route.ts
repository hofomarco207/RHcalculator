import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { CompeteSaveInput } from '@/types/pricing-analysis'

export async function POST(request: NextRequest) {
  try {
    const body: CompeteSaveInput = await request.json()
    const {
      name,
      scenario_id,
      country_code,
      competitor_name,
      adjustment_pct,
      brackets,
      competitor_prices,
    } = body

    if (!name?.trim() || !scenario_id || !brackets?.length) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
    }

    // Convert compete brackets to rate_card bracket format
    const rateCardBrackets = brackets.map((b) => ({
      weight_range: b.weight_bracket,
      weight_min_kg: 0, // not tracked per-bracket in compete flow
      weight_max_kg: b.representative_weight,
      representative_weight_kg: b.representative_weight,
      cost_hkd: b.my_cost,
      freight_rate_hkd_per_kg: b.my_price / b.representative_weight,
      reg_fee_hkd: 0,
      revenue_hkd: b.my_price,
      actual_margin: b.margin_pct,
      is_manually_adjusted: b.is_manual_override,
    }))

    const metadata = {
      source_type: 'competitor_based',
      competitor_name: competitor_name || null,
      adjustment_pct,
      competitor_prices,
      manual_overrides: brackets
        .filter((b) => b.is_manual_override)
        .map((b) => ({
          weight_bracket: b.weight_bracket,
          override_price: b.my_price,
        })),
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('rate_cards')
      .insert({
        name: name.trim(),
        product_type: 'economy',
        target_margin: 0,
        brackets: rateCardBrackets,
        scenario_id,
        country_code,
        source: 'competitor',
        metadata,
      })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ id: data.id })
  } catch (error) {
    console.error('Compete save error:', error)
    return NextResponse.json({ error: '儲存失敗' }, { status: 500 })
  }
}
