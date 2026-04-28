/**
 * Cost validation utilities — detect segments that should carry cost but
 * ended up at 0, usually because a vendor/carrier doesn't serve that weight.
 *
 * A segment cost of 0 in a pricing mode where the segment IS expected is
 * treated as a calculation error (red cell in tables, "計算錯誤" in total).
 * Segments that aren't part of the mode (e.g. C段 in bcd_combined) are not
 * flagged.
 */

export type PricingMode =
  | 'segmented'
  | 'bc_combined'
  | 'bcd_combined'

export type SegmentKey = 'seg_a' | 'seg_b' | 'seg_c' | 'seg_d' | 'seg_bc'

export interface SegmentCosts {
  seg_a?: number
  seg_b?: number
  seg_c?: number
  seg_d?: number
  seg_bc?: number | null
}

/**
 * Segments that must be > 0 for the given pricing mode.
 * - bcd_combined: the whole chain is baked into seg_d (by convention).
 */
export function expectedSegments(mode: PricingMode): SegmentKey[] {
  switch (mode) {
    case 'segmented':
      return ['seg_a', 'seg_b', 'seg_c', 'seg_d']
    case 'bc_combined':
      return ['seg_a', 'seg_bc', 'seg_d']
    case 'bcd_combined':
      return ['seg_a', 'seg_d']
  }
}

export function invalidSegments(costs: SegmentCosts, mode: PricingMode): SegmentKey[] {
  return expectedSegments(mode).filter((k) => {
    const v = costs[k]
    return v == null || v === 0
  })
}

export function isCostValid(costs: SegmentCosts, mode: PricingMode): boolean {
  return invalidSegments(costs, mode).length === 0
}
