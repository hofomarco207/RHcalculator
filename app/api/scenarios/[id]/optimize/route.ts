import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { optimizeGatewayAllocation, aggregateZipDistribution } from '@/lib/calculations/optimizer'
import type { Scenario } from '@/types/scenario'
import { DEFAULT_EXCHANGE_RATES } from '@/types'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // 1. Load scenario
    const { data: scenario, error: sErr } = await supabase
      .from('scenarios')
      .select('*')
      .eq('id', id)
      .single()
    if (sErr || !scenario) {
      return NextResponse.json({ error: '找不到方案' }, { status: 404 })
    }

    const sc = scenario as Scenario
    const rates = sc.exchange_rates ?? DEFAULT_EXCHANGE_RATES
    const weeklyTickets = sc.weekly_tickets ?? 1000

    // 2. Load zip distribution from historical shipments
    // Paginate to handle large datasets
    let allShipments: Array<{ zip_code: string; weight_kg: number }> = []
    let offset = 0
    const PAGE = 1000

    while (true) {
      const { data } = await supabase
        .from('historical_shipments')
        .select('zip_code, weight_kg')
        .range(offset, offset + PAGE - 1)
      if (!data || data.length === 0) break
      allShipments = allShipments.concat(data)
      if (data.length < PAGE) break
      offset += PAGE
    }

    // If no historical shipments, try to generate from zip_zone_mapping
    if (allShipments.length === 0) {
      // Use zip zone mapping prefixes as proxy — each prefix gets equal weight
      const { data: mappings } = await supabase
        .from('zip_zone_mapping')
        .select('zip_prefix')
        .eq('carrier', 'GOFO')
        .eq('gateway', 'LAX')
        .limit(2000)

      if (mappings && mappings.length > 0) {
        allShipments = mappings.map((m) => ({
          zip_code: m.zip_prefix,
          weight_kg: 1.2, // default avg weight
        }))
      }
    }

    const zipGroups = aggregateZipDistribution(allShipments)
    console.log(`Optimizer: ${allShipments.length} shipments → ${zipGroups.length} zip groups`)

    // 3. Load vendor data
    const [bRatesRes, lmRatesRes, zmRes] = await Promise.all([
      sc.vendor_b_id
        ? supabase.from('vendor_b_rates').select('*').eq('vendor_id', sc.vendor_b_id).eq('is_current', true)
        : Promise.resolve({ data: [] }),
      (() => {
        // Override PostgREST's default 1000-row limit — US vendor alone has 1344 rows
        // across GOFO/UNI/USPS; without this, USPS heavy-weight rows get cut off.
        const q = supabase.from('last_mile_rates').select('*').limit(10000)
        return sc.vendor_d_id ? q.eq('vendor_id', sc.vendor_d_id) : q
      })(),
      supabase.from('zip_zone_mapping').select('carrier, gateway, zip_prefix, zone, zone_raw'),
    ])

    // Build carrier mix
    const carrierMix = sc.d_carrier_proportions ?? [
      { carrier: 'GOFO', pct: 0.4 },
      { carrier: 'USPS', pct: 0.5 },
      { carrier: 'OSM', pct: 0.1 },
    ]

    // Determine available gateways from B rates
    const availableGateways = [...new Set(
      (bRatesRes.data ?? []).map((r: { gateway_code: string }) => r.gateway_code)
    )].sort()

    // 4. Run optimization
    const result = optimizeGatewayAllocation(
      zipGroups,
      bRatesRes.data ?? [],
      lmRatesRes.data ?? [],
      zmRes.data ?? [],
      carrierMix,
      rates,
      availableGateways,
      sc.b_bubble_rate ?? 1.1,
      weeklyTickets
    )

    // 5. Update scenario with optimized allocation
    const { error: updateErr } = await supabase
      .from('scenarios')
      .update({
        b_gateway_mode: 'optimized',
        b_manual_proportions: result.allocation,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateErr) console.error('Failed to save optimized allocation:', updateErr)

    return NextResponse.json({
      ...result,
      zipGroupCount: zipGroups.length,
      shipmentCount: allShipments.length,
    })
  } catch (error) {
    console.error('Optimization error:', error)
    return NextResponse.json({ error: '優化計算失敗' }, { status: 500 })
  }
}
