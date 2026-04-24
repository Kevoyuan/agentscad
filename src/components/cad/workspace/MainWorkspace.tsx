'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Box, Play, Settings,
  Loader2, Activity,
  Plus, ArrowUpDown, Keyboard,
  BarChart3, GitCompare, Palette,
  Sun, Moon, Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  ResizableHandle, ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { PipelineVisualization } from '@/components/cad/pipeline-visualization'
import dynamic from 'next/dynamic'
import { NotificationCenter } from '@/components/cad/notification-center'
import { JobActivityFeed } from '@/components/cad/job-activity-feed'
import { Footer } from '@/components/cad/footer'
import { CommandPalette, CommandAction } from '@/components/cad/command-palette'
import { ThemePanel } from '@/components/cad/theme-panel'

const StatsDashboard = dynamic(() => import('@/components/cad/stats-dashboard').then(m => ({ default: m.StatsDashboard })), { ssr: false, loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-5 h-5 animate-spin text-[var(--app-text-muted)]" /></div> })
const JobCompare = dynamic(() => import('@/components/cad/job-compare').then(m => ({ default: m.JobCompare })), { ssr: false, loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-5 h-5 animate-spin text-[var(--app-text-muted)]" /></div> })

import { useWorkspaceState } from './useWorkspaceState'
import { JobListPanel } from './JobListPanel'
import { ViewerPanel } from './ViewerPanel'
import { InspectorPanel } from './InspectorPanel'
import { JobComposer } from './JobComposer'
import { KeyboardShortcuts } from './KeyboardShortcuts'

export function MainWorkspace() {
  const state = useWorkspaceState()

  // Command Palette Actions
  const commandPaletteActions: CommandAction[] = [
    {
      id: 'create-job',
      label: 'Create New Job',
      icon: <Plus className="w-4 h-4 text-emerald-400" />,
      shortcut: '⌘N',
      onSelect: () => state.setShowComposer(true),
      category: 'action' as const,
    },
    {
      id: 'toggle-theme',
      label: 'Toggle Theme',
      icon: <Palette className="w-4 h-4 text-[var(--app-accent-text)]" />,
      shortcut: 'T',
      onSelect: () => state.setShowSettings(true),
      category: 'action' as const,
    },
    {
      id: 'show-stats',
      label: 'Show Statistics',
      icon: <BarChart3 className="w-4 h-4 text-cyan-400" />,
      shortcut: '',
      onSelect: () => state.setShowStats(true),
      category: 'action' as const,
    },
    {
      id: 'show-compare',
      label: 'Compare Jobs',
      icon: <GitCompare className="w-4 h-4 text-amber-400" />,
      shortcut: '',
      onSelect: () => state.setShowCompare(true),
      category: 'action' as const,
    },
    {
      id: 'export-data',
      label: 'Export All Data',
      icon: <Box className="w-4 h-4 text-[var(--app-text-muted)]" />,
      shortcut: '',
      onSelect: () => state.exportAllData(),
      category: 'action' as const,
    },
  ]

  const handleCloseAll = () => {
    state.setShowCommandPalette(false)
    state.setShowComposer(false)
    state.setShowShortcuts(false)
    state.setShowStats(false)
    state.setShowCompare(false)
    state.setShowSettings(false)
  }

  const handleNavigateToJob = (jobId: string) => {
    const found = state.allJobs.find(j => j.id === jobId)
    if (found) {
      state.setSelectedJob(found)
      state.setActiveTab('PARAMS')
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--app-bg)] text-[var(--app-text-primary)] overflow-hidden">
      <KeyboardShortcuts
        selectedJob={state.selectedJob}
        showComposer={state.showComposer}
        onShowComposer={state.setShowComposer}
        onShowCommandPalette={state.setShowCommandPalette}
        onShowShortcuts={state.setShowShortcuts}
        onShowStats={state.setShowStats}
        onShowCompare={state.setShowCompare}
        onShowSettings={state.setShowSettings}
        onCloseAll={handleCloseAll}
        onSetActiveTab={state.setActiveTab}
        onDelete={state.handleDelete}
        onProcess={state.handleProcess}
        onAddNotification={state.addNotification}
        onLoadJobs={state.loadJobs}
      />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-[color:var(--app-border)] bg-[var(--app-surface)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[var(--app-accent)] flex items-center justify-center">
              <Box className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-sm font-semibold text-[var(--app-text-primary)]">
              AgentSCAD
            </h1>
          </div>
          <Separator orientation="vertical" className="h-4 bg-[var(--app-border)]" />
          <PipelineVisualization
            state={state.selectedJob?.state || 'NEW'}
            job={state.selectedJob || undefined}
            onStepClick={(stepKey, tabName) => {
              if (state.selectedJob) state.setActiveTab(tabName)
            }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-[9px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]" onClick={() => state.setShowStats(true)} aria-label="Stats Dashboard">
                  <BarChart3 className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Stats Dashboard</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-[9px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]" onClick={() => state.setShowCompare(true)} aria-label="Compare Jobs">
                  <GitCompare className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Compare Jobs</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <NotificationCenter
            notifications={state.notifications}
            onMarkRead={state.markNotificationRead}
            onMarkAllRead={state.markAllNotificationsRead}
            onClearAll={state.clearAllNotifications}
          />
          {/* Activity Feed - Bell with popover */}
          <div className="relative" ref={state.activityFeedRef}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[9px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] relative"
              onClick={() => state.setShowActivityFeed(!state.showActivityFeed)}
              aria-label="Activity Feed"
            >
              <Activity className="w-3 h-3" />
              {state.activityEvents.length > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-0.5 -right-0.5 min-w-[12px] h-[12px] rounded-full bg-amber-500 text-white text-[6px] font-bold flex items-center justify-center px-0.5"
                >
                  {state.activityEvents.length > 9 ? '9+' : state.activityEvents.length}
                </motion.span>
              )}
            </Button>
            <AnimatePresence>
              {state.showActivityFeed && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 top-8 w-80 linear-surface linear-border rounded-lg linear-shadow-md z-50 max-h-[420px]"
                >
                  <JobActivityFeed
                    events={state.activityEvents}
                    onClear={state.clearActivityEvents}
                    onEventClick={(event) => {
                      const found = state.allJobs.find(j => j.id.slice(0, 8) === event.jobId)
                      if (found) {
                        state.setSelectedJob(found)
                        state.setActiveTab('PARAMS')
                      }
                      state.setShowActivityFeed(false)
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-[9px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]" onClick={() => {
                  const next = (state.mounted && state.resolvedTheme === 'dark') ? 'light' : 'dark'
                  state.setTheme(next)
                }} aria-label="Toggle theme">
                  {!state.mounted ? <div className="w-3 h-3" aria-hidden="true" /> : state.resolvedTheme === 'dark' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Toggle {!state.mounted ? 'Theme' : state.resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-[9px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]" onClick={() => state.setShowSettings(true)} aria-label="Theme & Settings">
                  <Palette className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Theme & Settings</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-[9px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]" onClick={() => state.setShowShortcuts(true)} aria-label="Keyboard Shortcuts">
                  <Keyboard className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Shortcuts (?)</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button size="sm" className="h-8 text-[10px] gap-1 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] linear-transition px-3" onClick={() => state.setShowComposer(true)}>
            <Plus className="w-3 h-3" />New Job
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <JobListPanel
            jobs={state.jobs}
            sortedJobs={state.sortedJobsForDnd}
            allJobs={state.allJobs}
            selectedJob={state.selectedJob}
            selectedIds={state.selectedIds}
            filterState={state.filterState}
            stateCounts={state.stateCounts}
            activeDragId={state.activeDragId}
            sensors={state.sensors}
            onDragStart={state.handleDragStart}
            onDragEnd={state.handleDragEnd}
            onDragCancel={state.handleDragCancel}
            onSelectJob={(job) => { state.setSelectedJob(job); state.setActiveTab('PARAMS') }}
            onToggleSelect={state.toggleSelect}
            onProcess={state.handleProcess}
            onCancel={(j) => state.setCancelTarget(j)}
            onDuplicate={state.handleDuplicate}
            onDelete={state.handleDelete}
            onSetPriority={state.handleSetPriority}
            onLinkParent={state.handleLinkParent}
            onBatchAction={state.handleBatchAction}
            onFilterChange={state.handleFilterChange}
            onSetActiveTab={state.setActiveTab}
          />

          <ResizableHandle withHandle />

          <ViewerPanel
            selectedJob={state.selectedJob}
            isProcessing={state.isProcessing}
            processingJobId={state.processingJobId}
            pipelineEvents={state.pipelineEvents}
            onProcess={state.handleProcess}
            onCancel={(j) => state.setCancelTarget(j)}
            onDelete={state.handleDelete}
            onDownloadScad={state.downloadScad}
            onView3D={state.handleQuickView3D}
            onEditPriority={state.handleQuickEditPriority}
            onViewLog={state.handleQuickViewLog}
            onShare={state.handleQuickShare}
            onRepair={state.handleRepair}
            onSetActiveTab={state.setActiveTab}
            onShowComposer={() => state.setShowComposer(true)}
          />

          <ResizableHandle withHandle />

          <InspectorPanel
            selectedJob={state.selectedJob}
            allJobs={state.allJobs}
            activeTab={state.activeTab}
            tabDirection={state.tabDirection}
            onSetActiveTab={state.setActiveTab}
            onSetPrevTab={state.setPrevTab}
            onSetTabDirection={state.setTabDirection}
            onUpdate={state.loadJobs}
            onApplyScad={state.handleApplyScad}
            onProcess={state.handleProcess}
            onRepair={state.handleRepair}
            onNavigateToJob={handleNavigateToJob}
            onClearSelectedJob={() => state.setSelectedJob(null)}
            onShowComposer={() => state.setShowComposer(true)}
          />
        </ResizablePanelGroup>
      </main>

      {/* Footer */}
      <Footer
        wsConnected={state.wsConnected}
        jobCount={state.allJobs.length}
        jobCountFlash={state.jobCountFlash}
        deliveredCount={state.stateCounts['DELIVERED'] || 0}
        failedCount={(state.stateCounts['VALIDATION_FAILED'] || 0) + (state.stateCounts['GEOMETRY_FAILED'] || 0) + (state.stateCounts['RENDER_FAILED'] || 0)}
        dependencyCount={state.linkedJobCount}
        uptime={state.uptime}
        successRate={state.successRate}
        onExport={state.exportAllData}
        formatUptime={state.formatUptime}
      />

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}

      <JobComposer
        showComposer={state.showComposer}
        newJobText={state.newJobText}
        newJobPriority={state.newJobPriority}
        newJobTags={state.newJobTags}
        isCreating={state.isCreating}
        isAiEnhancing={state.isAiEnhancing}
        recentRequests={state.recentRequests}
        onShowComposerChange={state.setShowComposer}
        onNewJobTextChange={state.setNewJobText}
        onNewJobPriorityChange={state.setNewJobPriority}
        onNewJobTagsChange={state.setNewJobTags}
        onCreate={state.handleCreate}
        onAiEnhance={state.handleAiEnhance}
      />

      {/* Cancel Confirmation */}
      <AlertDialog open={!!state.cancelTarget} onOpenChange={() => state.setCancelTarget(null)}>
        <AlertDialogContent className="bg-[var(--app-surface-95)] border-[color:var(--app-border)] dialog-enter">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Cancel Job?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-[var(--app-text-muted)]">
              This will cancel job &quot;{state.cancelTarget?.inputRequest?.slice(0, 60)}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[var(--app-surface-raised)] border-[color:var(--app-border)] text-[var(--app-text-muted)] text-xs">Keep Running</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-600 hover:bg-orange-500 text-xs" onClick={() => state.cancelTarget && state.handleCancel(state.cancelTarget)}>
              Cancel Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Keyboard Shortcuts Dialog */}
      <Dialog open={state.showShortcuts} onOpenChange={state.setShowShortcuts}>
        <DialogContent className="bg-[var(--app-surface-95)] border-[color:var(--app-border)] max-w-md dialog-enter">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-[var(--app-accent-text)]" />Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="gradient-divider" />
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1" style={{ scrollbarWidth: 'none' }}>
            {/* Navigation */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpDown className="w-3 h-3 text-[var(--app-accent-text)]" />
                <span className="text-[10px] font-mono tracking-widest text-[var(--app-accent-text)] uppercase">Navigation</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {[
                  { keys: ['?', ''], desc: 'Toggle shortcuts' },
                  { keys: ['1', '-', '6'], desc: 'Switch inspector tab' },
                  { keys: ['E', ''], desc: 'Edit SCAD code' },
                  { keys: ['D', ''], desc: 'Show dependencies' },
                  { keys: ['H', ''], desc: 'Show history (LOG)' },
                  { keys: ['T', ''], desc: 'Open theme settings' },
                ].map((s) => (
                  <div key={s.desc} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-[var(--app-text-muted)]">{s.desc}</span>
                    <div className="flex items-center gap-0.5">
                      {s.keys.map((k, i) => k ? <span key={i} className="keyboard-key">{k}</span> : <span key={i} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Job Actions */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Play className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase">Job Actions</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {[
                  { keys: ['⌘', 'N'], desc: 'New job' },
                  { keys: ['⌘', '⇧', 'N'], desc: 'New job (focus input)' },
                  { keys: ['Space'], desc: 'Process selected' },
                  { keys: ['Del'], desc: 'Delete selected' },
                  { keys: ['⇧', '↑'], desc: 'Priority up' },
                  { keys: ['⇧', '↓'], desc: 'Priority down' },
                ].map((s) => (
                  <div key={s.desc} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-[var(--app-text-muted)]">{s.desc}</span>
                    <div className="flex items-center gap-0.5">
                      {s.keys.map((k, i) => <span key={i} className="keyboard-key">{k}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Inspector */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-mono tracking-widest text-amber-400 uppercase">Inspector Tabs</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {[
                  { key: '1', tab: 'SPEC' },
                  { key: '2', tab: 'PARAMS' },
                  { key: '3', tab: 'MODEL' },
                  { key: '4', tab: 'CODE' },
                  { key: '5', tab: 'VALIDATE' },
                  { key: '6', tab: 'HISTORY' },
                ].map((s) => (
                  <div key={s.tab} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-[var(--app-text-muted)] font-mono">{s.tab}</span>
                    <span className="keyboard-key">{s.key}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* General */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-3 h-3 text-cyan-400" />
                <span className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase">General</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {[
                  { keys: ['Esc'], desc: 'Close dialog' },
                  { keys: ['?'], desc: 'Toggle this panel' },
                ].map((s) => (
                  <div key={s.desc} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-[var(--app-text-muted)]">{s.desc}</span>
                    <div className="flex items-center gap-0.5">
                      {s.keys.map((k, i) => <span key={i} className="keyboard-key">{k}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats Dashboard */}
      <Dialog open={state.showStats} onOpenChange={state.setShowStats}>
        <DialogContent className="bg-[var(--app-surface-95)] border-[color:var(--app-border)] max-w-2xl dialog-enter">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--app-accent-text)]" />Stats Dashboard
            </DialogTitle>
          </DialogHeader>
          <StatsDashboard jobs={state.allJobs} />
        </DialogContent>
      </Dialog>

      {/* Job Compare */}
      <Dialog open={state.showCompare} onOpenChange={state.setShowCompare}>
        <DialogContent className="bg-[var(--app-surface-95)] border-[color:var(--app-border)] max-w-4xl max-h-[80vh] dialog-enter">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-[var(--app-accent-text)]" />Compare Jobs
            </DialogTitle>
          </DialogHeader>
          <JobCompare jobs={state.allJobs} />
        </DialogContent>
      </Dialog>

      {/* Theme & Settings */}
      <Dialog open={state.showSettings} onOpenChange={state.setShowSettings}>
        <DialogContent className="bg-[var(--app-surface-95)] border-[color:var(--app-border)] max-w-sm dialog-enter">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Palette className="w-4 h-4 text-[var(--app-accent-text)]" />Theme & Settings
            </DialogTitle>
          </DialogHeader>
          <div className="gradient-divider" />
          <ThemePanel />
        </DialogContent>
      </Dialog>

      {/* Command Palette */}
      <CommandPalette
        open={state.showCommandPalette}
        onOpenChange={state.setShowCommandPalette}
        jobs={state.allJobs}
        onSelectJob={(job) => { state.setSelectedJob(job); state.setActiveTab('PARAMS') }}
        actions={commandPaletteActions}
      />
    </div>
  )
}
