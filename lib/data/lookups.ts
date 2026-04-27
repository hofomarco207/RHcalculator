import type { Gateway, Carrier, Country, Vendor } from '@/types'

// ─── Cached lookups (client-side) ───────────────────────────────────────────

let cachedLookups: {
  gateways: Gateway[]
  carriers: Carrier[]
  countries: Country[]
  fetchedAt: number
} | null = null

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function fetchLookups(country = 'US'): Promise<{
  gateways: Gateway[]
  carriers: Carrier[]
  countries: Country[]
}> {
  if (cachedLookups && Date.now() - cachedLookups.fetchedAt < CACHE_TTL) {
    return cachedLookups
  }

  const res = await fetch(`/api/lookups?country=${country}`)
  if (!res.ok) throw new Error('Failed to fetch lookups')
  const data = await res.json()

  cachedLookups = { ...data, fetchedAt: Date.now() }
  return data
}

export function invalidateLookupCache() {
  cachedLookups = null
}

// ─── Vendor fetching ────────────────────────────────────────────────────────

export async function fetchVendors(
  segment?: 'B' | 'C' | 'D',
  country = 'US'
): Promise<Vendor[]> {
  const params = new URLSearchParams({ country })
  if (segment) params.set('segment', segment)

  const res = await fetch(`/api/vendors?${params}`)
  if (!res.ok) throw new Error('Failed to fetch vendors')
  return res.json()
}

export async function createVendor(vendor: {
  name: string
  segment: 'B' | 'C' | 'D'
  country_code?: string
  notes?: string
}): Promise<Vendor> {
  const res = await fetch('/api/vendors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vendor),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to create vendor')
  }
  return res.json()
}
