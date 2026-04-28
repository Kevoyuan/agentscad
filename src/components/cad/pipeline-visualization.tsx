'use client'

import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PIPELINE_STEPS, ExecutionLog, parseJSON, getPipelineProgress } from './types'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
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

  // Find which step failed — map failed states to their pipeline step keys
  const failedStepMap: Record<string, string> = {
    'GEOMETRY_FAILED': 'SCAD_GENERATED',
    'RENDER_FAILED': 'RENDERED',
    'VALIDATION_FAILED': 'VALIDATED',
  }
  const failedStepKey = isFailed ? failedStepMap[state] ?? null : null
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
    'NEW': 'SPEC',
    'SCAD_GENERATED': 'CODE',
    'RENDERED': 'SPEC',
    'VALIDATED': 'VALIDATION',
    'DELIVERED': 'SPEC',
  }

  // Determine effective current index for connecting line fill
  // For failed states, fill up to (but not including) the failed step
  const effectiveCurrentIdx = isFailed ? failedStepIdx : currentIdx

  const currentStep = PIPELINE_STEPS[Math.max(currentIdx, 0)]
  const currentLabel = isFailed
    ? `${failedStepKey?.replace(/_/g, ' ') || 'VALIDATION'} needs review`
    : state === 'DELIVERED'
      ? 'Ready'
      : currentStep?.label || 'Queued'

  return (
    <div className="flex min-w-0 items-center gap-2 px-2 py-1">
      <div className="flex items-center gap-1">
        {PIPELINE_STEPS.map((step, idx) => {
          const isTerminalState = state === 'DELIVERED' || state === 'CANCELLED'
          const isCompleted = isFailed
            ? idx < failedStepIdx
            : isTerminalState
              ? idx <= currentIdx
              : idx < currentIdx
          const isCurrent = isFailed
            ? idx === failedStepIdx
            : !isTerminalState && idx === currentIdx && !isFailed
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
                      className={`relative flex h-6 w-6 items-center justify-center rounded-md transition-all duration-200 ${
                        isClickable ? 'cursor-pointer hover:bg-[var(--app-hover-subtle)]' : 'cursor-default'
                      } ${
                        isFailedStep ? 'text-rose-500 bg-rose-500/10' :
                        isCurrent && !isFailed ? 'text-[var(--app-accent-text)] bg-[var(--app-accent-bg)]' :
                        isCompleted ? 'text-[var(--app-text-muted)]' :
                        'text-[var(--app-text-dim)]'
                      }`}
                      whileHover={isClickable ? { scale: 1.06 } : undefined}
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
                          <XCircle className="h-3.5 w-3.5" />
                        ) : isCompleted ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Icon className="h-3.5 w-3.5" />
                        )}
                        {isCurrent && !isFailed && !isCompleted && (
                          <motion.div
                            className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--app-accent)]"
                            animate={{
                              scale: [1, 1.5, 1],
                              opacity: [1, 0.5, 1],
                            }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        )}
                      </div>
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

              {idx < PIPELINE_STEPS.length - 1 && (
                <div className="relative mx-0.5 flex items-center">
                  <div className="h-px w-4 rounded-full bg-[var(--app-border)]" />
                  <AnimatePresence>
                    {isLineCompleted && (
                      <motion.div
                        className="absolute top-1/2 h-px -translate-y-1/2 rounded-full"
                        style={{
                          backgroundColor: isLineFailed ? 'var(--app-danger)' : 'var(--app-text-muted)',
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: 16 }}
                        exit={{ width: 0 }}
                        transition={{ duration: 0.4, delay: idx * 0.08 }}
                      />
                    )}
                  </AnimatePresence>
                  {isFailed && idx === failedStepIdx - 1 && (
                    <motion.div
                      className="absolute top-1/2 h-px -translate-y-1/2 rounded-full"
                      style={{ backgroundColor: 'var(--app-danger)' }}
                      initial={{ width: 0 }}
                      animate={{ width: 16 }}
                      transition={{ duration: 0.4, delay: idx * 0.08 }}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <span className={`hidden min-w-0 truncate text-[10px] font-medium lg:inline ${
        isFailed ? 'text-rose-500' : 'text-[var(--app-text-muted)]'
      }`}>
        {currentLabel}
      </span>
      <div className="pipeline-mini-progress ml-1 w-14">
        <div
          className={`pipeline-mini-progress-fill ${
            isFailed ? 'bg-rose-500' :
            progress === 100 ? 'bg-[var(--app-text-muted)]' :
            'bg-[var(--app-accent)]'
          }`}
          style={{ width: `${isFailed ? Math.max(progress - 20, 20) : progress}%` }}
        />
      </div>
    </div>
  )
}
