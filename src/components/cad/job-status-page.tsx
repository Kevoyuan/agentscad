'use client'

import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2, Cpu, Code2, Box, Shield, CheckCircle2,
  XCircle, Clock, FileText, Ban, AlertCircle, Activity,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Job, PIPELINE_STEPS, getPipelineProgress, parseJSON, ExecutionLog,
  timeAgo, getStateInfo,
} from './types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface JobStatusPageProps {
  job: Job
  onViewLogs: () => void
  onCancel: (job: Job) => void
  isCancelable: boolean
}

// ─── Step Time Estimation ───────────────────────────────────────────────────

const AVERAGE_STEP_TIMES: Record<string, number> = {
  NEW: 1,
  SCAD_GENERATED: 8,
  RENDERED: 5,
  VALIDATED: 3,
  DELIVERED: 1,
}

function estimateTimeRemaining(currentState: string): string {
  const currentIdx = PIPELINE_STEPS.findIndex(s => s.key === currentState)
  if (currentIdx === -1) return 'Calculating...'

  let totalSeconds = 0
  for (let i = currentIdx + 1; i < PIPELINE_STEPS.length; i++) {
    totalSeconds += AVERAGE_STEP_TIMES[PIPELINE_STEPS[i].key] || 5
  }

  if (totalSeconds < 60) return `~${totalSeconds}s`
  return `~${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`
}

