'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, Sparkles, Shield, Activity, Clock,
  StickyNote, GitBranch, History, Zap, Plus,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResizablePanel } from '@/components/ui/resizable'

import { Job } from '@/components/cad/types'
import { ParameterPanel } from '@/components/cad/parameter-panel'
import { ValidationPanel } from '@/components/cad/validation-panel'
import { ScadEditor } from '@/components/cad/scad-editor'
import { JobDependencies } from '@/components/cad/job-dependencies'
import { JobVersionHistory } from '@/components/cad/job-version-history'
import { BreadcrumbNav } from '@/components/cad/breadcrumb-nav'

const ResearchPanel = dynamic(() => import('@/components/cad/research-panel').then(m => ({ default: m.ResearchPanel })), { ssr: false, loading: () => <div className="p-4 text-[var(--app-text-dim)] text-xs">Loading...</div> })
const TimelinePanel = dynamic(() => import('@/components/cad/timeline-panel').then(m => ({ default: m.TimelinePanel })), { ssr: false, loading: () => <div className="p-4 text-[var(--app-text-dim)] text-xs">Loading...</div> })
const NotesPanel = dynamic(() => import('@/components/cad/notes-panel').then(m => ({ default: m.NotesPanel })), { ssr: false, loading: () => <div className="p-4 text-[var(--app-text-dim)] text-xs">Loading...</div> })
const ChatPanel = dynamic(() => import('@/components/cad/chat-panel').then(m => ({ default: m.ChatPanel })), { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><div className="w-5 h-5 animate-spin text-[var(--app-text-muted)]">Loading...</div></div> })

