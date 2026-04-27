'use client'

import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'

interface FlowStepperProps {
  steps: string[]
  currentStep: number
  onStepChange: (step: number) => void
  /** Disable "next" when current step isn't ready */
  canProceed?: boolean
  /** Hide back on first step (default true) */
  hideBackOnFirst?: boolean
  /** Custom label for the final step's next button */
  finishLabel?: string
  onFinish?: () => void
}

export function FlowStepper({
  steps,
  currentStep,
  onStepChange,
  canProceed = true,
  hideBackOnFirst = true,
  finishLabel,
  onFinish,
}: FlowStepperProps) {
  const t = useT()
  const isFirst = currentStep === 0
  const isLast = currentStep === steps.length - 1

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {steps.map((label, i) => {
          const isActive = i === currentStep
          const isDone = i < currentStep
          return (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && (
                <div
                  className="h-px w-6 transition-colors"
                  style={{ backgroundColor: isDone ? '#FF6B00' : 'var(--border)' }}
                />
              )}
              <button
                type="button"
                onClick={() => i < currentStep && onStepChange(i)}
                disabled={i > currentStep}
                className={`
                  flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all
                  ${isActive
                    ? 'bg-[#FF6B00] text-white shadow-[0_0_8px_rgba(255,107,0,0.25)]'
                    : isDone
                      ? 'bg-[#FFF7ED] text-[#FF6B00] cursor-pointer hover:bg-[#FFEDD5]'
                      : 'bg-[#F0EDE8] text-[#9CA3AF] cursor-default'
                  }
                `}
              >
                <span className="font-mono">{isDone ? '✓' : i + 1}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            </div>
          )
        })}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        {!hideBackOnFirst || !isFirst ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onStepChange(currentStep - 1)}
            disabled={isFirst}
            className="border-[#E5E2DB] text-[#6B7280] hover:text-[#1C1E26] hover:bg-[#F0EDE8]"
          >
            ← {t.common.back}
          </Button>
        ) : (
          <div />
        )}

        {isLast ? (
          <Button
            size="sm"
            onClick={onFinish}
            disabled={!canProceed}
            className="bg-[#FF6B00] hover:bg-[#E55F00] text-white shadow-[0_1px_3px_rgba(255,107,0,0.3)]"
          >
            {finishLabel ?? t.common.confirm}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => onStepChange(currentStep + 1)}
            disabled={!canProceed}
            className="bg-[#FF6B00] hover:bg-[#E55F00] text-white shadow-[0_1px_3px_rgba(255,107,0,0.3)]"
          >
            {t.common.next} →
          </Button>
        )}
      </div>
    </div>
  )
}
