'use client'

import { getStateInfo } from './types'

export function StateBadge({ state, size = 'sm' }: { state: string; size?: 'sm' | 'md' }) {
  const info = getStateInfo(state)
  const label = state.replace(/_/g, ' ')
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md font-mono ${size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} ${info.bg} ${info.text} ${info.border} border`}>
      <span className={`w-1.5 h-1.5 rounded-full ${info.dot} ${state === 'DELIVERED' ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  )
}
