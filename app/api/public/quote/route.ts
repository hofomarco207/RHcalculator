import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const { product_code, country_code, weights } = await req.json() as {
      product_code: string
      country_code: string
      weights: number[]
    }
    if (!product_code || !country_code || !Array.isArray(weights)) {
      return Response.json({ error: '參數錯誤' }, { status: 400 })
    }

    const supabase = await createClient()

    // Find current rate card by product_code
    const { data: card } = await supabase
      .from('rate_cards')
      .select('id, product_name, product_code, currency, valid_from, fuel_surcharge_pct')
      .eq('is_current', true)
      .eq('product_code', product_code)
      .is('deleted_at', null)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (!card) {
      return Response.json({ error: '找不到對應價卡，請聯絡我們獲取最新報價' }, { status: 404 })
    }

    // Get country brackets — do NOT select cost_hkd
    const { data: cb } = await supabase
      .from('rate_card_country_brackets')
      .select('brackets, country_code')
      .eq('rate_card_id', card.id)
      .eq('country_code', country_code)
      .single()

    if (!cb) {
      return Response.json({ error: '此服務暫未覆蓋所選目的地，請聯絡我們' }, { status: 404 })
    }

    // Fetch exchange rate for HKD→TWD conversion (if needed)
    let twdPerHkd = 4.1
    if (card.currency === 'HKD') {
      const { data: rates } = await supabase
        .from('exchange_rates')
        .select('twd_hkd')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()
      if (rates?.twd_hkd) twdPerHkd = 1 / rates.twd_hkd
    }

    // Compute prices — strip cost_hkd from brackets before use
    type Bracket = { weight_min: number; weight_max: number; rate_per_kg: number; reg_fee: number }
    const brackets = (cb.brackets as Bracket[]).map(({ weight_min, weight_max, rate_per_kg, reg_fee }) => ({
      weight_min, weight_max, rate_per_kg, reg_fee,
    }))

    const prices = weights.map((w) => {
      const b = brackets.find((br) => w > br.weight_min && w <= br.weight_max)
        ?? brackets[brackets.length - 1]
      if (!b) return { weight: w, price: null }
      const raw = b.rate_per_kg * w + b.reg_fee
      const twd = card.currency === 'HKD' ? raw * twdPerHkd : raw
      return { weight: w, price: Math.round(twd) }
    })

    return Response.json({
      productName: card.product_name,
      validFrom: card.valid_from,
      prices,
    })
  } catch {
    return Response.json({ error: '系統錯誤，請稍後再試' }, { status: 500 })
  }
}
