'use client'

import { motion } from 'framer-motion'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getStateInfo } from './types'
import { shimmerStyle, shimmer, shimmerTransition } from './motion-presets'

const ACTIVE_STATES = ['NEW', 'SCAD_GENERATED', 'RENDERED', 'VALIDATED', 'DEBUGGING', 'REPAIRING']
const FAILED_STATES = ['VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED']

// Map states to gradient CSS class
const STATE_GRADIENT_CLASS: Record<string, string> = {
  NEW: 'badge-gradient-new',
  SCAD_GENERATED: 'badge-gradient-scad',
  RENDERED: 'badge-gradient-render',
  VALIDATED: 'badge-gradient-validated',
  DELIVERED: 'badge-gradient-delivered',
  VALIDATION_FAILED: 'badge-gradient-failed',
  GEOMETRY_FAILED: 'badge-gradient-failed',
  RENDER_FAILED: 'badge-gradient-failed',
  CANCELLED: 'badge-gradient-cancelled',
}

export function StateBadge({ state, size = 'sm', timestamp }: { state: string; size?: 'sm' | 'md'; timestamp?: string }) {
  const info = getStateInfo(state)
  const label = state.replace(/_/g, ' ')
  const isActive = ACTIVE_STATES.includes(state)
  const isFailed = FAILED_STATES.includes(state)
  const isDelivered = state === 'DELIVERED'
  const gradientClass = STATE_GRADIENT_CLASS[state] || ''

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
          className={`inline-flex items-center gap-1.5 rounded-md font-mono relative overflow-hidden badge-hover-shift ${size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} ${gradientClass} ${info.text} ${info.border} border ${isFailed ? 'badge-shake' : ''} ${isActive ? 'badge-breathe' : ''} ${isDelivered ? 'badge-sparkle' : ''}`}
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        >
          {/* Background shimmer for active states */}
          {isActive && !isDelivered && (
            <motion.span
              className="absolute inset-0 pointer-events-none"
              style={shimmerStyle}
              variants={shimmer}
              initial="initial"
              animate="animate"
              transition={shimmerTransition}
            />
          )}
          <span className={`relative w-1.5 h-1.5 rounded-full ${info.dot} ${isDelivered ? 'animate-pulse' : isActive ? 'animate-pulse' : ''}`} />
          <span className="relative">{label}</span>
        </motion.span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  )
}
