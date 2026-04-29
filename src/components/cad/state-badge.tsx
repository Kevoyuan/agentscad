'use client'

import { motion } from 'framer-motion'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getStateInfo } from './types'

const ACTIVE_STATES = ['NEW', 'SCAD_GENERATED', 'RENDERED', 'VALIDATED', 'DEBUGGING', 'REPAIRING']
const FAILED_STATES = ['VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED']
const SHORT_LABELS: Record<string, string> = {
  SCAD_GENERATED: 'Generated',
  VALIDATION_FAILED: 'Blocked',
  GEOMETRY_FAILED: 'Blocked',
  RENDER_FAILED: 'Blocked',
  HUMAN_REVIEW: 'Review',
}

export function StateBadge({ state, size = 'sm', timestamp }: { state: string; size?: 'xs' | 'sm' | 'md'; timestamp?: string }) {
  const info = getStateInfo(state)
  const label = SHORT_LABELS[state] || state.replace(/_/g, ' ')
  const isFailed = FAILED_STATES.includes(state)
  const isDelivered = state === 'DELIVERED'
  const isReview = state === 'HUMAN_REVIEW'
  const isProcessing = ACTIVE_STATES.includes(state)

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts)
      return d.toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      })
    } catch {
      return ts
    }
  }

  const tooltipContent = (
    <div className="text-xs">
      <div className="font-mono font-semibold">{state}</div>
      {timestamp && (
        <div className="text-[13px] opacity-70 mt-0.5">{formatTimestamp(timestamp)}</div>
      )}
    </div>
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.span
          key={state}
          className={`inline-flex items-center rounded-sm font-medium relative ${size === 'xs' ? 'gap-1 text-[8px] px-1 py-0.5' : size === 'sm' ? 'gap-1.5 text-xs px-1.5 py-0.5' : 'gap-1.5 text-[13px] px-2 py-0.5'} ${isFailed ? 'text-rose-600 dark:text-rose-400' : isDelivered ? 'text-emerald-700 dark:text-emerald-400' : isReview ? 'text-amber-600 dark:text-amber-400' : isProcessing ? 'text-[var(--app-accent-text)]' : 'text-[var(--app-text-muted)]'} bg-transparent border border-transparent linear-transition`}
          initial={{ scale: 1.06 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <span className={`relative rounded-full ${isFailed ? 'bg-rose-500' : isDelivered ? 'bg-emerald-500' : isReview ? 'bg-amber-500' : isProcessing ? 'bg-[var(--app-accent)]' : info.dot} ${isProcessing || isDelivered ? 'status-pulse' : ''} ${size === 'xs' ? 'w-1 h-1' : 'w-1.5 h-1.5'}`} />
          <span className="relative">{label}</span>
        </motion.span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  )
}
