import * as XLSX from 'xlsx'
import type { RateCard } from '@/types'

export type ExportCurrency = 'HKD' | 'RMB' | 'USD' | 'JPY'

/**
 * Export a rate card to an Excel file and trigger browser download.
 * currency + multiplier convert HKD values to the chosen display currency.
 */
export function exportRateCardToExcel(
  rateCard: Pick<RateCard, 'name' | 'product_type' | 'target_margin' | 'brackets'>,
  currency: ExportCurrency = 'HKD',
  multiplier: number = 1,
): void {
  const c = currency
  const m = multiplier
  const rows = rateCard.brackets.map((b) => ({
    重量區間: b.weight_range,
    代表重量_KG: b.representative_weight_kg,
    [`成本_${c}`]: Math.ceil(b.cost_hkd * m),
    [`運費_${c}_KG`]: Math.ceil(b.freight_rate_hkd_per_kg * m),
    [`掛號費_${c}`]: Math.ceil(b.reg_fee_hkd * m),
    [`收入_${c}`]: Math.ceil(b.revenue_hkd * m),
    毛利率: `${(b.actual_margin * 100).toFixed(1)}%`,
    手動調整: b.is_manually_adjusted ? '是' : '否',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '價卡')

  const filename = `${rateCard.name}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}
