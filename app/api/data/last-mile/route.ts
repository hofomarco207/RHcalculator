import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseLastMileExcel } from '@/lib/excel/last-mile-parser'
import type { CarrierName } from '@/types'

const CHUNK_SIZE = 500

// GET: Return rate + zip-zone data for a carrier, or summary for all carriers
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const carrier = request.nextUrl.searchParams.get('carrier') as CarrierName | null
  const vendorId = request.nextUrl.searchParams.get('vendor_id')

  if (carrier) {
    // Single carrier detail
    let ratesQuery = supabase
      .from('last_mile_rates')
      .select('*')
      .eq('carrier', carrier)
      .limit(50)

    let rateCountQuery = supabase
      .from('last_mile_rates')
      .select('id', { count: 'exact', head: true })
      .eq('carrier', carrier)

    let latestRateQuery = supabase
      .from('last_mile_rates')
      .select('created_at')
      .eq('carrier', carrier)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (vendorId) {
      ratesQuery = ratesQuery.eq('vendor_id', vendorId) as typeof ratesQuery
      rateCountQuery = rateCountQuery.eq('vendor_id', vendorId) as typeof rateCountQuery
      latestRateQuery = supabase
        .from('last_mile_rates')
        .select('created_at')
        .eq('carrier', carrier)
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    }

    const [ratesRes, zipRes] = await Promise.all([
      ratesQuery,
      supabase
        .from('zip_zone_mapping')
        .select('*')
        .eq('carrier', carrier)
        .limit(10),
    ])

    if (ratesRes.error) return NextResponse.json({ error: ratesRes.error.message }, { status: 500 })
    if (zipRes.error) return NextResponse.json({ error: zipRes.error.message }, { status: 500 })

    // Count totals + latest import date
    const [rateCountRes, zipCountRes, latestRateRes] = await Promise.all([
      rateCountQuery,
      supabase
        .from('zip_zone_mapping')
        .select('id', { count: 'exact', head: true })
        .eq('carrier', carrier),
      latestRateQuery,
    ])

    return NextResponse.json({
      carrier,
      rate_count: rateCountRes.count ?? 0,
      rate_sample: ratesRes.data ?? [],
      zip_zone_count: zipCountRes.count ?? 0,
      zip_zone_sample: zipRes.data ?? [],
      last_imported_at: latestRateRes.data?.created_at ?? null,
    })
  }

  // Summary for all carriers — query distinct carrier codes from DB
  const { data: distinctCarriers } = await supabase
    .from('last_mile_rates')
    .select('carrier')
  const carrierCodes = [...new Set((distinctCarriers ?? []).map((r: { carrier: string }) => r.carrier))]

  const summaries = await Promise.all(
    carrierCodes.map(async (c) => {
      let rateQuery = supabase
        .from('last_mile_rates')
        .select('id', { count: 'exact', head: true })
        .eq('carrier', c)

      if (vendorId) {
        rateQuery = rateQuery.eq('vendor_id', vendorId) as typeof rateQuery
      }

      const [rateRes, zipRes] = await Promise.all([
        rateQuery,
        supabase
          .from('zip_zone_mapping')
          .select('id', { count: 'exact', head: true })
          .eq('carrier', c),
      ])
      return {
        carrier: c,
        rate_count: rateRes.count ?? 0,
        zip_zone_count: zipRes.count ?? 0,
      }
    })
  )

  return NextResponse.json({ summaries })
}

// POST: Import last-mile Excel file
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const carriersParam = formData.get('carriers') as string | null
    const vendorId = formData.get('vendor_id') as string | null

    if (!file) return NextResponse.json({ error: '未上傳文件' }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const parsed = parseLastMileExcel(buffer)

    const selectedCarriers = carriersParam
      ? (carriersParam.split(',').map(c => c.trim()) as CarrierName[])
      : null

    const supabase = await createClient()
    const results: { carrier: CarrierName; rates_imported: number; zip_zones_imported: number }[] = []

    // Process each carrier's rates
    for (const rateGroup of parsed.rates) {
      const { carrier, rows } = rateGroup
      if (selectedCarriers && !selectedCarriers.includes(carrier)) continue

      // Delete existing rates (scoped to vendor if provided)
      let deleteQuery = supabase.from('last_mile_rates').delete().eq('carrier', carrier)
      if (vendorId) {
        deleteQuery = deleteQuery.eq('vendor_id', vendorId) as typeof deleteQuery
      }
      await deleteQuery

      // Attach vendor_id to each row if provided
      const rowsToInsert = vendorId
        ? rows.map((r) => ({ ...r, vendor_id: vendorId }))
        : rows

      // Insert in chunks
      let inserted = 0
      for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
        const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE)
        const { error } = await supabase.from('last_mile_rates').insert(chunk)
        if (error) throw new Error(`Failed to insert rates for ${carrier}: ${error.message}`)
        inserted += chunk.length
      }

      // Find matching zip-zone entry or create a placeholder
      const zipGroup = parsed.zipZones.find(z => z.carrier === carrier)
      const zipInserted = await insertZipZones(supabase, carrier, zipGroup?.rows ?? [], selectedCarriers)

      results.push({ carrier, rates_imported: inserted, zip_zones_imported: zipInserted })
    }

    // Process carriers that only have zip-zones (no rates)
    for (const zipGroup of parsed.zipZones) {
      const { carrier } = zipGroup
      if (selectedCarriers && !selectedCarriers.includes(carrier)) continue
      if (results.find(r => r.carrier === carrier)) continue

      const zipInserted = await insertZipZones(supabase, carrier, zipGroup.rows, selectedCarriers)
      results.push({ carrier, rates_imported: 0, zip_zones_imported: zipInserted })
    }

    return NextResponse.json({
      success: true,
      results,
      sheets: parsed.sheets,
    })
  } catch (error) {
    console.error('Last-mile import error:', error)
    const msg = error instanceof Error ? error.message : '匯入失敗'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function insertZipZones(
  supabase: Awaited<ReturnType<typeof createClient>>,
  carrier: CarrierName,
  rows: { carrier: CarrierName; gateway: string; zip_prefix: string; zone: number; zone_raw: string }[],
  selectedCarriers: CarrierName[] | null
): Promise<number> {
  if (selectedCarriers && !selectedCarriers.includes(carrier)) return 0

  if (rows.length === 0) return 0

  await supabase.from('zip_zone_mapping').delete().eq('carrier', carrier)

  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from('zip_zone_mapping').insert(chunk)
    if (error) throw new Error(`Failed to insert zip zones for ${carrier}: ${error.message}`)
    inserted += chunk.length
  }
  return inserted
}
