import type {
  HistoricalShipment,
  ZipZoneMapping,
  GatewayCode,
  CarrierName,
  ComputedDistributions,
} from '@/types'
import { WEIGHT_BRACKETS, US_CARRIERS } from '@/types'

/**
 * Compute port proportions, weight distribution, and zone distribution
 * from historical shipment data.
 */
export function computeDistributions(
  shipments: (HistoricalShipment & { gateway: GatewayCode })[],
  zoneMappings: ZipZoneMapping[]
): Omit<ComputedDistributions, 'id' | 'batch_id' | 'computed_at'> {
  const total = shipments.length
  if (total === 0) {
    return {
      port_proportions: {},
      weight_distribution: [],
      zone_distribution: {},
    }
  }

  // ── Port proportions ──────────────────────────────────────────────────────
  const portCounts: Partial<Record<GatewayCode, number>> = {}
  for (const s of shipments) {
    portCounts[s.gateway] = (portCounts[s.gateway] ?? 0) + 1
  }
  const port_proportions: Partial<Record<GatewayCode, number>> = {}
  for (const [gw, count] of Object.entries(portCounts) as [GatewayCode, number][]) {
    port_proportions[gw] = count / total
  }

  // ── Weight distribution ───────────────────────────────────────────────────
  const bracketCounts: Record<string, number> = {}
  for (const bracket of WEIGHT_BRACKETS) {
    bracketCounts[bracket.range] = 0
  }
  for (const s of shipments) {
    const bracket = WEIGHT_BRACKETS.find(
      (b) => s.weight_kg > b.min && s.weight_kg <= b.max
    )
    if (bracket) {
      bracketCounts[bracket.range] = (bracketCounts[bracket.range] ?? 0) + 1
    }
  }
  const weight_distribution = WEIGHT_BRACKETS.map((b) => ({
    bracket: b.range,
    weight_min: b.min,
    weight_max: b.max,
    proportion: (bracketCounts[b.range] ?? 0) / total,
    ticket_count: bracketCounts[b.range] ?? 0,
  }))

  // ── Zone distribution per carrier per gateway ─────────────────────────────
  const zone_distribution: ComputedDistributions['zone_distribution'] = {}

  // Build a zip→zone lookup: carrier → gateway → zip → zone
  type ZoneLookup = Record<CarrierName, Partial<Record<GatewayCode, Record<string, number>>>>
  const zoneLookup: ZoneLookup = {} as ZoneLookup
  for (const m of zoneMappings) {
    const carrier = m.carrier as CarrierName
    const gw = m.gateway as GatewayCode
    if (!zoneLookup[carrier]) zoneLookup[carrier] = {}
    if (!zoneLookup[carrier][gw]) zoneLookup[carrier][gw] = {}
    zoneLookup[carrier][gw]![m.zip_prefix] = m.zone
  }

  const carriers: CarrierName[] = [...US_CARRIERS]
  for (const carrier of carriers) {
    const carrierLookup = zoneLookup[carrier]
    if (!carrierLookup) continue

    zone_distribution[carrier] = {}
    const gateways = Object.keys(carrierLookup) as GatewayCode[]

    for (const gw of gateways) {
      const gwLookup = carrierLookup[gw] ?? {}
      const gwShipments = shipments.filter((s) => s.gateway === gw)
      if (gwShipments.length === 0) continue

      const zoneCounts: Record<number, number> = {}
      for (const s of gwShipments) {
        const prefix3 = s.zip_code.substring(0, 3)
        const prefix5 = s.zip_code.substring(0, 5)
        const zone = gwLookup[prefix5] ?? gwLookup[prefix3] ?? 4 // default zone 4
        zoneCounts[zone] = (zoneCounts[zone] ?? 0) + 1
      }

      const gwTotal = gwShipments.length
      const zoneProportions: Record<number, number> = {}
      for (const [zone, count] of Object.entries(zoneCounts)) {
        zoneProportions[Number(zone)] = count / gwTotal
      }
      zone_distribution[carrier]![gw] = zoneProportions
    }
  }

  return { port_proportions, weight_distribution, zone_distribution }
}
