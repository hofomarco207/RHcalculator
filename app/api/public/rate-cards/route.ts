import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: cards, error } = await supabase
      .from('rate_cards')
      .select(`
        id,
        product_name,
        product_code,
        currency,
        valid_from,
        rate_card_country_brackets ( country_code, country_name_zh, country_name_en )
      `)
      .eq('is_current', true)
      .is('deleted_at', null)
      .order('product_name')

    if (error) throw error

    const result = (cards ?? []).map((c) => ({
      id: c.id,
      productName: c.product_name,
      productCode: c.product_code,
      currency: c.currency,
      validFrom: c.valid_from,
      countries: (c.rate_card_country_brackets as Array<{
        country_code: string
        country_name_zh: string | null
        country_name_en: string
      }>)
        .map((b) => ({
          code: b.country_code,
          label: b.country_name_zh || b.country_name_en,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'zh-TW')),
    }))

    return Response.json(result)
  } catch {
    return Response.json({ error: '系統錯誤' }, { status: 500 })
  }
}