export function InspectorPanel({
  selectedJob,
  allJobs,
  activeTab,
  tabDirection,
  onSetActiveTab,
  onSetPrevTab,
  onSetTabDirection,
  onUpdate,
  onApplyScad,
  onNavigateToJob,
  onClearSelectedJob,
  onShowComposer,
}: {
  selectedJob: Job | null
  allJobs: Job[]
  activeTab: string
  tabDirection: number
  onSetActiveTab: (tab: string) => void
  onSetPrevTab: (tab: string) => void
  onSetTabDirection: (dir: number) => void
  onUpdate: () => void
  onApplyScad: (job: Job, scadSource: string) => Promise<void>
  onNavigateToJob: (jobId: string) => void
  onClearSelectedJob: () => void
  onShowComposer: () => void
}) {
  return (
    <ResizablePanel defaultSize={38} minSize={25} maxSize={50}>
      <div className="flex flex-col h-full bg-[var(--app-surface)]">
        {selectedJob ? (
          <Tabs value={activeTab} onValueChange={(v) => {
            const tabOrder = ['PARAMS', 'RESEARCH', 'VALIDATE', 'SCAD', 'LOG', 'NOTES', 'DEPS', 'HISTORY', 'AI']
            const newIdx = tabOrder.indexOf(v)
            const oldIdx = tabOrder.indexOf(activeTab)
            onSetTabDirection(newIdx > oldIdx ? 1 : -1)
            onSetPrevTab(activeTab)
            onSetActiveTab(v)
          }} className="flex flex-col h-full">
            {/* Inspector Breadcrumb */}
            <div className="px-3 py-1 shrink-0 breadcrumb-fade-in">
              <BreadcrumbNav
                jobId={selectedJob.id}
                activeTab={activeTab}
                onNavigateHome={onClearSelectedJob}
                onNavigateJobs={onClearSelectedJob}
              />
            </div>
            {/* Gradient separator between breadcrumb and tabs */}
            <div className="gradient-separator" />
            <TabsList className="w-full justify-start px-2 py-1 bg-transparent border-b border-[color:var(--app-border)] h-auto rounded-none shrink-0">
              {[
                { key: 'PARAMS', label: 'PARAMS', icon: Settings },
                { key: 'RESEARCH', label: 'RESEARCH', icon: Sparkles },
                { key: 'VALIDATE', label: 'VALIDATE', icon: Shield },
                { key: 'SCAD', label: 'SCAD', icon: Activity },
                { key: 'LOG', label: 'LOG', icon: Clock },
                { key: 'NOTES', label: 'NOTES', icon: StickyNote },
                { key: 'DEPS', label: 'DEPS', icon: GitBranch },
                { key: 'HISTORY', label: 'HISTORY', icon: History },
                { key: 'AI', label: 'AI', icon: Zap },
              ].map(tab => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="tab-indicator text-[9px] font-mono tracking-wider px-2 py-1.5 data-[state=active]:bg-[var(--app-accent-bg)] data-[state=active]:text-[var(--app-accent-text)] data-[state=active]:tab-active-glow rounded-sm h-auto min-h-0 transition-all duration-150"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="flex-1 overflow-hidden">
              <AnimatePresence mode="wait" custom={tabDirection}>
                <motion.div
                  key={activeTab}
                  custom={tabDirection}
                  initial={{ opacity: 0, x: tabDirection * 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: tabDirection * -20 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className={`h-full ${tabDirection > 0 ? 'slide-in-right' : 'slide-in-left'}`}
                >
                  <TabsContent value="PARAMS" className="h-full m-0 data-[state=inactive]:hidden">
                    <ParameterPanel job={selectedJob} onUpdate={onUpdate} />
                  </TabsContent>
                  <TabsContent value="RESEARCH" className="h-full m-0 data-[state=inactive]:hidden">
                    <ResearchPanel job={selectedJob} />
                  </TabsContent>
                  <TabsContent value="VALIDATE" className="h-full m-0 data-[state=inactive]:hidden">
                    <ValidationPanel job={selectedJob} />
                  </TabsContent>
                  <TabsContent value="SCAD" className="h-full m-0 data-[state=inactive]:hidden">
                    <ScadEditor job={selectedJob} onUpdate={onUpdate} onApply={onApplyScad} />
                  </TabsContent>
                  <TabsContent value="LOG" className="h-full m-0 data-[state=inactive]:hidden">
                    <TimelinePanel job={selectedJob} />
                  </TabsContent>
                  <TabsContent value="NOTES" className="h-full m-0 data-[state=inactive]:hidden">
                    <NotesPanel job={selectedJob} onUpdate={onUpdate} />
                  </TabsContent>
                  <TabsContent value="DEPS" className="h-full m-0 data-[state=inactive]:hidden">
                    <JobDependencies job={selectedJob} allJobs={allJobs} onUpdate={onUpdate} onNavigateToJob={onNavigateToJob} />
                  </TabsContent>
                  <TabsContent value="HISTORY" className="h-full m-0 data-[state=inactive]:hidden">
                    <JobVersionHistory key={selectedJob.id} job={selectedJob} />
                  </TabsContent>
                  <TabsContent value="AI" className="h-full m-0 data-[state=inactive]:hidden">
                    <ChatPanel key={selectedJob.id} job={selectedJob} onApplyScad={onApplyScad} />
                  </TabsContent>
                </motion.div>
              </AnimatePresence>
            </div>
          </Tabs>
        ) : (
          <div className="relative flex flex-col items-center justify-center h-full text-[var(--app-text-muted)] gap-3 p-6">
            {/* Enhanced empty state with SVG illustration */}
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="empty-float opacity-30">
              <rect x="8" y="8" width="48" height="48" rx="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" className="text-[var(--app-text-dim)]" />
              <path d="M24 32h16M32 24v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--app-text-muted)]" />
              <circle cx="32" cy="32" r="3" fill="currentColor" className="text-[var(--app-text-dim)]" />
            </svg>
            <div className="text-center mt-2">
              <p className="text-sm font-medium text-[var(--app-text-muted)]">Inspector Panel</p>
              <p className="text-[10px] text-[var(--app-text-dim)] mt-1 max-w-[200px]">Select a job from the list to view parameters, code, and pipeline details</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 mt-2 border-[color:var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] hover:border-[color:var(--app-border-strong)]" onClick={onShowComposer}>
              <Plus className="w-3 h-3" />Create a Job to Begin
            </Button>
          </div>
        )}
      </div>
    </ResizablePanel>
  )
}
