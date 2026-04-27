/**
 * ISO 3166-1 country list for auto-fill in settings.
 * Includes flag emoji, Chinese and English names.
 * Not exhaustive — focused on common logistics destinations.
 */
export interface CountrySeed {
  code: string
  flag: string
  name_zh: string
  name_en: string
}

export const COUNTRY_SEED: CountrySeed[] = [
  { code: 'US', flag: '\u{1F1FA}\u{1F1F8}', name_zh: '美國', name_en: 'United States' },
  { code: 'CN', flag: '\u{1F1E8}\u{1F1F3}', name_zh: '中國', name_en: 'China' },
  { code: 'HK', flag: '\u{1F1ED}\u{1F1F0}', name_zh: '香港', name_en: 'Hong Kong' },
  { code: 'JP', flag: '\u{1F1EF}\u{1F1F5}', name_zh: '日本', name_en: 'Japan' },
  { code: 'KR', flag: '\u{1F1F0}\u{1F1F7}', name_zh: '韓國', name_en: 'South Korea' },
  { code: 'TW', flag: '\u{1F1F9}\u{1F1FC}', name_zh: '台灣', name_en: 'Taiwan' },
  { code: 'SG', flag: '\u{1F1F8}\u{1F1EC}', name_zh: '新加坡', name_en: 'Singapore' },
  { code: 'MY', flag: '\u{1F1F2}\u{1F1FE}', name_zh: '馬來西亞', name_en: 'Malaysia' },
  { code: 'TH', flag: '\u{1F1F9}\u{1F1ED}', name_zh: '泰國', name_en: 'Thailand' },
  { code: 'VN', flag: '\u{1F1FB}\u{1F1F3}', name_zh: '越南', name_en: 'Vietnam' },
  { code: 'PH', flag: '\u{1F1F5}\u{1F1ED}', name_zh: '菲律賓', name_en: 'Philippines' },
  { code: 'ID', flag: '\u{1F1EE}\u{1F1E9}', name_zh: '印尼', name_en: 'Indonesia' },
  { code: 'IN', flag: '\u{1F1EE}\u{1F1F3}', name_zh: '印度', name_en: 'India' },
  { code: 'PK', flag: '\u{1F1F5}\u{1F1F0}', name_zh: '巴基斯坦', name_en: 'Pakistan' },
  { code: 'BD', flag: '\u{1F1E7}\u{1F1E9}', name_zh: '孟加拉', name_en: 'Bangladesh' },
  { code: 'LK', flag: '\u{1F1F1}\u{1F1F0}', name_zh: '斯里蘭卡', name_en: 'Sri Lanka' },
  { code: 'AE', flag: '\u{1F1E6}\u{1F1EA}', name_zh: '阿聯酋', name_en: 'United Arab Emirates' },
  { code: 'SA', flag: '\u{1F1F8}\u{1F1E6}', name_zh: '沙烏地阿拉伯', name_en: 'Saudi Arabia' },
  { code: 'KW', flag: '\u{1F1F0}\u{1F1FC}', name_zh: '科威特', name_en: 'Kuwait' },
  { code: 'QA', flag: '\u{1F1F6}\u{1F1E6}', name_zh: '卡達', name_en: 'Qatar' },
  { code: 'BH', flag: '\u{1F1E7}\u{1F1ED}', name_zh: '巴林', name_en: 'Bahrain' },
  { code: 'OM', flag: '\u{1F1F4}\u{1F1F2}', name_zh: '阿曼', name_en: 'Oman' },
  { code: 'JO', flag: '\u{1F1EF}\u{1F1F4}', name_zh: '約旦', name_en: 'Jordan' },
  { code: 'IL', flag: '\u{1F1EE}\u{1F1F1}', name_zh: '以色列', name_en: 'Israel' },
  { code: 'TR', flag: '\u{1F1F9}\u{1F1F7}', name_zh: '土耳其', name_en: 'Turkey' },
  { code: 'EG', flag: '\u{1F1EA}\u{1F1EC}', name_zh: '埃及', name_en: 'Egypt' },
  { code: 'ZA', flag: '\u{1F1FF}\u{1F1E6}', name_zh: '南非', name_en: 'South Africa' },
  { code: 'NG', flag: '\u{1F1F3}\u{1F1EC}', name_zh: '奈及利亞', name_en: 'Nigeria' },
  { code: 'KE', flag: '\u{1F1F0}\u{1F1EA}', name_zh: '肯亞', name_en: 'Kenya' },
  { code: 'GH', flag: '\u{1F1EC}\u{1F1ED}', name_zh: '迦納', name_en: 'Ghana' },
  { code: 'MA', flag: '\u{1F1F2}\u{1F1E6}', name_zh: '摩洛哥', name_en: 'Morocco' },
  { code: 'GB', flag: '\u{1F1EC}\u{1F1E7}', name_zh: '英國', name_en: 'United Kingdom' },
  { code: 'DE', flag: '\u{1F1E9}\u{1F1EA}', name_zh: '德國', name_en: 'Germany' },
  { code: 'FR', flag: '\u{1F1EB}\u{1F1F7}', name_zh: '法國', name_en: 'France' },
  { code: 'IT', flag: '\u{1F1EE}\u{1F1F9}', name_zh: '義大利', name_en: 'Italy' },
  { code: 'ES', flag: '\u{1F1EA}\u{1F1F8}', name_zh: '西班牙', name_en: 'Spain' },
  { code: 'PT', flag: '\u{1F1F5}\u{1F1F9}', name_zh: '葡萄牙', name_en: 'Portugal' },
  { code: 'NL', flag: '\u{1F1F3}\u{1F1F1}', name_zh: '荷蘭', name_en: 'Netherlands' },
  { code: 'BE', flag: '\u{1F1E7}\u{1F1EA}', name_zh: '比利時', name_en: 'Belgium' },
  { code: 'AT', flag: '\u{1F1E6}\u{1F1F9}', name_zh: '奧地利', name_en: 'Austria' },
  { code: 'CH', flag: '\u{1F1E8}\u{1F1ED}', name_zh: '瑞士', name_en: 'Switzerland' },
  { code: 'SE', flag: '\u{1F1F8}\u{1F1EA}', name_zh: '瑞典', name_en: 'Sweden' },
  { code: 'NO', flag: '\u{1F1F3}\u{1F1F4}', name_zh: '挪威', name_en: 'Norway' },
  { code: 'DK', flag: '\u{1F1E9}\u{1F1F0}', name_zh: '丹麥', name_en: 'Denmark' },
  { code: 'FI', flag: '\u{1F1EB}\u{1F1EE}', name_zh: '芬蘭', name_en: 'Finland' },
  { code: 'PL', flag: '\u{1F1F5}\u{1F1F1}', name_zh: '波蘭', name_en: 'Poland' },
  { code: 'CZ', flag: '\u{1F1E8}\u{1F1FF}', name_zh: '捷克', name_en: 'Czech Republic' },
  { code: 'RO', flag: '\u{1F1F7}\u{1F1F4}', name_zh: '羅馬尼亞', name_en: 'Romania' },
  { code: 'HU', flag: '\u{1F1ED}\u{1F1FA}', name_zh: '匈牙利', name_en: 'Hungary' },
  { code: 'GR', flag: '\u{1F1EC}\u{1F1F7}', name_zh: '希臘', name_en: 'Greece' },
  { code: 'IE', flag: '\u{1F1EE}\u{1F1EA}', name_zh: '愛爾蘭', name_en: 'Ireland' },
  { code: 'RU', flag: '\u{1F1F7}\u{1F1FA}', name_zh: '俄羅斯', name_en: 'Russia' },
  { code: 'UA', flag: '\u{1F1FA}\u{1F1E6}', name_zh: '烏克蘭', name_en: 'Ukraine' },
  { code: 'AU', flag: '\u{1F1E6}\u{1F1FA}', name_zh: '澳洲', name_en: 'Australia' },
  { code: 'NZ', flag: '\u{1F1F3}\u{1F1FF}', name_zh: '紐西蘭', name_en: 'New Zealand' },
  { code: 'CA', flag: '\u{1F1E8}\u{1F1E6}', name_zh: '加拿大', name_en: 'Canada' },
  { code: 'MX', flag: '\u{1F1F2}\u{1F1FD}', name_zh: '墨西哥', name_en: 'Mexico' },
  { code: 'BR', flag: '\u{1F1E7}\u{1F1F7}', name_zh: '巴西', name_en: 'Brazil' },
  { code: 'AR', flag: '\u{1F1E6}\u{1F1F7}', name_zh: '阿根廷', name_en: 'Argentina' },
  { code: 'CL', flag: '\u{1F1E8}\u{1F1F1}', name_zh: '智利', name_en: 'Chile' },
  { code: 'CO', flag: '\u{1F1E8}\u{1F1F4}', name_zh: '哥倫比亞', name_en: 'Colombia' },
  { code: 'PE', flag: '\u{1F1F5}\u{1F1EA}', name_zh: '秘魯', name_en: 'Peru' },
  { code: 'EC', flag: '\u{1F1EA}\u{1F1E8}', name_zh: '厄瓜多', name_en: 'Ecuador' },
  { code: 'UY', flag: '\u{1F1FA}\u{1F1FE}', name_zh: '烏拉圭', name_en: 'Uruguay' },
  { code: 'PA', flag: '\u{1F1F5}\u{1F1E6}', name_zh: '巴拿馬', name_en: 'Panama' },
  { code: 'CR', flag: '\u{1F1E8}\u{1F1F7}', name_zh: '哥斯大黎加', name_en: 'Costa Rica' },
  { code: 'DO', flag: '\u{1F1E9}\u{1F1F4}', name_zh: '多明尼加', name_en: 'Dominican Republic' },
  { code: 'PR', flag: '\u{1F1F5}\u{1F1F7}', name_zh: '波多黎各', name_en: 'Puerto Rico' },
  { code: 'GT', flag: '\u{1F1EC}\u{1F1F9}', name_zh: '瓜地馬拉', name_en: 'Guatemala' },
  { code: 'IQ', flag: '\u{1F1EE}\u{1F1F6}', name_zh: '伊拉克', name_en: 'Iraq' },
  { code: 'IR', flag: '\u{1F1EE}\u{1F1F7}', name_zh: '伊朗', name_en: 'Iran' },
  { code: 'MM', flag: '\u{1F1F2}\u{1F1F2}', name_zh: '緬甸', name_en: 'Myanmar' },
  { code: 'KH', flag: '\u{1F1F0}\u{1F1ED}', name_zh: '柬埔寨', name_en: 'Cambodia' },
  { code: 'NP', flag: '\u{1F1F3}\u{1F1F5}', name_zh: '尼泊爾', name_en: 'Nepal' },
  { code: 'MN', flag: '\u{1F1F2}\u{1F1F3}', name_zh: '蒙古', name_en: 'Mongolia' },
  { code: 'KZ', flag: '\u{1F1F0}\u{1F1FF}', name_zh: '哈薩克', name_en: 'Kazakhstan' },
  { code: 'UZ', flag: '\u{1F1FA}\u{1F1FF}', name_zh: '烏茲別克', name_en: 'Uzbekistan' },
]

/** Lookup a country seed by code */
export function findCountrySeed(code: string): CountrySeed | undefined {
  return COUNTRY_SEED.find((c) => c.code === code)
}

/** Get flag emoji for a country code. Falls back to code letters. */
export function getCountryFlag(code: string): string {
  const seed = findCountrySeed(code)
  if (seed) return seed.flag
  // Generate flag emoji from country code using regional indicator symbols
  if (code.length === 2) {
    return String.fromCodePoint(
      ...code.toUpperCase().split('').map((c) => 0x1F1E6 + c.charCodeAt(0) - 65)
    )
  }
  return code
}
