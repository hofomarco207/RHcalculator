import * as XLSX from 'xlsx'
import type { CompeteBracketResult, PriceUnit } from '@/types/pricing-analysis'

/**
 * Export a customer-facing rate card from compete analysis.
 * Only includes weight brackets and prices — NO cost or margin data.
 */
export function exportCompeteRateCard(opts: {
  name: string
  country: string
  brackets: CompeteBracketResult[]
  priceUnit: PriceUnit
}): void {
  const { name, country, brackets, priceUnit } = opts
  const unit = priceUnit === 'per_ticket' ? 'HKD/票' : 'HKD/kg'

  const rows = brackets.map((b) => ({
    重量段: b.weight_bracket,
    代表重量_KG: b.representative_weight,
    [`報價 (${unit})`]: Number(b.my_price.toFixed(2)),
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '報價')

  const filename = `${name}_${country}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}
