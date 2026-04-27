'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/lib/i18n'

interface VolumeConfigProps {
  weeklyTickets: number
  weeklyKg: number | null
  flightsPerWeek: number | null
  onTicketsChange: (v: number) => void
  onWeeklyKgChange: (v: number | null) => void
  onFlightsPerWeekChange: (v: number | null) => void
}

export function VolumeConfig({
  weeklyTickets, weeklyKg, flightsPerWeek,
  onTicketsChange, onWeeklyKgChange, onFlightsPerWeekChange,
}: VolumeConfigProps) {
  const t = useT()
  const avgWeight = (weeklyKg && weeklyTickets > 0)
    ? (weeklyKg / weeklyTickets).toFixed(2)
    : null

  const kgPerMawb = (weeklyKg && flightsPerWeek && flightsPerWeek > 0)
    ? (weeklyKg / flightsPerWeek).toFixed(0)
    : null

  return (
    <div className="space-y-3">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {t.volumeConfig.estimatedWeekly}
      </Label>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px]">{t.volumeConfig.weeklyTickets}</Label>
          <Input
            type="number"
            min={0}
            step={100}
            value={weeklyTickets || ''}
            onChange={(e) => onTicketsChange(parseInt(e.target.value) || 0)}
            placeholder={t.volumeConfig.ticketsPlaceholder}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{t.volumeConfig.weeklyKg}</Label>
          <Input
            type="number"
            min={0}
            step={100}
            value={weeklyKg ?? ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              onWeeklyKgChange(v > 0 ? v : null)
            }}
            placeholder={t.volumeConfig.kgPlaceholder}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{t.volumeConfig.flightsPerWeek}</Label>
          <Input
            type="number"
            min={1}
            step={1}
            value={flightsPerWeek ?? ''}
            onChange={(e) => {
              const v = parseInt(e.target.value)
              onFlightsPerWeekChange(v > 0 ? v : null)
            }}
            placeholder={t.volumeConfig.flightsPlaceholder}
          />
        </div>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        {avgWeight ? (
          <p>
            {t.volumeConfig.avgWeight}{'\uFF1A'}<span className="font-mono font-medium text-foreground">{avgWeight} kg</span>
            {kgPerMawb && (
              <span className="ml-2">
                · {t.volumeConfig.perFlightWeight}{'\uFF1A'}<span className="font-mono font-medium text-foreground">{kgPerMawb} kg/MAWB</span>
              </span>
            )}
          </p>
        ) : (
          <p className="text-amber-600">
            {t.volumeConfig.enterBothHint}
          </p>
        )}
        {!flightsPerWeek && (
          <p className="text-amber-600">
            {t.volumeConfig.noFlightsHint}
          </p>
        )}
      </div>
    </div>
  )
}
