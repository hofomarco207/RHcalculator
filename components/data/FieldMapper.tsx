'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

interface SystemField {
  key: string
  label: string
  required: boolean
}

interface FieldMapperProps {
  excelColumns: string[]
  systemFields: SystemField[]
  mapping: Record<string, string>
  onChange: (mapping: Record<string, string>) => void
}

export function FieldMapper({ excelColumns, systemFields, mapping, onChange }: FieldMapperProps) {
  function handleChange(systemKey: string, excelCol: string | null) {
    onChange({ ...mapping, [systemKey]: excelCol ?? '' })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center text-xs text-muted-foreground font-medium">
        <span>系統欄位</span>
        <span />
        <span>你的 Excel 欄位</span>
      </div>
      {systemFields.map((field) => (
        <div key={field.key} className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm">{field.label}</span>
            {field.required && (
              <Badge variant="destructive" className="text-[10px] px-1 py-0">必填</Badge>
            )}
          </div>
          <span className="text-muted-foreground">→</span>
          <Select
            value={mapping[field.key] ?? ''}
            onValueChange={(val) => handleChange(field.key, val)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="選擇欄位..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">（不對應）</SelectItem>
              {excelColumns.map((col) => (
                <SelectItem key={col} value={col}>{col}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  )
}
