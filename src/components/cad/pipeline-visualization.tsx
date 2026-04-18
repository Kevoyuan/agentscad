'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { PIPELINE_STEPS, ExecutionLog, parseJSON, getPipelineProgress } from './types'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

export function PipelineVisualization({ state, job }: { state: string; job?: { executionLogs?: string | null; createdAt: string; updatedAt: string; completedAt?: string | null } }) {
  const currentIdx = PIPELINE_STEPS.findIndex(s => s.key === state)
  const failedStates = ['GEOMETRY_FAILED', 'RENDER_FAILED', 'VALIDATION_FAILED']
  const isFailed = failedStates.includes(state)
  const progress = getPipelineProgress(state)

  // Calculate step durations from execution logs
  const executionLogs = job?.executionLogs ?? null
  const stepDurations = useMemo(() => {
    if (!executionLogs) return {} as Record<string, number>
    const logs = parseJSON<ExecutionLog[]>(executionLogs, [])
    const stepTimes: Record<string, { start: number; end?: number }> = {}

    for (const log of logs) {
      const ts = new Date(log.timestamp).getTime()
      // Find which pipeline step this event belongs to
      for (const step of PIPELINE_STEPS) {
        if (log.event === step.key) {
          if (!stepTimes[step.key]) {
            stepTimes[step.key] = { start: ts }
          } else {
            stepTimes[step.key].end = ts
          }
        }
      }
      // Also handle transitions - when we reach the NEXT step, the previous one ends
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

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex items-center gap-0.5">
        {PIPELINE_STEPS.map((step, idx) => {
          const isCompleted = idx < currentIdx
          const isCurrent = idx === currentIdx
          const Icon = step.icon
          const duration = stepDurations[step.key]

          return (
            <div key={step.key} className="flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.div
                    className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md transition-all duration-300 cursor-default ${
                      isCompleted ? 'text-lime-400' :
                      isCurrent && !isFailed ? 'text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/20' :
                      isCurrent && isFailed ? 'text-rose-400 bg-rose-500/10 ring-1 ring-rose-500/20' :
                      'text-zinc-600'
                    }`}
                    whileHover={{ scale: 1.12 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <div className="relative">
                      <Icon className={`w-3.5 h-3.5 ${isCurrent && !isFailed ? 'animate-pulse' : ''}`} />
                    </div>
                    <span className="text-[8px] font-mono tracking-wider">{step.label}</span>
                    {/* Time spent indicator below completed steps */}
                    {isCompleted && duration !== undefined && (
                      <span className="text-[7px] font-mono text-lime-500/60">{formatDuration(duration)}</span>
                    )}
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{step.label}: {step.key.replace(/_/g, ' ')}</p>
                  {duration !== undefined && (
                    <p className="text-[10px] text-zinc-400">Duration: {formatDuration(duration)}</p>
                  )}
                </TooltipContent>
              </Tooltip>
              {/* Connecting line between steps */}
              {idx < PIPELINE_STEPS.length - 1 && (
                <div className="relative flex items-center mx-0.5">
                  {/* Background line */}
                  <div className="w-4 h-0.5 bg-zinc-800 rounded-full" />
                  {/* Filled gradient line */}
                  {idx < currentIdx && (
                    <motion.div
                      className="absolute top-1/2 -translate-y-1/2 h-0.5 rounded-full"
                      style={{
                        backgroundColor: '#84cc16',
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: 16 }}
                      transition={{ duration: 0.4, delay: idx * 0.08 }}
                    />
                  )}
                  <ChevronRight className={`w-2.5 h-2.5 relative z-10 linear-transition ${idx < currentIdx ? 'text-lime-500/60' : 'text-zinc-700'}`} />
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
    </div>
  )
}
