'use client'

import dynamic from 'next/dynamic'
import {
  Box, Play, Clock, CheckCircle2, Loader2,
  Cpu, Layers, Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResizablePanel } from '@/components/ui/resizable'

import { Job, CANCELABLE_STATES, timeAgo } from '@/components/cad/types'
import { StateBadge } from '@/components/cad/state-badge'
import { PartFamilyIcon, getPartFamilyLabel, getPartFamilyColor } from '@/components/cad/part-family-icon'
import { QuickActionsBar } from '@/components/cad/quick-actions-bar'

const ThreeDViewer = dynamic(() => import('@/components/cad/three-d-viewer').then(m => ({ default: m.ThreeDViewer })), { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-[var(--app-text-muted)]" /></div> })
const JobStatusPage = dynamic(() => import('@/components/cad/job-status-page').then(m => ({ default: m.JobStatusPage })), { ssr: false, loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-5 h-5 animate-spin text-[var(--app-text-muted)]" /></div> })

export function ViewerPanel({
  selectedJob,
  isProcessing,
  onProcess,
  onCancel,
  onDelete,
  onDownloadScad,
  onView3D,
  onEditPriority,
  onViewLog,
  onShare,
  onSetActiveTab,
  onShowComposer,
}: {
  selectedJob: Job | null
  isProcessing: boolean
  onProcess: (job: Job) => void
  onCancel: (job: Job) => void
  onDelete: (id: string) => void
  onDownloadScad: (job: Job) => void
  onView3D: () => void
  onEditPriority: (job: Job) => void
  onViewLog: (job: Job) => void
  onShare: (job: Job) => void
  onSetActiveTab: (tab: string) => void
  onShowComposer: () => void
}) {
  return (
    <ResizablePanel defaultSize={40} minSize={25}>
      <div className="flex flex-col h-full bg-[var(--app-bg)]">
        {selectedJob ? (
          <>
            {/* Enhanced Job Detail Header */}
            <div className="px-3 py-2.5 border-b border-[color:var(--app-border)] bg-[var(--app-surface-50)] shrink-0 space-y-2">
              {/* Row 1: Part Family + State Badge + Priority */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <PartFamilyIcon family={selectedJob.partFamily || 'unknown'} size={18} className={getPartFamilyColor(selectedJob.partFamily)} />
                  <span className="text-[11px] font-medium text-[var(--app-text-secondary)] truncate max-w-[160px]">{getPartFamilyLabel(selectedJob.partFamily)}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Priority Indicator */}
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-1.5 h-3 rounded-sm transition-colors duration-200 ${
                          i < Math.ceil(selectedJob.priority / 2)
                            ? selectedJob.priority >= 8 ? 'bg-[var(--app-priority-high)]' :
                              selectedJob.priority >= 6 ? 'bg-[var(--app-priority-medium)]' :
                              selectedJob.priority >= 4 ? 'bg-[var(--app-priority-medium)]' :
                              'bg-[var(--app-priority-low)]'
                            : 'bg-[var(--app-priority-inactive)]'
                        }`}
                      ></div>
                    ))}
                  </div>
                  <StateBadge state={selectedJob.state} size="md" />
                </div>
              </div>

              {/* Row 2: Input Request */}
              <p className="text-[13px] text-[var(--app-text-primary)] leading-relaxed line-clamp-2">{selectedJob.inputRequest}</p>

              {/* Row 3: Metadata tags */}
              <div className="flex flex-wrap items-center gap-2 text-[9px] font-mono">
                <span className="flex items-center gap-1 text-[var(--app-text-muted)]">
                  <Clock className="w-3 h-3" />
                  Created: {timeAgo(selectedJob.createdAt)}
                </span>
                {selectedJob.completedAt && (
                  <span className="flex items-center gap-1 text-[var(--app-success)]">
                    <CheckCircle2 className="w-3 h-3" />
                    Completed: {timeAgo(selectedJob.completedAt)}
                  </span>
                )}
                {selectedJob.builderName && (
                  <span className="flex items-center gap-1 text-[var(--app-text-dim)]">
                    <Cpu className="w-3 h-3" />
                    {selectedJob.builderName}
                  </span>
                )}
                {selectedJob.generationPath && (
                  <span className="flex items-center gap-1 text-[var(--app-text-dim)]">
                    <Layers className="w-3 h-3" />
                    {selectedJob.generationPath}
                  </span>
                )}
              </div>
            </div>

            {/* Gradient Divider */}
            <div className="gradient-separator" />

            {/* Quick Actions Bar */}
            <QuickActionsBar
              job={selectedJob}
              onProcess={onProcess}
              onCancel={onCancel}
              onDelete={onDelete}
              onReprocess={onProcess}
              onDownloadScad={onDownloadScad}
              onView3D={onView3D}
              onEditPriority={onEditPriority}
              onViewLog={onViewLog}
              onShare={onShare}
              isProcessing={isProcessing}
            />

            {/* Center Content: Conditional based on job state */}
            {(() => {
              const isActiveProcessing = !['NEW', 'DELIVERED', 'CANCELLED'].includes(selectedJob.state) &&
                !['VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED'].includes(selectedJob.state)
              const isFailed = ['VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED'].includes(selectedJob.state)
              const isCancelable = CANCELABLE_STATES.includes(selectedJob.state)

              if (isActiveProcessing) {
                return (
                  <JobStatusPage
                    job={selectedJob}
                    onViewLogs={() => onSetActiveTab('LOG')}
                    onCancel={onCancel}
                    isCancelable={isCancelable}
                  />
                )
              }

              if (isFailed) {
                return (
                  <JobStatusPage
                    job={selectedJob}
                    onViewLogs={() => onSetActiveTab('LOG')}
                    onCancel={onCancel}
                    isCancelable={false}
                  />
                )
              }

              // DELIVERED: Show 3D viewer
              if (selectedJob.state === 'DELIVERED') {
                return (
                  <div className="flex-1">
                    <ThreeDViewer job={selectedJob} />
                  </div>
                )
              }

              // NEW: Show empty/ready state with Process button
              return (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--app-empty-bg)] flex items-center justify-center empty-float">
                    <Play className="w-8 h-8 opacity-20 text-[var(--app-text-muted)]" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-[var(--app-text-muted)]">Ready to Process</p>
                    <p className="text-[10px] text-[var(--app-text-muted)] mt-1">This job is queued and waiting to be processed</p>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] linear-transition"
                    onClick={() => onProcess(selectedJob)}
                    disabled={isProcessing}
                  >
                    <Play className="w-3.5 h-3.5" />
                    Process Job
                  </Button>
                </div>
              )
            })()}
          </>
        ) : (
          <div className="relative flex flex-col items-center justify-center h-full text-[var(--app-text-muted)] gap-4">
            <div className="w-20 h-20 rounded-2xl bg-[var(--app-empty-bg)] flex items-center justify-center empty-float">
              <Box className="w-10 h-10 opacity-15" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--app-text-muted)]">No job selected</p>
              <p className="text-[10px] text-[var(--app-text-dim)] mt-1">Select a job from the list or create a new one</p>
            </div>

            <Button size="sm" className="h-7 text-[10px] gap-1 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] mt-2" onClick={onShowComposer}>
              <Plus className="w-3 h-3" />Create First Job
            </Button>
          </div>
        )}
      </div>
    </ResizablePanel>
  )
}
