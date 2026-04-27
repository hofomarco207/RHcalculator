import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const country = searchParams.get('country') || 'US'

    const supabase = await createClient()

    const [gatewaysRes, carriersRes, countriesRes] = await Promise.all([
      supabase
        .from('gateways')
        .select('*')
        .eq('country_code', country)
        .eq('is_active', true)
        .order('code'),
      supabase
        .from('carriers')
        .select('*')
        .eq('country_code', country)
        .eq('is_active', true)
        .order('code'),
      supabase
        .from('countries')
        .select('*')
        .eq('is_active', true)
        .order('code'),
    ])

    if (gatewaysRes.error) throw gatewaysRes.error
    if (carriersRes.error) throw carriersRes.error
    if (countriesRes.error) throw countriesRes.error

    return NextResponse.json({
      gateways: gatewaysRes.data ?? [],
      carriers: carriersRes.data ?? [],
      countries: countriesRes.data ?? [],
    })
  } catch (error) {
    console.error('Lookups fetch error:', error)
    return NextResponse.json({ error: '載入基礎資料失敗' }, { status: 500 })
  }
}
