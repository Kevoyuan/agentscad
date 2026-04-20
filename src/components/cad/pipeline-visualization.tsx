'use client'

import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, ChevronRight } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { PIPELINE_STEPS, ExecutionLog, parseJSON, getPipelineProgress } from './types'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

// ─── Average step times for estimation ──────────────────────────────────────

const AVERAGE_STEP_TIMES: Record<string, number> = {
  NEW: 1,
  SCAD_GENERATED: 8,
  RENDERED: 5,
  VALIDATED: 3,
  DELIVERED: 1,
}

interface PipelineVisualizationProps {
  state: string
  job?: {
    executionLogs?: string | null
    createdAt: string
    updatedAt: string
    completedAt?: string | null
  }
  onStepClick?: (stepKey: string, tabName: string) => void
}

export function PipelineVisualization({ state, job, onStepClick }: PipelineVisualizationProps) {
  const currentIdx = PIPELINE_STEPS.findIndex(s => s.key === state)
  const failedStates = ['GEOMETRY_FAILED', 'RENDER_FAILED', 'VALIDATION_FAILED']
  const isFailed = failedStates.includes(state)
  const progress = getPipelineProgress(state)

  // Find which step failed
  const failedStepKey = isFailed ? state.replace('_FAILED', '') : null
  const failedStepIdx = failedStepKey ? PIPELINE_STEPS.findIndex(s => s.key === failedStepKey) : -1

  // Calculate step durations from execution logs
  const executionLogs = job?.executionLogs ?? null
  const stepDurations = useMemo(() => {
    if (!executionLogs) return {} as Record<string, number>
    const logs = parseJSON<ExecutionLog[]>(executionLogs, [])
    const stepTimes: Record<string, { start: number; end?: number }> = {}

    for (const log of logs) {
      const ts = new Date(log.timestamp).getTime()
      for (const step of PIPELINE_STEPS) {
        if (log.event === step.key) {
          if (!stepTimes[step.key]) {
            stepTimes[step.key] = { start: ts }
          } else {
            stepTimes[step.key].end = ts
          }
        }
      }
      const eventIdx = PIPELINE_STEPS.findIndex(s => s.key === log.event)
      if (eventIdx > 0) {
        const prevStep = PIPELINE_STEPS[eventIdx - 1].key
        if (stepTimes[prevStep] && !stepTimes[prevStep].end) {
          stepTimes[prevStep].end = ts
        }
      }
    }

    const durations: Record<string, number> = {}
    for (const [key, times] of Object.entries(stepTimes)) {
      if (times.end && times.start) {
        durations[key] = times.end - times.start
      }
    }
    return durations
  }, [executionLogs])

  // Map pipeline step to inspector tab for click navigation
  const stepToTabMap: Record<string, string> = {
    'NEW': 'PARAMS',
    'SCAD_GENERATED': 'SCAD',
    'RENDERED': 'PARAMS',
    'VALIDATED': 'VALIDATE',
    'DELIVERED': 'PARAMS',
  }

  // Determine effective current index for connecting line fill
  // For failed states, fill up to (but not including) the failed step
  const effectiveCurrentIdx = isFailed ? failedStepIdx : currentIdx

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex items-center gap-0.5">
        {PIPELINE_STEPS.map((step, idx) => {
          const isCompleted = isFailed
            ? idx < failedStepIdx
            : idx < currentIdx
          const isCurrent = isFailed
            ? idx === failedStepIdx
            : idx === currentIdx && !isFailed
          const isFailedStep = isFailed && idx === failedStepIdx
          const Icon = step.icon
          const duration = stepDurations[step.key]
          const isClickable = onStepClick && (isCompleted || isCurrent || isFailedStep)

          // Determine connecting line color
          // Completed: green, Active current: partial fill, Failed: red up to failed step
          const isLineCompleted = idx < effectiveCurrentIdx
          const isLineFailed = isFailed && idx < failedStepIdx

          return (
            <div key={step.key} className="flex items-center">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.div
                      className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md transition-all duration-300 ${
                        isClickable ? 'cursor-pointer hover:bg-[var(--app-hover-subtle)]' : 'cursor-default'
                      } ${
                        isFailedStep ? 'text-rose-400 bg-rose-500/10 ring-1 ring-rose-500/20' :
                        isCurrent && !isFailed ? 'text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/20' :
                        isCompleted ? 'text-lime-400' :
                        'text-[var(--app-text-dim)]'
                      }`}
                      whileHover={isClickable ? { scale: 1.12 } : undefined}
                      whileTap={isClickable ? { scale: 0.95 } : undefined}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      onClick={() => {
                        if (isClickable) {
                          onStepClick?.(step.key, stepToTabMap[step.key] || 'PARAMS')
                        }
                      }}
                    >
                      <div className="relative">
                        {isFailedStep ? (
                          <XCircle className="w-3.5 h-3.5" />
                        ) : isCompleted ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Icon className={`w-3.5 h-3.5 ${isCurrent && !isFailed ? 'animate-pulse' : ''}`} />
                        )}
                        {/* Pulsing dot on the current active step */}
                        {isCurrent && !isFailed && !isCompleted && (
                          <motion.div
                            className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400"
                            animate={{
                              scale: [1, 1.5, 1],
                              opacity: [1, 0.5, 1],
                            }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        )}
                      </div>
                      <span className="text-[8px] font-mono tracking-wider">{step.label}</span>
                      {/* Time spent indicator below completed steps */}
                      {isCompleted && duration !== undefined && (
                        <span className="text-[7px] font-mono text-lime-500/60">{formatDuration(duration)}</span>
                      )}
                      {/* Estimated time for upcoming steps */}
                      {!isCompleted && !isCurrent && !isFailedStep && (
                        <span className="text-[7px] font-mono text-[var(--app-text-dim)]">~{AVERAGE_STEP_TIMES[step.key] || 5}s</span>
                      )}
                      {/* Running indicator for current step */}
                      {isCurrent && !isFailed && (
                        <span className="text-[7px] font-mono text-amber-400/60">running</span>
                      )}
                      {/* Failed indicator */}
                      {isFailedStep && (
                        <span className="text-[7px] font-mono text-rose-400/80">failed</span>
                      )}
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                    <div className="font-mono font-semibold">{step.label}: {step.key.replace(/_/g, ' ')}</div>
                    {duration !== undefined && (
                      <div className="text-[10px] text-[var(--app-text-muted)] mt-0.5">Duration: {formatDuration(duration)}</div>
                    )}
                    {isCurrent && !isFailed && (
                      <div className="text-[10px] text-amber-400 mt-0.5">Currently processing</div>
                    )}
                    {isFailedStep && (
                      <div className="text-[10px] text-rose-400 mt-0.5">Failed at this step</div>
                    )}
                    {isCompleted && (
                      <div className="text-[10px] text-lime-400 mt-0.5">Completed</div>
                    )}
                    {isClickable && (
                      <div className="text-[10px] text-[var(--app-text-muted)] mt-1">Click to view in inspector</div>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Connecting line between steps */}
              {idx < PIPELINE_STEPS.length - 1 && (
                <div className="relative flex items-center mx-0.5">
                  {/* Background line */}
                  <div className="w-4 h-0.5 bg-[var(--app-surface-raised)] rounded-full" />
                  {/* Animated filled line */}
                  <AnimatePresence>
                    {isLineCompleted && (
                      <motion.div
                        className="absolute top-1/2 -translate-y-1/2 h-0.5 rounded-full"
                        style={{
                          backgroundColor: isLineFailed ? '#f43f5e' : '#84cc16',
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: 16 }}
                        exit={{ width: 0 }}
                        transition={{ duration: 0.4, delay: idx * 0.08 }}
                      />
                    )}
                  </AnimatePresence>
                  {/* Failed line to the failed step */}
                  {isFailed && idx === failedStepIdx - 1 && (
                    <motion.div
                      className="absolute top-1/2 -translate-y-1/2 h-0.5 rounded-full"
                      style={{ backgroundColor: '#f43f5e' }}
                      initial={{ width: 0 }}
                      animate={{ width: 16 }}
                      transition={{ duration: 0.4, delay: idx * 0.08 }}
                    />
                  )}
                  <ChevronRight className={`w-2.5 h-2.5 relative z-10 linear-transition ${
                    idx < effectiveCurrentIdx ? 'text-lime-500/60' :
                    isFailed && idx === failedStepIdx - 1 ? 'text-rose-500/60' :
                    'text-[var(--app-text-dim)]'
                  }`} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      {/* Progress percentage label */}
      {currentIdx >= 0 && (
        <Badge
          variant="outline"
          className={`text-[9px] h-4 ml-1 ${
            isFailed ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
            progress === 100 ? 'bg-lime-500/10 text-lime-400 border-lime-500/20' :
            'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}
        >
          {isFailed ? 'FAILED' : `${progress}%`}
        </Badge>
      )}

      {/* Mini progress bar below pipeline */}
      <div className="pipeline-mini-progress w-12 ml-1">
        <div
          className={`pipeline-mini-progress-fill ${
            isFailed ? 'bg-rose-500' :
            progress === 100 ? 'bg-lime-500' :
            'bg-[var(--app-accent)]'
          }`}
          style={{ width: `${isFailed ? Math.max(progress - 20, 20) : progress}%` }}
        />
      </div>
    </div>
  )
}
