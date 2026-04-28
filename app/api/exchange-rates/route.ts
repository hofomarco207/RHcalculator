import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { DEFAULT_EXCHANGE_RATES } from '@/types'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('exchange_rates')
      .select('*')
      .eq('is_current', true)
      .limit(1)
      .single()

    if (error || !data) {
      return NextResponse.json(DEFAULT_EXCHANGE_RATES)
    }
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(DEFAULT_EXCHANGE_RATES)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = createAdminClient()

    // Get current rates row
    const { data: current } = await supabase
      .from('exchange_rates')
      .select('id')
      .eq('is_current', true)
      .limit(1)
      .single()

    if (!current) {
      // Insert new row if none exists
      const { error } = await supabase
        .from('exchange_rates')
        .insert({ ...DEFAULT_EXCHANGE_RATES, ...body, is_current: true })
      if (error) throw error
    } else {
      // Update existing
      const { error } = await supabase
        .from('exchange_rates')
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq('id', current.id)
      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Exchange rate update error:', error)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}
