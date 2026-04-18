'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { io, Socket } from 'socket.io-client'
import {
  Box, Play, Trash2, Settings, Clock, CheckCircle2,
  Loader2, Download, Shield, Cpu, Activity, Layers,
  RefreshCw, Search, Plus, ArrowUpDown, RotateCcw, X,
  Keyboard, Sparkles, Hash, AlertCircle, Repeat, Maximize2,
  Ban, CheckSquare, Square, XSquare, StickyNote, BarChart3,
  GitCompare, Eye, Zap
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  ResizableHandle, ResizablePanel, ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'

// Component imports
import { StateBadge } from '@/components/cad/state-badge'
import { PipelineVisualization } from '@/components/cad/pipeline-visualization'
import { ParameterPanel, SchemaInfoPanel } from '@/components/cad/parameter-panel'
import { ValidationPanel } from '@/components/cad/validation-panel'
import { ScadViewer } from '@/components/cad/scad-viewer'
import { ThreeDViewer } from '@/components/cad/three-d-viewer'
import { TimelinePanel } from '@/components/cad/timeline-panel'
import { ResearchPanel } from '@/components/cad/research-panel'
import { ChatPanel } from '@/components/cad/chat-panel'
import { NotesPanel } from '@/components/cad/notes-panel'
import { StatsDashboard } from '@/components/cad/stats-dashboard'
import { JobCompare } from '@/components/cad/job-compare'
import { PartFamilyIcon } from '@/components/cad/part-family-icon'

// Type & API imports
import {
  Job, FILTER_STATES, CANCELABLE_STATES, timeAgo, formatDate,
  getStateInfo, parseJSON, getPipelineProgress, safeNum, getPriorityColor
} from '@/components/cad/types'
import {
  fetchJobs, createJob, deleteJob, processJob,
  cancelJob, batchOperation
} from '@/components/cad/api'

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [allJobs, setAllJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [filterState, setFilterState] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [newJobText, setNewJobText] = useState('')
  const [newJobPriority, setNewJobPriority] = useState(5)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showComposer, setShowComposer] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Job | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState('PARAMS')
  const { toast } = useToast()
  const startTimeRef = useRef(Date.now())

  // ── Data Fetching ─────────────────────────────────────────────────────────

  const loadJobs = useCallback(async () => {
    try {
      const data = await fetchJobs()
      setAllJobs(data.jobs)
      const filtered = filterState
        ? data.jobs.filter(j => {
            if (filterState === 'FAILED') return ['VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED'].includes(j.state)
            if (filterState === 'CANCELLED') return j.state === 'CANCELLED'
            return j.state === filterState
          })
        : data.jobs
      const searched = searchQuery
        ? filtered.filter(j =>
            j.inputRequest.toLowerCase().includes(searchQuery.toLowerCase()) ||
            j.id.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : filtered
      setJobs(searched)
      // Update selected job if it exists
      if (selectedJob) {
        const updated = data.jobs.find(j => j.id === selectedJob.id)
        if (updated) setSelectedJob(updated)
      }
    } catch (err) {
      console.error('Failed to load jobs:', err)
    }
  }, [filterState, searchQuery, selectedJob])

  // ── WebSocket + Polling Fallback ─────────────────────────────────────────

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const socketRef = useRef<Socket | null>(null)

  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(loadJobs, 5000)
  }, [loadJobs])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  useEffect(() => {
    loadJobs()

    // Connect to WebSocket
    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[WS] Connected to ws-service')
      stopPolling() // Stop polling when WS is connected
    })

    socket.on('job:update', () => {
      loadJobs() // Refresh data on any job update
    })

    socket.on('disconnect', () => {
      console.log('[WS] Disconnected from ws-service, falling back to polling')
      startPolling() // Start polling when WS disconnects
    })

    socket.on('connect_error', () => {
      startPolling() // Fallback to polling on connection error
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      stopPolling()
    }
  }, [loadJobs, startPolling, stopPolling])

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        setShowComposer(true)
      }
      if (e.key === 'Escape') {
        setShowComposer(false)
        setShowShortcuts(false)
        setShowStats(false)
        setShowCompare(false)
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          setShowShortcuts(prev => !prev)
        }
      }
      if (e.key === 'Delete' && selectedJob && !showComposer) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          handleDelete(selectedJob.id)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedJob, showComposer])

  // ── Job Actions ───────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newJobText.trim()) return
    setIsCreating(true)
    try {
      const { job } = await createJob(newJobText.trim(), undefined, newJobPriority)
      toast({ title: 'Job created', description: `Priority ${newJobPriority}`, duration: 2000 })
      setNewJobText('')
      setNewJobPriority(5)
      setShowComposer(false)
      await loadJobs()
      setSelectedJob(job)
    } catch {
      toast({ title: 'Failed to create job', variant: 'destructive', duration: 3000 })
    } finally {
      setIsCreating(false)
    }
  }

  const handleProcess = async (job: Job) => {
    setIsProcessing(true)
    setSelectedJob(job)
    try {
      await processJob(job.id, (data) => {
        if (data.state) {
          setSelectedJob(prev => prev ? { ...prev, state: data.state as string } : prev)
        }
        if (data.scadSource) {
          setSelectedJob(prev => prev ? { ...prev, scadSource: data.scadSource as string } : prev)
        }
        if (data.parameterSchema) {
          setSelectedJob(prev => prev ? { ...prev, parameterSchema: typeof data.parameterSchema === 'string' ? data.parameterSchema : JSON.stringify(data.parameterSchema) } : prev)
        }
        if (data.parameterValues) {
          setSelectedJob(prev => prev ? { ...prev, parameterValues: typeof data.parameterValues === 'string' ? data.parameterValues : JSON.stringify(data.parameterValues) } : prev)
        }
        if (data.partFamily) {
          setSelectedJob(prev => prev ? { ...prev, partFamily: data.partFamily as string } : prev)
        }
        if (data.validationResults) {
          setSelectedJob(prev => prev ? { ...prev, validationResults: typeof data.validationResults === 'string' ? data.validationResults : JSON.stringify(data.validationResults) } : prev)
        }
        if (data.stlPath) {
          setSelectedJob(prev => prev ? { ...prev, stlPath: data.stlPath as string } : prev)
        }
        if (data.pngPath) {
          setSelectedJob(prev => prev ? { ...prev, pngPath: data.pngPath as string } : prev)
        }
        if (data.researchResult) {
          setSelectedJob(prev => prev ? { ...prev, researchResult: typeof data.researchResult === 'string' ? data.researchResult : JSON.stringify(data.researchResult) } : prev)
        }
        if (data.intentResult) {
          setSelectedJob(prev => prev ? { ...prev, intentResult: typeof data.intentResult === 'string' ? data.intentResult : JSON.stringify(data.intentResult) } : prev)
        }
        if (data.designResult) {
          setSelectedJob(prev => prev ? { ...prev, designResult: typeof data.designResult === 'string' ? data.designResult : JSON.stringify(data.designResult) } : prev)
        }
        if (data.renderLog) {
          setSelectedJob(prev => prev ? { ...prev, renderLog: typeof data.renderLog === 'string' ? data.renderLog : JSON.stringify(data.renderLog) } : prev)
        }
        if (data.builderName) {
          setSelectedJob(prev => prev ? { ...prev, builderName: data.builderName as string } : prev)
        }
        if (data.generationPath) {
          setSelectedJob(prev => prev ? { ...prev, generationPath: data.generationPath as string } : prev)
        }
        if (data.job) {
          setSelectedJob(data.job as Job)
        }
        const step = data.step as string
        if (step === 'scad_generated') {
          toast({ title: 'SCAD Generated', description: 'Code generated successfully', duration: 1500 })
        } else if (step === 'rendered') {
          toast({ title: 'Rendered', description: '3D model rendered', duration: 1500 })
        } else if (step === 'validated') {
          toast({ title: 'Validated', description: 'Quality checks passed', duration: 1500 })
        } else if (step === 'delivered') {
          toast({ title: 'Delivered!', description: 'All deliverables ready', duration: 2000 })
        }
      })
      await loadJobs()
    } catch {
      toast({ title: 'Processing failed', variant: 'destructive', duration: 3000 })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteJob(id)
      if (selectedJob?.id === id) setSelectedJob(null)
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
      toast({ title: 'Job deleted', duration: 1500 })
      await loadJobs()
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive', duration: 2000 })
    }
  }

  const handleDuplicate = async (job: Job) => {
    try {
      const { job: newJob } = await createJob(job.inputRequest, job.customerId ?? undefined, job.priority)
      toast({ title: 'Job duplicated', duration: 1500 })
      await loadJobs()
      setSelectedJob(newJob)
    } catch {
      toast({ title: 'Duplicate failed', variant: 'destructive', duration: 2000 })
    }
  }

  const handleCancel = async (job: Job) => {
    try {
      await cancelJob(job.id)
      toast({ title: 'Job cancelled', duration: 1500 })
      setCancelTarget(null)
      await loadJobs()
    } catch {
      toast({ title: 'Cancel failed', variant: 'destructive', duration: 2000 })
    }
  }

  const handleBatchAction = async (action: 'delete' | 'cancel' | 'reprocess') => {
    try {
      const ids = Array.from(selectedIds)
      const { results } = await batchOperation(action, ids)
      toast({
        title: `Batch ${action}: ${results.success.length} succeeded${results.failed.length > 0 ? `, ${results.failed.length} failed` : ''}`,
        duration: 3000
      })
      setSelectedIds(new Set())
      await loadJobs()
    } catch {
      toast({ title: `Batch ${action} failed`, variant: 'destructive', duration: 2000 })
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Computed Values ───────────────────────────────────────────────────────

  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const j of allJobs) {
      if (['VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED'].includes(j.state)) {
        counts['FAILED'] = (counts['FAILED'] || 0) + 1
      }
      counts[j.state] = (counts[j.state] || 0) + 1
    }
    return counts
  }, [allJobs])

  const uptime = Math.floor((Date.now() - startTimeRef.current) / 1000)

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-[#080810] text-zinc-100 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 bg-[#0a0818]/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Box className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-sm font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              AgentSCAD
            </h1>
          </div>
          <Separator orientation="vertical" className="h-4 bg-zinc-800/60" />
          <PipelineVisualization state={selectedJob?.state || 'NEW'} />
        </div>
        <div className="flex items-center gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300" onClick={() => setShowStats(true)}>
                  <BarChart3 className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Stats Dashboard</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300" onClick={() => setShowCompare(true)}>
                  <GitCompare className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Compare Jobs</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300" onClick={() => setShowShortcuts(true)}>
                  <Keyboard className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Shortcuts (?)</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button size="sm" className="h-6 text-[10px] gap-1 bg-violet-600 hover:bg-violet-500" onClick={() => setShowComposer(true)}>
            <Plus className="w-3 h-3" />New Job
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left: Jobs List */}
          <ResizablePanel defaultSize={22} minSize={16} maxSize={35}>
            <div className="flex flex-col h-full bg-[#0a0818]">
              {/* Search */}
              <div className="px-3 py-2 border-b border-zinc-800/60">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search jobs..."
                    className="h-7 pl-7 text-[11px] bg-[#0c0a14] border-zinc-800/60 placeholder:text-zinc-700"
                  />
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800/60 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {FILTER_STATES.map(f => {
                  const count = f.key === 'ALL' ? allJobs.length :
                    f.key === 'FAILED' ? (stateCounts['VALIDATION_FAILED'] || 0) + (stateCounts['GEOMETRY_FAILED'] || 0) + (stateCounts['RENDER_FAILED'] || 0) :
                    stateCounts[f.key] || 0
                  const isActive = filterState === f.key || (!filterState && f.key === 'ALL')
                  return (
                    <button
                      key={f.key}
                      className={`shrink-0 text-[9px] font-mono px-2 py-1 rounded-md transition-colors ${
                        isActive ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30' : 'text-zinc-600 hover:text-zinc-400 border border-transparent'
                      }`}
                      onClick={() => setFilterState(f.key === 'ALL' ? null : (f as any).stateKey || f.key)}
                    >
                      {f.label} {count > 0 ? count : ''}
                    </button>
                  )
                })}
              </div>

              {/* Batch Action Bar */}
              <AnimatePresence>
                {selectedIds.size > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-b border-zinc-800/60 bg-violet-600/10"
                  >
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-[9px] font-mono text-violet-300">{selectedIds.size} selected</span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-5 text-[8px] gap-1 text-amber-400 hover:text-amber-300" onClick={() => handleBatchAction('reprocess')}>
                          <RotateCcw className="w-2.5 h-2.5" />Reprocess
                        </Button>
                        <Button variant="ghost" size="sm" className="h-5 text-[8px] gap-1 text-orange-400 hover:text-orange-300" onClick={() => handleBatchAction('cancel')}>
                          <Ban className="w-2.5 h-2.5" />Cancel
                        </Button>
                        <Button variant="ghost" size="sm" className="h-5 text-[8px] gap-1 text-rose-400 hover:text-rose-300" onClick={() => handleBatchAction('delete')}>
                          <Trash2 className="w-2.5 h-2.5" />Delete
                        </Button>
                        <Button variant="ghost" size="sm" className="h-5 text-[8px] text-zinc-500" onClick={() => setSelectedIds(new Set())}>
                          <X className="w-2.5 h-2.5" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Jobs List */}
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {jobs.sort((a, b) => b.priority - a.priority || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(job => {
                    const info = getStateInfo(job.state)
                    const isSelected = selectedJob?.id === job.id
                    const isChecked = selectedIds.has(job.id)
                    const isCancelable = CANCELABLE_STATES.includes(job.state)
                    return (
                      <motion.div
                        key={job.id}
                        layout
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`group/card relative rounded-lg p-2.5 cursor-pointer transition-all duration-150 ${
                          isSelected
                            ? 'bg-violet-600/10 border border-violet-500/30 ring-1 ring-violet-500/20'
                            : 'bg-zinc-900/30 border border-zinc-800/40 hover:bg-zinc-900/50 hover:border-zinc-700/50'
                        }`}
                        onClick={() => { setSelectedJob(job); setActiveTab('PARAMS') }}
                      >
                        {/* Select checkbox */}
                        <div className="absolute top-2 left-1 z-10" onClick={e => e.stopPropagation()}>
                          <button
                            className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-colors ${
                              isChecked ? 'bg-violet-500 text-white' : 'bg-zinc-800/60 text-zinc-600 hover:bg-zinc-700/60'
                            }`}
                            onClick={() => toggleSelect(job.id)}
                          >
                            {isChecked ? <CheckSquare className="w-2.5 h-2.5" /> : <Square className="w-2.5 h-2.5" />}
                          </button>
                        </div>

                        <div className="pl-4">
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
                          {/* Action Buttons */}
                          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover/card:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            {job.state === 'NEW' && (
                              <Button variant="ghost" size="sm" className="h-5 text-[8px] gap-0.5 text-emerald-400 hover:text-emerald-300" onClick={() => handleProcess(job)}>
                                <Play className="w-2.5 h-2.5" />Process
                              </Button>
                            )}
                            {isCancelable && (
                              <Button variant="ghost" size="sm" className="h-5 text-[8px] gap-0.5 text-orange-400 hover:text-orange-300" onClick={() => setCancelTarget(job)}>
                                <Ban className="w-2.5 h-2.5" />Cancel
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-5 text-[8px] gap-0.5 text-zinc-500 hover:text-zinc-300" onClick={() => handleDuplicate(job)}>
                              <Repeat className="w-2.5 h-2.5" />Duplicate
                            </Button>
                            <Button variant="ghost" size="sm" className="h-5 text-[8px] gap-0.5 text-rose-400 hover:text-rose-300" onClick={() => handleDelete(job.id)}>
                              <Trash2 className="w-2.5 h-2.5" />Delete
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                  {jobs.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-zinc-600 gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-zinc-800/20 flex items-center justify-center">
                        <Layers className="w-7 h-7 opacity-20" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm">No jobs found</p>
                        <p className="text-[10px] text-zinc-700 mt-1">Create a new job or adjust filters</p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Center: 3D Viewer */}
          <ResizablePanel defaultSize={40} minSize={25}>
            <div className="flex flex-col h-full bg-[#080810]">
              {selectedJob ? (
                <>
                  {/* Job Detail Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 bg-[#0a0818]/50 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <PartFamilyIcon family={selectedJob.partFamily || 'unknown'} size="sm" />
                      <div className="min-w-0">
                        <p className="text-[11px] text-zinc-300 truncate max-w-[300px]">{selectedJob.inputRequest}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[8px] font-mono text-zinc-600">{selectedJob.id.slice(0, 8)}</span>
                          <span className={`text-[8px] font-mono px-1 py-0.5 rounded border ${getPriorityColor(selectedJob.priority)}`}>P{selectedJob.priority}</span>
                          {selectedJob.builderName && <span className="text-[8px] text-zinc-700">{selectedJob.builderName}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedJob.state === 'NEW' && (
                        <Button size="sm" className="h-6 text-[9px] gap-1 bg-emerald-600 hover:bg-emerald-500" onClick={() => handleProcess(selectedJob)} disabled={isProcessing}>
                          {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          {isProcessing ? 'Processing...' : 'Process'}
                        </Button>
                      )}
                      {selectedJob.state === 'DELIVERED' && (
                        <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 text-amber-400 hover:text-amber-300" onClick={() => handleProcess(selectedJob)}>
                          <RotateCcw className="w-3 h-3" />Reprocess
                        </Button>
                      )}
                      {CANCELABLE_STATES.includes(selectedJob.state) && (
                        <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 text-orange-400 hover:text-orange-300" onClick={() => setCancelTarget(selectedJob)}>
                          <Ban className="w-3 h-3" />Cancel
                        </Button>
                      )}
                      {selectedJob.scadSource && (
                        <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300">
                          <Download className="w-3 h-3" />SCAD
                        </Button>
                      )}
                      {selectedJob.stlPath && (
                        <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300">
                          <Download className="w-3 h-3" />STL
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300" onClick={() => handleDuplicate(selectedJob)}>
                        <Repeat className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 text-rose-400 hover:text-rose-300" onClick={() => handleDelete(selectedJob.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  {/* Progress Bar */}
                  {isProcessing && (
                    <div className="px-3 py-1">
                      <Progress value={getPipelineProgress(selectedJob.state)} className="h-1" />
                    </div>
                  )}
                  {/* 3D Viewer */}
                  <div className="flex-1">
                    <ThreeDViewer job={selectedJob} />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-zinc-800/20 flex items-center justify-center">
                    <Box className="w-10 h-10 opacity-15" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-zinc-500">No job selected</p>
                    <p className="text-[10px] text-zinc-700 mt-1">Select a job from the list or create a new one</p>
                  </div>
                  <Button size="sm" className="h-7 text-[10px] gap-1 bg-violet-600 hover:bg-violet-500 mt-2" onClick={() => setShowComposer(true)}>
                    <Plus className="w-3 h-3" />Create First Job
                  </Button>
                </div>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: Inspector Panel */}
          <ResizablePanel defaultSize={38} minSize={25} maxSize={50}>
            <div className="flex flex-col h-full bg-[#0a0818]">
              {selectedJob ? (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
                  <TabsList className="w-full justify-start px-2 py-1 bg-transparent border-b border-zinc-800/60 h-auto rounded-none shrink-0">
                    {[
                      { key: 'PARAMS', label: 'PARAMS', icon: Settings },
                      { key: 'RESEARCH', label: 'RESEARCH', icon: Sparkles },
                      { key: 'VALIDATE', label: 'VALIDATE', icon: Shield },
                      { key: 'SCAD', label: 'SCAD', icon: Activity },
                      { key: 'LOG', label: 'LOG', icon: Clock },
                      { key: 'NOTES', label: 'NOTES', icon: StickyNote },
                      { key: 'AI', label: 'AI', icon: Zap },
                    ].map(tab => (
                      <TabsTrigger
                        key={tab.key}
                        value={tab.key}
                        className="text-[9px] font-mono tracking-wider px-2 py-1.5 data-[state=active]:bg-violet-600/15 data-[state=active]:text-violet-300 rounded-sm h-auto min-h-0"
                      >
                        {tab.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <div className="flex-1 overflow-hidden">
                    <TabsContent value="PARAMS" className="h-full m-0 data-[state=inactive]:hidden">
                      <ParameterPanel job={selectedJob} onUpdate={loadJobs} />
                    </TabsContent>
                    <TabsContent value="RESEARCH" className="h-full m-0 data-[state=inactive]:hidden">
                      <ResearchPanel job={selectedJob} />
                    </TabsContent>
                    <TabsContent value="VALIDATE" className="h-full m-0 data-[state=inactive]:hidden">
                      <ValidationPanel job={selectedJob} />
                    </TabsContent>
                    <TabsContent value="SCAD" className="h-full m-0 data-[state=inactive]:hidden">
                      <ScadViewer code={selectedJob.scadSource} />
                    </TabsContent>
                    <TabsContent value="LOG" className="h-full m-0 data-[state=inactive]:hidden">
                      <TimelinePanel job={selectedJob} />
                    </TabsContent>
                    <TabsContent value="NOTES" className="h-full m-0 data-[state=inactive]:hidden">
                      <NotesPanel job={selectedJob} onUpdate={loadJobs} />
                    </TabsContent>
                    <TabsContent value="AI" className="h-full m-0 data-[state=inactive]:hidden">
                      <ChatPanel job={selectedJob} />
                    </TabsContent>
                  </div>
                </Tabs>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3 p-6">
                  <div className="w-12 h-12 rounded-xl bg-zinc-800/30 flex items-center justify-center">
                    <Settings className="w-6 h-6 opacity-30" />
                  </div>
                  <p className="text-sm">Inspector</p>
                  <p className="text-[10px] text-zinc-700">Select a job to inspect</p>
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      {/* Footer */}
      <footer className="flex items-center justify-between px-4 py-1 border-t border-zinc-800/60 bg-[#0a0818]/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4 text-[9px] font-mono text-zinc-600">
          <span className="flex items-center gap-1"><Activity className="w-2.5 h-2.5 text-emerald-500" />System Online</span>
          <span>Jobs: {allJobs.length}</span>
          <span>Delivered: {stateCounts['DELIVERED'] || 0}</span>
          <span>Failed: {(stateCounts['VALIDATION_FAILED'] || 0) + (stateCounts['GEOMETRY_FAILED'] || 0) + (stateCounts['RENDER_FAILED'] || 0)}</span>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono text-zinc-700">
          <span className="flex items-center gap-1"><Cpu className="w-2.5 h-2.5" />AgentSCAD v0.3</span>
          <span className="flex items-center gap-1"><Hash className="w-2.5 h-2.5" />Engine: LLM-Parametric</span>
        </div>
      </footer>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}

      {/* Job Composer */}
      <Dialog open={showComposer} onOpenChange={setShowComposer}>
        <DialogContent className="bg-[#0c0a14] border-zinc-800/60 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Plus className="w-4 h-4 text-violet-400" />New CAD Job
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Textarea
                value={newJobText}
                onChange={e => setNewJobText(e.target.value)}
                placeholder="e.g. A 40mm×30mm×15mm electronics enclosure with 2mm walls"
                className="min-h-[100px] bg-[#080810] border-zinc-800/60 text-sm placeholder:text-zinc-700 focus:border-violet-500/40"
                maxLength={5000}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-zinc-700">{newJobText.length}/5000</span>
                <span className="text-[9px] text-zinc-700">⌘+Enter</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase mb-2 block">Priority</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={newJobPriority}
                  onChange={e => setNewJobPriority(Number(e.target.value))}
                  className="flex-1 accent-violet-500"
                />
                <span className={`text-xs font-mono px-2 py-0.5 rounded border min-w-[36px] text-center ${getPriorityColor(newJobPriority)}`}>
                  P{newJobPriority}
                </span>
              </div>
              <div className="flex justify-between text-[8px] text-zinc-700 mt-1">
                <span>Low</span>
                <span>Critical</span>
              </div>
            </div>
            <Button
              className="w-full bg-violet-600 hover:bg-violet-500"
              onClick={handleCreate}
              disabled={!newJobText.trim() || isCreating}
            >
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Create Job
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <AlertDialogContent className="bg-[#0c0a14] border-zinc-800/60">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Cancel Job?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-zinc-500">
              This will cancel job &quot;{cancelTarget?.inputRequest?.slice(0, 60)}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800/50 border-zinc-700/50 text-zinc-400 text-xs">Keep Running</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-600 hover:bg-orange-500 text-xs" onClick={() => cancelTarget && handleCancel(cancelTarget)}>
              Cancel Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Keyboard Shortcuts */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="bg-[#0c0a14] border-zinc-800/60 max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-violet-400" />Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {[
              ['⌘/Ctrl + N', 'New job'],
              ['Escape', 'Close dialog'],
              ['Delete', 'Delete selected job'],
              ['?', 'Toggle shortcuts'],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-400">{desc}</span>
                <kbd className="text-[9px] font-mono bg-zinc-800/60 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700/50">{key}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats Dashboard */}
      <Dialog open={showStats} onOpenChange={setShowStats}>
        <DialogContent className="bg-[#0c0a14] border-zinc-800/60 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-400" />Stats Dashboard
            </DialogTitle>
          </DialogHeader>
          <StatsDashboard jobs={allJobs} />
        </DialogContent>
      </Dialog>

      {/* Job Compare */}
      <Dialog open={showCompare} onOpenChange={setShowCompare}>
        <DialogContent className="bg-[#0c0a14] border-zinc-800/60 max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-violet-400" />Compare Jobs
            </DialogTitle>
          </DialogHeader>
          <JobCompare jobs={allJobs} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
