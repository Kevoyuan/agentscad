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

// Map states to solid background colors with subtle opacity
const STATE_BG_CLASS: Record<string, string> = {
  NEW: 'bg-[var(--app-state-neutral-bg)]',
  SCAD_GENERATED: 'bg-amber-500/15',
  RENDERED: 'bg-cyan-500/15',
  VALIDATED: 'bg-emerald-500/15',
  DELIVERED: 'bg-lime-500/15',
  VALIDATION_FAILED: 'bg-rose-500/15',
  GEOMETRY_FAILED: 'bg-rose-500/15',
  RENDER_FAILED: 'bg-rose-500/15',
  DEBUGGING: 'bg-orange-500/15',
  REPAIRING: 'bg-orange-500/15',
  HUMAN_REVIEW: 'bg-yellow-500/15',
  CANCELLED: 'bg-[var(--app-state-neutral-bg)]',
}

export function StateBadge({ state, size = 'sm', timestamp }: { state: string; size?: 'sm' | 'md'; timestamp?: string }) {
  const info = getStateInfo(state)
  const label = state.replace(/_/g, ' ')
  const isFailed = FAILED_STATES.includes(state)
  const isDelivered = state === 'DELIVERED'
  const isProcessing = ACTIVE_STATES.includes(state)
  const bgClass = STATE_BG_CLASS[state] || 'bg-[var(--app-state-neutral-bg)]'

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
        <div className="text-[10px] opacity-70 mt-0.5">{formatTimestamp(timestamp)}</div>
      )}
    </div>
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.span
          key={state}
          className={`inline-flex items-center gap-1.5 rounded-md font-mono relative ${size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} ${bgClass} ${info.text} ${info.border} border linear-transition ${isFailed ? 'badge-shake' : ''}`}
          initial={{ scale: 1.15 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <span className={`relative w-1.5 h-1.5 rounded-full ${info.dot} ${isProcessing || isDelivered ? 'status-pulse' : ''}`} />
          <span className="relative">{label}</span>
        </motion.span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  )
}
