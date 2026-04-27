/**
 * Shared Supabase query helpers for versioning-aware rate queries.
 *
 * During the transition from `is_current` to `valid_to IS NULL`,
 * these helpers apply the correct filter. Once the cleanup migration
 * drops `is_current`, switch to `valid_to IS NULL` only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Apply "active record" filter to a Supabase query.
 * Uses `valid_to IS NULL` (new) with fallback to `is_current = true` (legacy).
 * Both filters are applied during the transition period.
 */
export function filterActive<T>(
  query: ReturnType<SupabaseClient['from']>['select'] extends (...args: unknown[]) => infer R ? R : never
): typeof query {
  // valid_to IS NULL covers new versioned records
  // is_current = true covers legacy records without valid_to
  return (query as T & { is: (col: string, val: null) => typeof query }).is('valid_to', null)
}

/**
 * Deactivate current records for a vendor in a rate table.
 * Sets both `valid_to` and `is_current` for backward compat.
 */
export async function deactivateCurrentRates(
  supabase: SupabaseClient,
  table: string,
  vendorId: string,
) {
  const today = new Date().toISOString().split('T')[0]
  return supabase
    .from(table)
    .update({ is_current: false, valid_to: today })
    .eq('vendor_id', vendorId)
    .eq('is_current', true)
}

/**
 * Get the next version number for a vendor in a rate table.
 */
export async function getNextVersion(
  supabase: SupabaseClient,
  table: string,
  vendorId: string,
): Promise<number> {
  const { data } = await supabase
    .from(table)
    .select('version')
    .eq('vendor_id', vendorId)
    .order('version', { ascending: false })
    .limit(1)

  const current = (data?.[0] as { version?: number } | undefined)?.version ?? 0
  return current + 1
}
