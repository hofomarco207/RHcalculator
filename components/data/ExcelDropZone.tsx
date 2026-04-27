'use client'

import { useState, useRef, useCallback } from 'react'

interface ExcelDropZoneProps {
  onFile: (file: File) => void
  accept?: string
  label?: string
  sublabel?: string
}

export function ExcelDropZone({
  onFile,
  accept = '.xlsx,.csv,.xls',
  label = '拖放 Excel 檔案至此，或點擊選擇',
  sublabel = '支援 .xlsx、.xls、.csv',
}: ExcelDropZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) onFile(file)
    },
    [onFile]
  )

  return (
    <div
      className={`relative rounded-lg border-2 border-dashed transition-colors cursor-pointer
        ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
        }}
      />
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
        <div className="text-2xl text-muted-foreground">📂</div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      </div>
    </div>
  )
}
