import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * DELETE /api/zone-mappings/[country]
 * Remove all zone_tier_mappings for a country.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ country: string }> }
) {
  try {
    const { country } = await params
    const supabase = await createClient()

    const { error } = await supabase
      .from('zone_tier_mappings')
      .delete()
      .eq('country_code', country)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Zone mapping delete error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
