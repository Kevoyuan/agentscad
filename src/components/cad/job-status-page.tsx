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
  timeAgo, getStateInfo, ValidationResult,
} from './types'
import { highlightScad } from '@/lib/scad-highlight'

// ─── Types ──────────────────────────────────────────────────────────────────

interface JobStatusPageProps {
  job: Job
  streamEvents?: Array<{ step: string; state: string; message: string; timestamp: string }>
  onViewLogs: () => void
  onViewError?: () => void
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

function parseObject(value: string | null): Record<string, unknown> {
  return parseJSON<Record<string, unknown>>(value, {})
}

// ─── Live Elapsed Timer ─────────────────────────────────────────────────────

function LiveElapsed({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(() => calculateElapsed(createdAt))

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(calculateElapsed(createdAt))
    }, 1000)
    return () => clearInterval(interval)
  }, [createdAt])

  return <span>{elapsed}</span>
}

function FailureDiagnostics({ job }: { job: Job }) {
  const logs = parseJSON<ExecutionLog[]>(job.executionLogs, [])
  const validationResults = parseJSON<ValidationResult[]>(job.validationResults, [])
  const renderLog = parseJSON<{ warnings?: string[]; errors?: string[]; render_time_ms?: number } | null>(job.renderLog, null)
  const failedLogs = logs.filter((log) => {
    const text = `${log.event} ${log.message}`.toLowerCase()
    return text.includes('failed') || text.includes('error')
  })
  const failedValidation = validationResults.filter((rule) => !rule.passed)
  const renderMessages = [...(renderLog?.errors || []), ...(renderLog?.warnings || [])]
  const hasDiagnostics = failedLogs.length > 0 || failedValidation.length > 0 || renderMessages.length > 0

  if (!hasDiagnostics) {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
        <div className="flex items-center gap-2 text-amber-300">
          <AlertCircle className="h-4 w-4" />
          <span className="text-[10px] font-mono uppercase tracking-widest">No diagnostic payload</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--cad-text-muted)]">
          This job is failed, but no execution log, validation result, or render warning was returned with the job.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-0 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-rose-300">
          <AlertCircle className="h-4 w-4" />
          <span className="text-[10px] font-mono uppercase tracking-widest">Error diagnostics</span>
        </div>
        <span className="text-[9px] font-mono text-[var(--cad-text-muted)]">
          {failedLogs.length + failedValidation.length + renderMessages.length} items
        </span>
      </div>
      <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
        {failedLogs.map((log, idx) => (
          <div key={`log-${idx}`} className="rounded border border-rose-500/15 bg-black/15 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-mono text-rose-300">{log.event}</span>
              <span className="text-[8px] font-mono text-[var(--cad-text-muted)]">{new Date(log.timestamp).toLocaleTimeString()}</span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--cad-text-secondary)]">{log.message}</p>
          </div>
        ))}
        {failedValidation.map((rule) => (
          <div key={rule.rule_id} className="rounded border border-amber-500/15 bg-amber-500/5 px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-black/20 px-1 text-[8px] font-mono text-amber-300">{rule.rule_id}</span>
              <span className="text-[10px] font-medium text-[var(--cad-text)]">{rule.rule_name}</span>
              {rule.is_critical && <span className="text-[8px] font-mono uppercase text-rose-300">critical</span>}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--cad-text-secondary)]">{rule.message}</p>
          </div>
        ))}
        {renderMessages.map((message, idx) => (
          <div key={`render-${idx}`} className="rounded border border-orange-500/15 bg-orange-500/5 px-2 py-1.5">
            <span className="text-[9px] font-mono text-orange-300">RENDER</span>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--cad-text-secondary)]">{message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function GenerationEvidence({
  job,
  streamEvents,
}: {
  job: Job
  streamEvents: Array<{ step: string; state: string; message: string; timestamp: string }>
}) {
  const logs = parseJSON<ExecutionLog[]>(job.executionLogs, [])
  const designResult = parseObject(job.designResult)
  const researchResult = parseObject(job.researchResult)
  const traceEvents = streamEvents.length
    ? streamEvents
    : logs.map((log) => ({
        step: log.event,
        state: log.event,
        message: log.message,
        timestamp: log.timestamp,
      }))

  const inferenceFacts = [
    job.modelId ? `model: ${job.modelId}` : null,
    job.generationPath ? `path: ${job.generationPath}` : null,
    typeof designResult.approach === 'string' ? `approach: ${designResult.approach}` : null,
    typeof researchResult.summary === 'string' ? `summary: ${researchResult.summary}` : null,
  ].filter(Boolean)

  const scadSource = job.scadSource || ''
  const highlightedScad = scadSource ? highlightScad(scadSource) : ''
  const lineCount = scadSource ? scadSource.split('\n').length : 0

  return (
    <div className="min-h-0">
      <div className="grid min-h-0 gap-2 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <div className="min-h-0 rounded-lg border border-[color:var(--cad-border)] bg-black/10">
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--cad-border)] px-2.5 py-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--cad-text-secondary)]">Inference Stream</span>
            <span className="cad-status-dot" />
          </div>
          {inferenceFacts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-[color:var(--cad-border)] px-2.5 py-2">
              {inferenceFacts.map((fact) => (
                <span key={fact} className="rounded border border-[color:var(--cad-border)] bg-[var(--cad-surface)] px-1.5 py-0.5 text-[8px] font-mono text-[var(--cad-text-muted)]">
                  {fact}
                </span>
              ))}
            </div>
          )}
          <div className="max-h-48 space-y-1.5 overflow-y-auto p-2 pr-1">
            {(traceEvents.length ? traceEvents : [{ step: 'waiting', state: job.state, message: 'Waiting for inference stream...', timestamp: job.updatedAt || job.createdAt }]).map((event, idx) => (
              <motion.div
                key={`${event.timestamp}-${idx}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded border border-[color:var(--cad-border)] bg-black/15 px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[9px] font-mono text-[var(--cad-accent)]">{event.step}</span>
                  <span className="shrink-0 text-[8px] font-mono text-[var(--cad-text-muted)]">{new Date(event.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--cad-text-secondary)]">{event.message}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="min-h-0 overflow-hidden rounded-lg border border-[color:var(--cad-border)] bg-[var(--app-code-bg)]">
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--cad-border)] px-2.5 py-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--cad-text-secondary)]">SCAD Code</span>
            <span className="rounded border border-[color:var(--cad-border)] bg-[var(--cad-surface)] px-1.5 py-0.5 text-[8px] font-mono text-[var(--cad-text-muted)]">
              {lineCount ? `${lineCount} lines` : 'pending'}
            </span>
          </div>
          {scadSource ? (
            <pre className="max-h-48 overflow-auto p-2 text-[9px] font-mono leading-relaxed text-[var(--cad-text-secondary)]">
              <code dangerouslySetInnerHTML={{ __html: highlightedScad }} />
            </pre>
          ) : (
            <div className="flex h-28 items-center justify-center px-4 text-center text-[10px] leading-relaxed text-[var(--cad-text-muted)]">
              SCAD source will appear as soon as generation completes.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function JobStatusPage({ job, streamEvents = [], onViewLogs, onViewError, onCancel, isCancelable }: JobStatusPageProps) {
  const state = job.state
  const progress = getPipelineProgress(state)
  const currentIdx = PIPELINE_STEPS.findIndex(s => s.key === state)
  const failedStates = ['VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED']
  const isFailed = failedStates.includes(state)
  const isDelivered = state === 'DELIVERED'
  const stepDurations = useMemo(() => getStepDurations(job.executionLogs), [job.executionLogs])
  const latestEvent = streamEvents[streamEvents.length - 1]

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
    <div className="h-full p-2 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="h-full cad-viewport-shell flex min-h-0 flex-col gap-4 overflow-hidden p-4"
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:var(--cad-border)] bg-[var(--cad-surface)]/70 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                isFailed ? 'border-rose-500/25 bg-rose-500/10 text-rose-300' :
                isDelivered ? 'border-lime-500/25 bg-lime-500/10 text-lime-300' :
                'border-[color:var(--cad-border)] bg-[var(--cad-accent-soft)] text-[var(--cad-accent)]'
              }`}>
                {isFailed ? <XCircle className="h-5 w-5" /> :
                 isDelivered ? <CheckCircle2 className="h-5 w-5" /> :
                 <Loader2 className="h-5 w-5 animate-spin" />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={`text-lg font-semibold tracking-tight ${
                    isFailed ? 'text-rose-300' :
                    isDelivered ? 'text-lime-300' :
                    'text-[var(--cad-text)]'
                  }`}>
                    {currentStepLabel}
                  </h2>
                  <span className="rounded border border-[color:var(--cad-border)] bg-black/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-[var(--cad-text-muted)]">
                    {state.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-[var(--cad-text-muted)]">
                  {latestEvent?.message || 'Queued CAD generation pipeline...'}
                </p>
              </div>
            </div>

            <div className="flex min-w-[180px] items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--cad-border)]">
                <motion.div
                  className={`h-full rounded-full ${
                    isFailed ? 'bg-rose-500' :
                    isDelivered ? 'bg-lime-500' :
                    'bg-[var(--cad-accent)]'
                  }`}
                  animate={{ width: `${effectiveProgress}%` }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                />
              </div>
              <span className={`shrink-0 text-[10px] font-mono ${
                isFailed ? 'text-rose-400' :
                isDelivered ? 'text-lime-400' :
                'text-[var(--cad-measure)]'
              }`}>
                {effectiveProgress}%
              </span>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col gap-3">
              <div className="rounded-lg border border-[color:var(--cad-border)] bg-[var(--cad-surface)]/45 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--cad-text-secondary)]">Current activity</span>
                  <span className="text-[9px] font-mono text-[var(--cad-text-muted)]">
                    {latestEvent ? new Date(latestEvent.timestamp).toLocaleTimeString() : 'waiting'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-[var(--cad-text-secondary)]">
                  {latestEvent?.message || 'Queued CAD generation pipeline...'}
                </p>
              </div>

              <div className="rounded-lg border border-[color:var(--cad-border)] bg-[var(--cad-surface)]/45 p-3">
                <div className="mb-3 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-[var(--cad-text-muted)]">Pipeline Progress</span>
                  <span className={
                    isFailed ? 'text-rose-400' :
                    isDelivered ? 'text-lime-400' :
                    'text-[var(--cad-measure)]'
                  }>
                    {effectiveProgress}%
                  </span>
                </div>
                <Progress
                  value={effectiveProgress}
                  className={`h-2 ${
                    isFailed ? '[&>[data-slot=progress-indicator]]:bg-rose-500' :
                    isDelivered ? '[&>[data-slot=progress-indicator]]:bg-lime-500' :
                    '[&>[data-slot=progress-indicator]]:bg-[var(--cad-accent)]'
                  }`}
                />
              </div>

              <div className="min-h-0 flex-1 rounded-lg border border-[color:var(--cad-border)] bg-[var(--cad-surface)]/45 p-2">
                <div className="space-y-1">
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
                      transition={{ duration: 0.2, delay: idx * 0.04 }}
                      className={`flex items-center gap-2 rounded px-2 py-1.5 transition-colors ${
                        isCurrent ? 'bg-[var(--cad-accent-soft)] ring-1 ring-[color:var(--cad-border-strong)]' :
                        isFailedStep ? 'bg-rose-500/10 ring-1 ring-rose-500/20' :
                        'hover:bg-[var(--app-hover-subtle)]'
                      }`}
                    >
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {isCompleted ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-lime-400" />
                        ) : isFailedStep ? (
                          <XCircle className="h-3.5 w-3.5 text-rose-400" />
                        ) : isCurrent ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--app-accent-text)]" />
                        ) : (
                          <StepIcon className="h-3.5 w-3.5 text-[var(--app-state-neutral-dot)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`truncate text-[11px] font-medium ${
                            isCompleted ? 'text-[var(--app-text-secondary)]' :
                            isCurrent ? 'text-[var(--cad-accent)]' :
                            isFailedStep ? 'text-rose-300' :
                            'text-[var(--app-text-dim)]'
                          }`}>
                            {step.label}
                          </span>
                          {isCurrent && (
                            <span className="rounded border border-[color:var(--cad-border)] bg-[var(--cad-accent-soft)] px-1 py-0.5 text-[7px] font-mono text-[var(--cad-accent)]">
                              ACTIVE
                            </span>
                          )}
                          {isFailedStep && (
                            <span className="rounded border border-rose-500/30 bg-rose-500/20 px-1 py-0.5 text-[7px] font-mono text-rose-400">
                              FAILED
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-[8px] font-mono text-[var(--app-text-dim)]">
                        {isCurrent ? (
                          <span className="text-[var(--cad-measure)]">Running</span>
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
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-[var(--app-text-dim)]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <LiveElapsed createdAt={job.createdAt} />
                </span>
                {job.generationPath && (
                  <span className="flex min-w-0 items-center gap-1 truncate">
                    <Code2 className="w-3 h-3 shrink-0" />
                    {job.generationPath}
                  </span>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-lg border border-[color:var(--cad-border)] bg-[var(--cad-surface)]/35 p-3">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--cad-border)] pb-2">
                <div>
                  <h3 className="text-[11px] font-mono uppercase tracking-widest text-[var(--cad-text-secondary)]">Generation evidence</h3>
                  <p className="mt-0.5 text-[10px] text-[var(--cad-text-muted)]">Inference stream, generated SCAD, and failure diagnostics</p>
                </div>
                {job.builderName && (
                  <span className="hidden max-w-[240px] truncate rounded border border-[color:var(--cad-border)] bg-black/10 px-2 py-1 text-[9px] font-mono text-[var(--cad-text-muted)] sm:block">
                    {job.builderName}
                  </span>
                )}
              </div>
              <div className="min-h-0 overflow-y-auto pr-1">
                <GenerationEvidence job={job} streamEvents={streamEvents} />
                {isFailed && <div className="mt-3"><FailureDiagnostics job={job} /></div>}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex shrink-0 items-center justify-center gap-3">
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
                onClick={onViewError || onViewLogs}
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
