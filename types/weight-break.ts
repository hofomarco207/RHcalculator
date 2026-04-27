export interface WeightBreakDataset {
  id: string
  country_code: string
  label: string
  period: string | null
  total_orders: number | null
  created_at: string
}

export interface WeightBreakEntry {
  id: string
  dataset_id: string
  weight_kg: number
  order_count: number
  total_weight: number // computed: weight_kg * order_count
}

export interface WeightBreakDatasetWithEntries extends WeightBreakDataset {
  entries: WeightBreakEntry[]
}