function calculateElapsed(createdAt: string): string {
  const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  if (elapsed < 60) return `${elapsed}s`
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
  return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`
}

// ─── Animated State Icon ────────────────────────────────────────────────────

function AnimatedStateIcon({ state }: { state: string }) {
  const failedStates = ['VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED']
  const isFailed = failedStates.includes(state)

  const iconClass = 'w-16 h-16'

  if (isFailed) {
    return (
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      >
        <XCircle className={`${iconClass} text-rose-400`} />
      </motion.div>
    )
  }

  const currentIdx = PIPELINE_STEPS.findIndex(s => s.key === state)

  if (state === 'DELIVERED') {
    return (
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      >
        <CheckCircle2 className={`${iconClass} text-lime-400`} />
      </motion.div>
    )
  }

  if (state === 'SCAD_GENERATED') {
    return (
      <motion.div
        animate={{ rotate: [0, 10, -10, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Code2 className={`${iconClass} text-amber-400`} />
      </motion.div>
    )
  }

  if (state === 'RENDERED') {
    return (
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Box className={`${iconClass} text-cyan-400`} />
      </motion.div>
    )
  }

  if (state === 'VALIDATED') {
    return (
      <motion.div
        animate={{ opacity: [1, 0.6, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Shield className={`${iconClass} text-emerald-400`} />
      </motion.div>
    )
  }

  // Default: spinning loader
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
    >
      <Loader2 className={`${iconClass} text-[var(--app-accent-text)]`} />
    </motion.div>
  )
}

// ─── Step Duration from Execution Logs ──────────────────────────────────────

function getStepDurations(executionLogs: string | null): Record<string, number> {
  if (!executionLogs) return {}
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
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

// ─── Live Elapsed Timer ─────────────────────────────────────────────────────

function LiveElapsed({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(calculateElapsed(createdAt))

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(calculateElapsed(createdAt))
    }, 1000)
    return () => clearInterval(interval)
  }, [createdAt])

  return <span>{elapsed}</span>
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function JobStatusPage({ job, onViewLogs, onCancel, isCancelable }: JobStatusPageProps) {
  const state = job.state
  const progress = getPipelineProgress(state)
  const currentIdx = PIPELINE_STEPS.findIndex(s => s.key === state)
  const failedStates = ['VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED']
  const isFailed = failedStates.includes(state)
  const isDelivered = state === 'DELIVERED'
  const stepDurations = useMemo(() => getStepDurations(job.executionLogs), [job.executionLogs])

  // Current step label
  const currentStepLabel = useMemo(() => {
    if (isFailed) {
      const failedStep = state.replace('_FAILED', '')
      const step = PIPELINE_STEPS.find(s => s.key === failedStep)
      return step ? `Failed at ${step.label}` : 'Failed'
    }
    if (isDelivered) return 'Complete'
    const step = PIPELINE_STEPS.find(s => s.key === state)
    return step ? step.label : state
  }, [state, isFailed, isDelivered])

  // Calculate effective progress (for failed, show up to the failed step)
  const effectiveProgress = isFailed
    ? Math.max(getPipelineProgress(state.replace('_FAILED', '')), 20)
    : progress

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-8 overflow-y-auto">
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex flex-col items-center gap-6 w-full max-w-md"
        >
          {/* Animated State Icon */}
          <div className="relative">
            <AnimatedStateIcon state={state} />
            {/* Pulse ring behind icon for active states */}
            {!isFailed && !isDelivered && (
              <motion.div
                className="absolute inset-0 rounded-full"
                animate={{
                  boxShadow: [
                    '0 0 0 0 rgba(124, 58, 237, 0.2)',
                    '0 0 0 20px rgba(124, 58, 237, 0)',
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
          </div>

          {/* Current Pipeline Step Name */}
          <div className="text-center">
            <h2 className={`text-2xl font-semibold tracking-tight ${
              isFailed ? 'text-rose-300' :
              isDelivered ? 'text-lime-300' :
              'text-[var(--app-text-primary)]'
            }`}>
              {currentStepLabel}
            </h2>
            <p className="text-sm text-[var(--app-text-muted)] mt-1 font-mono">
              {state.replace(/_/g, ' ')}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-[var(--app-text-muted)]">Pipeline Progress</span>
              <span className={
                isFailed ? 'text-rose-400' :
                isDelivered ? 'text-lime-400' :
                'text-amber-400'
              }>
                {effectiveProgress}%
              </span>
            </div>
            <Progress
              value={effectiveProgress}
              className={`h-2 ${
                isFailed ? '[&>[data-slot=progress-indicator]]:bg-rose-500' :
                isDelivered ? '[&>[data-slot=progress-indicator]]:bg-lime-500' :
                '[&>[data-slot=progress-indicator]]:bg-violet-500'
              }`}
            />
          </div>

          {/* Step-by-Step Breakdown */}
          <div className="w-full space-y-1.5">
            {PIPELINE_STEPS.map((step, idx) => {
              const isCompleted = idx < currentIdx || isDelivered
              const isCurrent = idx === currentIdx && !isFailed && !isDelivered
              const isFailedStep = isFailed && step.key === state.replace('_FAILED', '')
              const StepIcon = step.icon
              const duration = stepDurations[step.key]

              return (
                <motion.div
                  key={step.key}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.06 }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isCurrent ? 'bg-violet-500/10 ring-1 ring-violet-500/20' :
                    isFailedStep ? 'bg-rose-500/10 ring-1 ring-rose-500/20' :
                    'hover:bg-white/[0.02]'
                  }`}
                >
                  {/* Step Status Icon */}
                  <div className="shrink-0 w-6 h-6 flex items-center justify-center">
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-lime-400" />
                    ) : isFailedStep ? (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    ) : isCurrent ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                      >
                        <Loader2 className="w-4 h-4 text-[var(--app-accent-text)]" />
                      </motion.div>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-zinc-700" />
                    )}
                  </div>

                  {/* Step Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${
                        isCompleted ? 'text-[var(--app-text-secondary)]' :
                        isCurrent ? 'text-[var(--app-accent-text)]' :
                        isFailedStep ? 'text-rose-300' :
                        'text-[var(--app-text-dim)]'
                      }`}>
                        {step.label}
                      </span>
                      {isCurrent && (
                        <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-[var(--app-accent-bg)] text-[var(--app-accent-text)] border border-[color:var(--app-accent-border)]">
                          ACTIVE
                        </span>
                      )}
                      {isFailedStep && (
                        <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          FAILED
                        </span>
                      )}
                    </div>
                    {duration !== undefined && (
                      <span className="text-[9px] font-mono text-[var(--app-text-dim)]">
                        {formatDuration(duration)}
                      </span>
                    )}
                  </div>

                  {/* Step Duration / Estimate */}
                  <div className="shrink-0 text-[9px] font-mono text-[var(--app-text-dim)]">
                    {isCurrent ? (
                      <span className="text-amber-400">Running...</span>
                    ) : isCompleted && duration ? (
                      <span className="text-lime-500/60">{formatDuration(duration)}</span>
                    ) : !isCompleted && !isFailedStep ? (
                      <span>~{AVERAGE_STEP_TIMES[step.key] || 5}s</span>
                    ) : null}
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Time & Metadata */}
          <div className="w-full flex flex-wrap items-center justify-center gap-3 text-[10px] font-mono text-[var(--app-text-dim)]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 cursor-default">
                    <Clock className="w-3 h-3" />
                    Elapsed: <LiveElapsed createdAt={job.createdAt} />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Created {timeAgo(job.createdAt)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {!isFailed && !isDelivered && (
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                ETA: {estimateTimeRemaining(state)}
              </span>
            )}

            {job.builderName && (
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3" />
                {job.builderName}
              </span>
            )}

            {job.generationPath && (
              <span className="flex items-center gap-1">
                <Code2 className="w-3 h-3" />
                {job.generationPath}
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 mt-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 border-[color:var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-primary)] hover:border-[color:var(--app-border)]"
              onClick={onViewLogs}
            >
              <FileText className="w-3.5 h-3.5" />
              View Logs
            </Button>

            {isCancelable && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-rose-500/30 text-rose-400 hover:text-rose-300 hover:border-rose-500/50 hover:bg-rose-500/10"
                onClick={() => onCancel(job)}
              >
                <Ban className="w-3.5 h-3.5" />
                Cancel Job
              </Button>
            )}

            {isFailed && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-amber-500/30 text-amber-400 hover:text-amber-300 hover:border-amber-500/50 hover:bg-amber-500/10"
                onClick={onViewLogs}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                View Error
              </Button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
