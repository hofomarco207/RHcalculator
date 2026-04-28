import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { deactivateCurrentRates, getNextVersion } from '@/lib/supabase/query-helpers'
import type { ImportQuoteRequest } from '@/types'

/**
 * POST /api/vendors/import-quote
 *
 * Accepts the output from the price-card-interpreter Skill (Phase 3 JSON).
 * Routes each vendor_quote to the appropriate rate table based on structure_type.
 * Auto-creates vendors if not found, increments versions if found.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ImportQuoteRequest
    const { meta, vendor_quotes, cost_estimate } = body

    if (!meta || !vendor_quotes || vendor_quotes.length === 0) {
      return NextResponse.json({ error: '未提供報價數據' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const today = new Date().toISOString().split('T')[0]
    const results: Array<{ vendor_name: string; vendor_id: string; table: string; count: number; version: number }> = []

    for (const quote of vendor_quotes) {
      // Find or create vendor
      const segment = resolveSegment(quote.structure_type)
      const countryCode = meta.country_code || 'GLB'

      let vendorId: string

      const { data: existing } = await supabase
        .from('vendors')
        .select('id')
        .eq('name', quote.vendor_name)
        .eq('segment', segment)
        .eq('country_code', countryCode)
        .limit(1)

      if (existing && existing.length > 0) {
        vendorId = (existing[0] as { id: string }).id
      } else {
        const { data: created, error } = await supabase
          .from('vendors')
          .insert({
            name: quote.vendor_name,
            segment,
            country_code: countryCode,
            notes: `Auto-created from ${meta.source_file}`,
            is_active: true,
          })
          .select('id')
          .single()

        if (error || !created) {
          throw new Error(`Failed to create vendor ${quote.vendor_name}: ${error?.message}`)
        }
        vendorId = (created as { id: string }).id
      }

      // Route data to the correct table
      const table = resolveTable(quote.structure_type)
      const version = await getNextVersion(supabase, table, vendorId)
      await deactivateCurrentRates(supabase, table, vendorId)

      const data = quote.data as Record<string, unknown>
      const rows = (data.rates as Record<string, unknown>[]) ?? [data]
      const insertRows = rows.map((r) => ({
        ...r,
        vendor_id: vendorId,
        version,
        valid_from: today,
        valid_to: null,
        source: meta.source_file ? 'quote' : null,
        source_file: meta.source_file || null,
        is_current: true,
      }))

      const CHUNK = 500
      for (let i = 0; i < insertRows.length; i += CHUNK) {
        const { error } = await supabase.from(table).insert(insertRows.slice(i, i + CHUNK))
        if (error) throw new Error(`Insert into ${table} failed: ${error.message}`)
      }

      results.push({
        vendor_name: quote.vendor_name,
        vendor_id: vendorId,
        table,
        count: insertRows.length,
        version,
      })
    }

    // Save cost_estimate if provided
    if (cost_estimate) {
      const { error } = await supabase.from('cost_estimates').insert({
        vendor_id: results[0]?.vendor_id || null,
        segment: meta.segment,
        country_code: meta.country_code || null,
        route_origin: meta.route?.origin || null,
        route_destination: meta.route?.destinations?.join(', ') || null,
        estimate_data: cost_estimate,
        source_file: meta.source_file || null,
        interpreted_at: today,
      })
      if (error) {
        console.error('Cost estimate save error:', error)
      }
    }

    return NextResponse.json({
      success: true,
      imports: results,
      total_vendors: results.length,
      total_records: results.reduce((sum, r) => sum + r.count, 0),
    })
  } catch (error) {
    console.error('Import quote error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '匯入報價失敗' },
      { status: 500 },
    )
  }
}

function resolveSegment(structureType: string): string {
  if (structureType.startsWith('B')) return 'B'
  if (structureType.startsWith('C')) return 'C'
  if (structureType === 'BC-1') return 'BC'
  if (structureType === 'BCD-1') return 'BCD'
  if (structureType.startsWith('D')) return 'D'
  return 'B' // fallback
}

function resolveTable(structureType: string): string {
  switch (structureType) {
    case 'B-1':
    case 'B-2':
    case 'B-3':
      return 'vendor_b_rates'
    case 'C-1':
    case 'C-2':
    case 'C-3':
      return 'vendor_c_rates'
    case 'D-1':
    case 'D-2':
    case 'D-3':
    case 'D-4':
      return 'vendor_d_rates'
    case 'D-5':
      return 'vendor_d_tiered_rates'
    case 'D-6':
      return 'vendor_d_lookup_rates'
    case 'BC-1':
      return 'vendor_bc_rates'
    case 'BCD-1':
      return 'vendor_bcd_rates'
    default:
      return 'vendor_b_rates' // fallback
  }
}
