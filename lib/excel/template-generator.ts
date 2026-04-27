import * as XLSX from 'xlsx'
import { GATEWAYS } from '@/types'

/**
 * Generate a blank air freight quote template Excel file
 */
export function generateAirFreightTemplate(): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  const data = [
    ['', '口岸', '貨種', '查詢Key', '1.1-1.7', '1.8-1.14', '1.15-1.21'],
    ['', 'LAX', '特惠带电', 'LAX特惠带电', '', '', ''],
    ['', 'LAX', 'PDD+标快', 'LAXPDD+标快', '', '', ''],
    ['', 'JFK', '特惠带电', 'JFK特惠带电', '', '', ''],
    ['', 'JFK', 'PDD+标快', 'JFKPDD+标快', '', '', ''],
    ['', 'ORD', '特惠带电', 'ORD特惠带电', '', '', ''],
    ['', 'ORD', 'PDD+标快', 'ORDPDD+标快', '', '', ''],
    ['', 'DFW', '特惠带电', 'DFW特惠带电', '', '', ''],
    ['', 'MIA', '特惠带电', 'MIA特惠带电', '', '', ''],
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 4 }, { wch: 6 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws, 'HKG直飞空运价格')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

/**
 * Generate a blank last-mile rate template for a specific carrier
 */
export function generateLastMileRateTemplate(carrier: string): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  const rateHeader = ['Weight', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7', 'Zone 8']
  const rateData = [rateHeader, ['1 oz', '', '', '', '', '', '', '', '']]
  const rateWs = XLSX.utils.aoa_to_sheet(rateData)
  XLSX.utils.book_append_sheet(wb, rateWs, `${carrier.toLowerCase()}价格`)

  const zipHeader = ['Zip Code', ...GATEWAYS]
  const zipData = [zipHeader, ['10001', '', '', '', '', '']]
  const zipWs = XLSX.utils.aoa_to_sheet(zipData)
  XLSX.utils.book_append_sheet(wb, zipWs, `${carrier.toLowerCase()}分区`)

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

/**
 * Generate a blank shipment history template
 */
export function generateShipmentTemplate(): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  const data = [
    ['gateway', 'zip_code', 'weight_kg', 'carrier', 'shipment_date'],
    ['LAX', '90210', '0.35', 'GOFO', '2026-03-01'],
    ['JFK', '10001', '0.5', 'USPS', '2026-03-02'],
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws, '出貨記錄')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}
