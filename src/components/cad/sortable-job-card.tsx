'use client'

import { CSSProperties, useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Clock } from 'lucide-react'
import { Job, CANCELABLE_STATES, timeAgo, getPriorityColor, getStateInfo, getPipelineProgress } from './types'
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

// Map state colors for left border
const BORDER_COLOR_MAP: Record<string, string> = {
  NEW: '#94a3b8', SCAD_GENERATED: '#fbbf24', RENDERED: '#22d3ee',
  VALIDATED: '#34d399', DELIVERED: '#a3e635', DEBUGGING: '#fb923c',
  REPAIRING: '#fb923c', VALIDATION_FAILED: '#fb7185', GEOMETRY_FAILED: '#f87171',
  RENDER_FAILED: '#f87171', HUMAN_REVIEW: '#facc15', CANCELLED: '#71717a',
}

// Map state colors for progress indicator fill
const PROGRESS_COLOR_MAP: Record<string, string> = {
  NEW: '#94a3b8', SCAD_GENERATED: '#fbbf24', RENDERED: '#22d3ee',
  VALIDATED: '#34d399', DELIVERED: '#a3e635', DEBUGGING: '#fb923c',
  REPAIRING: '#fb923c', VALIDATION_FAILED: '#fb7185', GEOMETRY_FAILED: '#f87171',
  RENDER_FAILED: '#f87171', HUMAN_REVIEW: '#facc15', CANCELLED: '#71717a',
}

// ─── Elapsed Time Helper ──────────────────────────────────────────────────

function formatElapsed(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 0) return '0s'
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
  return `${Math.floor(diff / 86400)}d`
}

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

  const leftBorderColor = BORDER_COLOR_MAP[job.state] || '#71717a'
  const isCancelable = CANCELABLE_STATES.includes(job.state)
  const isProcessing = PROCESSING_STATES.includes(job.state)
  const progressPercent = getPipelineProgress(job.state)
  const progressColor = PROGRESS_COLOR_MAP[job.state] || '#71717a'

  // Priority key for re-rendering badge (no animation, just update text)
  const priorityKey = job.priority

  // Live elapsed time updater - update every 30s to reduce re-renders and card jumping
  const [elapsed, setElapsed] = useState(() => formatElapsed(job.createdAt))
  useEffect(() => {
    const update = () => setElapsed(formatElapsed(job.createdAt))
    update() // Initial calculation
    const interval = setInterval(update, 30000) // 30s to minimize re-renders
    return () => clearInterval(interval)
  }, [job.createdAt])

  // Priority badge visual hierarchy: higher priority = bolder styling
  const priorityVisual = job.priority >= 8
    ? 'bg-rose-500/30 text-rose-300 border-rose-500/40 font-bold shadow-sm shadow-rose-500/10'
    : job.priority >= 6
    ? 'bg-orange-500/25 text-orange-300 border-orange-500/35 font-semibold'
    : job.priority >= 4
    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30 font-normal'

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, '--border-color': leftBorderColor } as CSSProperties}
      className={`group/card relative rounded-lg p-2.5 cursor-pointer linear-transition overflow-hidden job-card-left-border job-card-hover ${
        isDragging || isSortableDragging
          ? 'shadow-xl ring-2 ring-violet-500/20 scale-[1.02] z-50'
          : ''
      } ${
        isProcessing ? 'opacity-95' : '' // Subtle visual indicator without layout shift
      } ${
        isSelected
          ? 'linear-selected bg-violet-600/10 border border-violet-500/30'
          : 'linear-surface border border-[color:var(--app-border)] hover:bg-[var(--app-surface-hover)]'
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
              className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${priorityVisual} linear-transition`}
            >
              P{job.priority}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <StateBadge state={job.state} />
          <span className="text-[8px] text-zinc-700 font-mono">{timeAgo(job.createdAt)}</span>
        </div>

        {/* Elapsed time since creation */}
        <div className="flex items-center gap-1 mt-1">
          <Clock className="w-2.5 h-2.5 text-zinc-700" />
          <span className="text-[8px] text-zinc-600 font-mono">{elapsed} elapsed</span>
        </div>

        {/* Mini progress indicator for pipeline states */}
        {isProcessing && (
          <div className="pipeline-mini-progress mt-1.5">
            <div
              className="pipeline-mini-progress-fill"
              style={{ width: `${progressPercent}%`, backgroundColor: progressColor }}
            />
          </div>
        )}
        {/* Completed progress bar */}
        {job.state === 'DELIVERED' && (
          <div className="pipeline-mini-progress mt-1.5">
            <div
              className="pipeline-mini-progress-fill"
              style={{ width: '100%', backgroundColor: '#a3e635' }}
            />
          </div>
        )}
        {/* Failed progress bar */}
        {(job.state === 'VALIDATION_FAILED' || job.state === 'GEOMETRY_FAILED' || job.state === 'RENDER_FAILED') && (
          <div className="pipeline-mini-progress mt-1.5">
            <div
              className="pipeline-mini-progress-fill"
              style={{ width: `${progressPercent}%`, backgroundColor: '#fb7185' }}
            />
          </div>
        )}

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
    </div>
  )
}

// ─── Drag Overlay Card (rendered while dragging) ────────────────────────────

export function DragOverlayCard({ job }: { job: Job }) {
  const leftBorderColor = BORDER_COLOR_MAP[job.state] || '#71717a'
  const progressPercent = getPipelineProgress(job.state)
  const progressColor = PROGRESS_COLOR_MAP[job.state] || '#71717a'
  const isProcessing = PROCESSING_STATES.includes(job.state)

  // Priority visual for overlay
  const priorityVisual = job.priority >= 8
    ? 'bg-rose-500/30 text-rose-300 border-rose-500/40 font-bold'
    : job.priority >= 6
    ? 'bg-orange-500/25 text-orange-300 border-orange-500/35 font-semibold'
    : job.priority >= 4
    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'

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
            <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${priorityVisual}`}>
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
