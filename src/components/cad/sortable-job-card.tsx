'use client'

import { forwardRef, HTMLAttributes, CSSProperties, useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { Job, CANCELABLE_STATES, timeAgo, getPriorityColor, getStateInfo } from './types'
import { StateBadge } from './state-badge'
import { PartFamilyIcon } from './part-family-icon'
import { TagBadges } from './tag-badges'
import { Button } from '@/components/ui/button'
import {
  Play, Ban, Repeat, Trash2, CheckSquare, Square,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SortableJobCardProps {
  job: Job
  isSelected: boolean
  isChecked: boolean
  isDragging?: boolean
  onSelect: (job: Job) => void
  onToggleSelect: (id: string) => void
  onProcess: (job: Job) => void
  onCancel: (job: Job) => void
  onDuplicate: (job: Job) => void
  onDelete: (id: string) => void
}

// Processing states that should show the pulse ring animation
const PROCESSING_STATES = ['SCAD_GENERATED', 'RENDERED', 'VALIDATED', 'DEBUGGING', 'REPAIRING', 'HUMAN_REVIEW']

// ─── Sortable Job Card ──────────────────────────────────────────────────────

export function SortableJobCard({
  job,
  isSelected,
  isChecked,
  isDragging = false,
  onSelect,
  onToggleSelect,
  onProcess,
  onCancel,
  onDuplicate,
  onDelete,
}: SortableJobCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: job.id })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
  }

  // Map state colors for left border
  const borderColorMap: Record<string, string> = {
    NEW: '#94a3b8', SCAD_GENERATED: '#fbbf24', RENDERED: '#22d3ee',
    VALIDATED: '#34d399', DELIVERED: '#a3e635', DEBUGGING: '#fb923c',
    REPAIRING: '#fb923c', VALIDATION_FAILED: '#fb7185', GEOMETRY_FAILED: '#f87171',
    RENDER_FAILED: '#f87171', HUMAN_REVIEW: '#facc15', CANCELLED: '#71717a',
  }
  const leftBorderColor = borderColorMap[job.state] || '#71717a'
  const isCancelable = CANCELABLE_STATES.includes(job.state)
  const isProcessing = PROCESSING_STATES.includes(job.state)

  // Priority badge bounce on change - use key based on priority to trigger re-animation
  const [prevPriority, setPrevPriority] = useState(job.priority)
  const [priorityKey, setPriorityKey] = useState(0)
  if (job.priority !== prevPriority) {
    setPrevPriority(job.priority)
    setPriorityKey(k => k + 1)
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={{ ...style, '--border-color': leftBorderColor } as CSSProperties}
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ scale: 1.01 }}
      transition={{ scale: { duration: 0.2, ease: 'easeOut' } }}
      className={`group/card relative rounded-lg p-2.5 cursor-pointer linear-transition overflow-hidden job-card-left-border linear-shadow-sm ${
        isDragging || isSortableDragging
          ? 'shadow-xl ring-2 ring-violet-500/20 scale-[1.02] z-50'
          : ''
      } ${
        isProcessing ? 'status-pulse' : ''
      } ${
        isSelected
          ? 'linear-selected bg-violet-600/10 border border-violet-500/30'
          : 'linear-surface border border-white/[0.06] hover:bg-white/[0.04]'
      }`}
      onClick={() => onSelect(job)}
    >
      {/* Drag Handle */}
      <div
        className="absolute top-2 right-1 z-10 cursor-grab active:cursor-grabbing text-zinc-700 hover:text-zinc-400 transition-colors"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* Select checkbox */}
      <div className="absolute top-2 left-1 z-10" onClick={e => e.stopPropagation()}>
        <button
          className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-colors ${
            isChecked ? 'bg-violet-500 text-white' : 'bg-zinc-800/60 text-zinc-600 hover:bg-zinc-700/60'
          }`}
          onClick={() => onToggleSelect(job.id)}
        >
          {isChecked ? <CheckSquare className="w-2.5 h-2.5" /> : <Square className="w-2.5 h-2.5" />}
        </button>
      </div>

      <div className="pl-4 relative z-[1]">
        <div className="flex items-start justify-between gap-1.5 pr-5">
          <p className="text-[11px] text-zinc-300 leading-tight line-clamp-2 flex-1">{job.inputRequest}</p>
          <div className="flex items-center gap-1 shrink-0">
            <PartFamilyIcon family={job.partFamily || 'unknown'} size="xs" />
            <span
              key={priorityKey}
              className={`text-[8px] font-mono px-1 py-0.5 rounded border ${getPriorityColor(job.priority)} linear-transition`}
            >
              P{job.priority}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <StateBadge state={job.state} />
          <span className="text-[8px] text-zinc-700 font-mono">{timeAgo(job.createdAt)}</span>
        </div>
        <TagBadges customerId={job.customerId} maxDisplay={3} />
        {/* Action Buttons - Individual hover colors */}
        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover/card:opacity-100 transition-all duration-300 translate-y-1 group-hover/card:translate-y-0" onClick={e => e.stopPropagation()}>
          {job.state === 'NEW' && (
            <Button variant="ghost" size="sm" className="h-5 text-[8px] gap-0.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10" onClick={() => onProcess(job)}>
              <Play className="w-2.5 h-2.5" />Process
            </Button>
          )}
          {isCancelable && (
            <Button variant="ghost" size="sm" className="h-5 text-[8px] gap-0.5 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10" onClick={() => onCancel(job)}>
              <Ban className="w-2.5 h-2.5" />Cancel
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-5 text-[8px] gap-0.5 text-zinc-500 hover:text-emerald-300 hover:bg-emerald-500/10" onClick={() => onDuplicate(job)}>
            <Repeat className="w-2.5 h-2.5" />Duplicate
          </Button>
          <Button variant="ghost" size="sm" className="h-5 text-[8px] gap-0.5 text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10" onClick={() => onDelete(job.id)}>
            <Trash2 className="w-2.5 h-2.5" />Delete
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Drag Overlay Card (rendered while dragging) ────────────────────────────

export function DragOverlayCard({ job }: { job: Job }) {
  const borderColorMap: Record<string, string> = {
    NEW: '#94a3b8', SCAD_GENERATED: '#fbbf24', RENDERED: '#22d3ee',
    VALIDATED: '#34d399', DELIVERED: '#a3e635', DEBUGGING: '#fb923c',
    REPAIRING: '#fb923c', VALIDATION_FAILED: '#fb7185', GEOMETRY_FAILED: '#f87171',
    RENDER_FAILED: '#f87171', HUMAN_REVIEW: '#facc15', CANCELLED: '#71717a',
  }
  const leftBorderColor = borderColorMap[job.state] || '#71717a'

  return (
    <div
      style={{ '--border-color': leftBorderColor } as CSSProperties}
      className="rounded-lg p-2.5 linear-surface border border-violet-500/30 shadow-2xl ring-2 ring-violet-500/20 scale-[1.03] job-card-left-border"
    >
      <div className="pl-4 pr-5">
        <div className="flex items-start justify-between gap-1.5">
          <p className="text-[11px] text-zinc-300 leading-tight line-clamp-2 flex-1">{job.inputRequest}</p>
          <div className="flex items-center gap-1 shrink-0">
            <PartFamilyIcon family={job.partFamily || 'unknown'} size="xs" />
            <span className={`text-[8px] font-mono px-1 py-0.5 rounded border ${getPriorityColor(job.priority)}`}>
              P{job.priority}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <StateBadge state={job.state} />
          <span className="text-[8px] text-zinc-700 font-mono">{timeAgo(job.createdAt)}</span>
        </div>
        <TagBadges customerId={job.customerId} maxDisplay={3} />
      </div>
    </div>
  )
}
