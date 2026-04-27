/**
 * Returns Tailwind badge classes for a margin value (0–1 scale).
 * <0    → red
 * 0–15% → yellow
 * 15.01–29.99% → blue
 * ≥30%  → green
 */
export function getMarginColorClass(margin: number): string {
  if (margin < 0) return 'bg-red-600 text-white'
  if (margin <= 0.15) return 'bg-yellow-500 text-white'
  if (margin < 0.30) return 'bg-blue-500 text-white'
  return 'bg-green-600 text-white'
}
