'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { io, Socket } from 'socket.io-client'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragStartEvent, DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import {
  Box, Play, Trash2, Settings, Clock, CheckCircle2,
  Loader2, Download, Shield, Cpu, Activity, Layers,
  RefreshCw, Search, Plus, ArrowUpDown, RotateCcw, X,
  Keyboard, Sparkles, Hash, AlertCircle, Repeat, Maximize2,
  Ban, CheckSquare, Square, XSquare, StickyNote, BarChart3,
  GitCompare, Eye, Zap, FileJson, Wifi, WifiOff, Timer, Palette,
  GitBranch
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
import { ScadEditor } from '@/components/cad/scad-editor'
import { JobDependencies } from '@/components/cad/job-dependencies'
import { ThemePanel } from '@/components/cad/theme-panel'
import { ThreeDViewer } from '@/components/cad/three-d-viewer'
import { TimelinePanel } from '@/components/cad/timeline-panel'
import { ResearchPanel } from '@/components/cad/research-panel'
import { ChatPanel } from '@/components/cad/chat-panel'
import { NotesPanel } from '@/components/cad/notes-panel'
import { StatsDashboard } from '@/components/cad/stats-dashboard'
import { JobCompare } from '@/components/cad/job-compare'
import { PartFamilyIcon } from '@/components/cad/part-family-icon'
import { JobTemplateCards } from '@/components/cad/job-templates'
import { CaseMemory } from '@/components/cad/case-memory'
import { SortableJobCard, DragOverlayCard } from '@/components/cad/sortable-job-card'

// Type & API imports
import {
  Job, FILTER_STATES, CANCELABLE_STATES, timeAgo, formatDate,
  getStateInfo, parseJSON, getPipelineProgress, safeNum, getPriorityColor
} from '@/components/cad/types'
import {
  fetchJobs, createJob, deleteJob, processJob,
  cancelJob, batchOperation, updatePriority
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
  const [showSettings, setShowSettings] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Job | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState('PARAMS')
  const [prevTab, setPrevTab] = useState('PARAMS')
  const [tabDirection, setTabDirection] = useState(1) // 1 = forward, -1 = back
  const [prevJobId, setPrevJobId] = useState<string | null>(null)
  const [jobCountFlash, setJobCountFlash] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [uptimeSeconds, setUptimeSeconds] = useState(0)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [dependencyCount, setDependencyCount] = useState(0)
  const { toast } = useToast()
  const startTimeRef = useRef(Date.now())

  // ── DnD Sensors ─────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)

    if (!over || active.id === over.id) return

    // Get the current sorted job IDs
    const sortedJobs = [...jobs].sort((a, b) => b.priority - a.priority || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const oldIndex = sortedJobs.findIndex(j => j.id === active.id)
    const newIndex = sortedJobs.findIndex(j => j.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    // Reorder the array
    const reordered = arrayMove(sortedJobs, oldIndex, newIndex)

    // Calculate new priorities: top items get higher priority
    // We'll assign priorities from the top: max existing priority down to 1
    const maxPriority = Math.max(...allJobs.map(j => j.priority), 10)

    // Optimistically update local state
    const updatedJobs = reordered.map((job, idx) => ({
      ...job,
      priority: maxPriority - idx,
    }))
    setJobs(updatedJobs)

    // Send priority updates for affected jobs
    try {
      // Only update jobs whose priority actually changed
      const updates = updatedJobs.filter((uj) => {
        const original = sortedJobs.find(j => j.id === uj.id)
        return original && original.priority !== uj.priority
      })

      await Promise.all(
        updates.map(uj => updatePriority(uj.id, uj.priority))
      )
    } catch (err) {
      console.error('Failed to update priorities:', err)
      toast({ title: 'Priority update failed', variant: 'destructive', duration: 2000 })
      await loadJobs() // Reload to get correct state
    }
  }

  const handleDragCancel = () => {
    setActiveDragId(null)
  }

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
      setWsConnected(true)
      stopPolling() // Stop polling when WS is connected
    })

    socket.on('job:update', () => {
      loadJobs() // Refresh data on any job update
    })

    socket.on('disconnect', () => {
      console.log('[WS] Disconnected from ws-service, falling back to polling')
      setWsConnected(false)
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
        setShowSettings(false)
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

  // Count total linked jobs (jobs with parentId set)
  const linkedJobCount = useMemo(() => {
    return allJobs.filter(j => j.parentId).length
  }, [allJobs])

  // Uptime counter
  useEffect(() => {
    const interval = setInterval(() => {
      setUptimeSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const uptime = uptimeSeconds

  // ── Download Helpers ──────────────────────────────────────────────────

  const downloadScad = (job: Job) => {
    if (!job.scadSource) return
    const blob = new Blob([job.scadSource], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.id.slice(0, 8)}-${job.partFamily || 'part'}.scad`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast({ title: 'SCAD file downloaded', duration: 1500 })
  }

  const exportAllData = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      version: '0.7',
      totalJobs: allJobs.length,
      jobs: allJobs,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agentscad-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast({ title: 'Data exported', description: `${allJobs.length} jobs`, duration: 2000 })
  }

  const formatUptime = (s: number) => {
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  }

  const successRate = useMemo(() => {
    const finished = allJobs.filter(j =>
      ['DELIVERED', 'VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED'].includes(j.state)
    )
    if (finished.length === 0) return 0
    const succeeded = finished.filter(j => j.state === 'DELIVERED').length
    return Math.round((succeeded / finished.length) * 100)
  }, [allJobs])

  // ── Job count flash effect ────────────────────────────────────────────────
  const prevJobCountRef = useRef(allJobs.length)
  useEffect(() => {
    if (allJobs.length !== prevJobCountRef.current) {
      prevJobCountRef.current = allJobs.length
      setJobCountFlash(true)
      const timer = setTimeout(() => setJobCountFlash(false), 500)
      return () => clearTimeout(timer)
    }
  }, [allJobs.length])

  // ── Mouse tracking for ambient glow effect ─────────────────────────────
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`)
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`)
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-[#080810] text-zinc-100 overflow-hidden noise-overlay crt-scanline">
      {/* Mouse-following ambient glow */}
      <div className="mouse-glow" />
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 bg-[#0a0818]/80 backdrop-blur-md shrink-0 header-gradient-border depth-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center logo-pulse">
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
                <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300" onClick={() => setShowSettings(true)}>
                  <Palette className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Theme & Settings</p></TooltipContent>
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
          <Button size="sm" className="h-6 text-[10px] gap-1 bg-violet-600 hover:bg-violet-500 btn-glow btn-ripple btn-hover-lift" onClick={() => setShowComposer(true)}>
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

              {/* Jobs List with Drag & Drop */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <ScrollArea className="flex-1">
                  <SortableContext
                    items={jobs.sort((a, b) => b.priority - a.priority || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(j => j.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="p-2 space-y-1">
                      {jobs.sort((a, b) => b.priority - a.priority || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(job => (
                        <SortableJobCard
                          key={job.id}
                          job={job}
                          isSelected={selectedJob?.id === job.id}
                          isChecked={selectedIds.has(job.id)}
                          onSelect={(j) => { setSelectedJob(j); setActiveTab('PARAMS') }}
                          onToggleSelect={toggleSelect}
                          onProcess={handleProcess}
                          onCancel={(j) => setCancelTarget(j)}
                          onDuplicate={handleDuplicate}
                          onDelete={handleDelete}
                        />
                      ))}
                      {jobs.length === 0 && (
                        <div className="relative flex flex-col items-center justify-center py-12 text-zinc-600 gap-3">
                          <div className="w-14 h-14 rounded-2xl bg-zinc-800/20 flex items-center justify-center empty-float">
                            <Layers className="w-7 h-7 opacity-20" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm gradient-text-muted">No jobs found</p>
                            <p className="text-[10px] text-zinc-700 mt-1">Create a new job or adjust filters</p>
                          </div>
                          <div className="particle-dot" style={{ top: '20%', left: '30%', animation: 'particle-drift 3s ease-in-out infinite' }} />
                          <div className="particle-dot" style={{ top: '40%', right: '25%', animation: 'particle-drift 4s ease-in-out infinite 1s' }} />
                          <div className="particle-dot" style={{ bottom: '30%', left: '40%', animation: 'particle-drift 3.5s ease-in-out infinite 0.5s' }} />
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </ScrollArea>
                <DragOverlay>
                  {activeDragId ? (
                    <DragOverlayCard job={jobs.find(j => j.id === activeDragId)!} />
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Center: 3D Viewer */}
          <ResizablePanel defaultSize={40} minSize={25}>
            <div className="flex flex-col h-full bg-[#080810] depth-0">
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
                        <Button size="sm" className="h-6 text-[9px] gap-1 bg-emerald-600 hover:bg-emerald-500 btn-ripple btn-hover-lift" onClick={() => handleProcess(selectedJob)} disabled={isProcessing}>
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
                        <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300" onClick={() => downloadScad(selectedJob)}>
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
                    <div className="px-3 py-1 progress-shimmer">
                      <Progress value={getPipelineProgress(selectedJob.state)} className="h-1" />
                    </div>
                  )}
                  {/* 3D Viewer */}
                  <div className="flex-1 viewer-gradient-border">
                    <ThreeDViewer job={selectedJob} />
                  </div>
                </>
              ) : (
                <div className="relative flex flex-col items-center justify-center h-full text-zinc-600 gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-zinc-800/20 flex items-center justify-center empty-float">
                    <Box className="w-10 h-10 opacity-15" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium gradient-text-muted">No job selected</p>
                    <p className="text-[10px] text-zinc-700 mt-1">Select a job from the list or create a new one</p>
                  </div>
                  <div className="particle-dot" style={{ top: '25%', left: '20%', animation: 'particle-drift 3s ease-in-out infinite' }} />
                  <div className="particle-dot" style={{ top: '35%', right: '30%', animation: 'particle-drift 4s ease-in-out infinite 0.5s' }} />
                  <div className="particle-dot" style={{ bottom: '30%', left: '35%', animation: 'particle-drift 3.5s ease-in-out infinite 1s' }} />
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
                <Tabs value={activeTab} onValueChange={(v) => {
                  const tabOrder = ['PARAMS', 'RESEARCH', 'VALIDATE', 'SCAD', 'LOG', 'NOTES', 'DEPS', 'AI']
                  const newIdx = tabOrder.indexOf(v)
                  const oldIdx = tabOrder.indexOf(activeTab)
                  setTabDirection(newIdx > oldIdx ? 1 : -1)
                  setPrevTab(activeTab)
                  setActiveTab(v)
                }} className="flex flex-col h-full">
                  {/* Inspector Breadcrumb with fade-in on job change */}
                  <div key={selectedJob.id} className="inspector-breadcrumb px-3 py-1 flex items-center gap-1.5 text-[9px] font-mono shrink-0 breadcrumb-fade-in">
                    <span className="text-zinc-600">{selectedJob.id.slice(0, 8)}</span>
                    <span className="text-zinc-700">›</span>
                    <span className="text-violet-400">{activeTab}</span>
                  </div>
                  <TabsList className="w-full justify-start px-2 py-1 bg-transparent border-b border-zinc-800/60 h-auto rounded-none shrink-0">
                    {[
                      { key: 'PARAMS', label: 'PARAMS', icon: Settings },
                      { key: 'RESEARCH', label: 'RESEARCH', icon: Sparkles },
                      { key: 'VALIDATE', label: 'VALIDATE', icon: Shield },
                      { key: 'SCAD', label: 'SCAD', icon: Activity },
                      { key: 'LOG', label: 'LOG', icon: Clock },
                      { key: 'NOTES', label: 'NOTES', icon: StickyNote },
                      { key: 'DEPS', label: 'DEPS', icon: GitBranch },
                      { key: 'AI', label: 'AI', icon: Zap },
                    ].map(tab => (
                      <TabsTrigger
                        key={tab.key}
                        value={tab.key}
                        className="text-[9px] font-mono tracking-wider px-2 py-1.5 data-[state=active]:bg-violet-600/15 data-[state=active]:text-violet-300 data-[state=active]:tab-active-glow rounded-sm h-auto min-h-0 transition-all duration-200 tab-slide-underline depth-1 tab-click-feedback"
                      >
                        {tab.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <div className="flex-1 overflow-hidden">
                    <AnimatePresence mode="wait" custom={tabDirection}>
                      <motion.div key={activeTab} custom={tabDirection} initial={{ opacity: 0, x: tabDirection * 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: tabDirection * -20 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="h-full">
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
                          <ScadEditor job={selectedJob} onUpdate={loadJobs} />
                        </TabsContent>
                        <TabsContent value="LOG" className="h-full m-0 data-[state=inactive]:hidden">
                          <TimelinePanel job={selectedJob} />
                        </TabsContent>
                        <TabsContent value="NOTES" className="h-full m-0 data-[state=inactive]:hidden">
                          <NotesPanel job={selectedJob} onUpdate={loadJobs} />
                        </TabsContent>
                        <TabsContent value="DEPS" className="h-full m-0 data-[state=inactive]:hidden">
                          <JobDependencies job={selectedJob} allJobs={allJobs} onUpdate={loadJobs} onNavigateToJob={(jobId) => { const found = allJobs.find(j => j.id === jobId); if (found) { setSelectedJob(found); setActiveTab('PARAMS') } }} />
                        </TabsContent>
                        <TabsContent value="AI" className="h-full m-0 data-[state=inactive]:hidden">
                          <ChatPanel key={selectedJob.id} job={selectedJob} />
                        </TabsContent>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </Tabs>
              ) : (
                <div className="relative flex flex-col items-center justify-center h-full text-zinc-600 gap-3 p-6">
                  <div className="w-12 h-12 rounded-xl bg-zinc-800/30 flex items-center justify-center empty-float">
                    <Settings className="w-6 h-6 opacity-30" />
                  </div>
                  <p className="text-sm gradient-text-muted">Inspector</p>
                  <p className="text-[10px] text-zinc-700">Select a job to inspect</p>
                  <div className="particle-dot" style={{ top: '30%', right: '20%', animation: 'particle-drift 3s ease-in-out infinite' }} />
                  <div className="particle-dot" style={{ bottom: '25%', left: '25%', animation: 'particle-drift 4s ease-in-out infinite 0.7s' }} />
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      {/* Footer */}
      <footer className="relative flex items-center justify-between px-4 py-1 border-t border-zinc-800/60 bg-[#0a0818]/80 backdrop-blur-md shrink-0 footer-wave-border footer-pattern">
        <div className="flex items-center gap-4 text-[9px] font-mono text-zinc-600">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 sonar-ring-dot" /><Activity className="w-2.5 h-2.5 text-emerald-500" />System Online</span>
          <span className="footer-separator" />
          <span className="flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 online-pulse-dot' : 'bg-rose-500'}`} />WS: {wsConnected ? 'Connected' : 'Disconnected'}</span>
          <span className="footer-separator" />
          <span className={jobCountFlash ? 'number-highlight' : ''}>Jobs: {allJobs.length}</span>
          <span className="footer-separator" />
          <span>Delivered: {stateCounts['DELIVERED'] || 0}</span>
          <span className="footer-separator" />
          <span>Failed: {(stateCounts['VALIDATION_FAILED'] || 0) + (stateCounts['GEOMETRY_FAILED'] || 0) + (stateCounts['RENDER_FAILED'] || 0)}</span>
          <span className="footer-separator" />
          <span className="flex items-center gap-1"><GitBranch className="w-2.5 h-2.5" />Deps: {linkedJobCount}</span>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono text-zinc-700">
          <span className="flex items-center gap-1"><Timer className="w-2.5 h-2.5" />{formatUptime(uptime)}</span>
          <span className="footer-separator" />
          <span className="flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" />{successRate}%</span>
          <span className="footer-separator" />
          <span className="flex items-center gap-1"><Cpu className="w-2.5 h-2.5" />AgentSCAD v0.7</span>
          <Button variant="ghost" size="sm" className="h-4 text-[8px] gap-1 text-zinc-600 hover:text-zinc-400" onClick={exportAllData}>
            <FileJson className="w-2.5 h-2.5" />Export
          </Button>
        </div>
      </footer>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}

      {/* Job Composer */}
      <Dialog open={showComposer} onOpenChange={setShowComposer}>
        <DialogContent className="bg-[#0c0a14]/95 border-zinc-800/60 max-w-lg backdrop-blur-xl dialog-elastic-enter">
          <DialogHeader className="dialog-header-glow">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Plus className="w-4 h-4 text-violet-400" />New CAD Job
            </DialogTitle>
          </DialogHeader>
          <div className="gradient-divider" />
          <div className="space-y-4">
            <JobTemplateCards onSelect={(template) => setNewJobText(template)} />
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
              {/* Case Memory - Similar Past Jobs */}
              <CaseMemory
                searchQuery={newJobText}
                onSuggestionClick={(job) => {
                  toast({
                    title: 'Similar job found',
                    description: job.inputRequest.slice(0, 60),
                    duration: 3000,
                  })
                }}
              />
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
              className="w-full bg-violet-600 hover:bg-violet-500 btn-press"
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
        <AlertDialogContent className="bg-[#0c0a14]/95 border-zinc-800/60 backdrop-blur-xl dialog-elastic-enter">
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
        <DialogContent className="bg-[#0c0a14]/95 border-zinc-800/60 max-w-xs backdrop-blur-xl dialog-elastic-enter">
          <DialogHeader className="dialog-header-glow">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-violet-400" />Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="gradient-divider" />
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
        <DialogContent className="bg-[#0c0a14]/95 border-zinc-800/60 max-w-2xl backdrop-blur-xl dialog-elastic-enter">
          <DialogHeader className="dialog-header-glow">
            <DialogTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-400" />Stats Dashboard
            </DialogTitle>
          </DialogHeader>
          <StatsDashboard jobs={allJobs} />
        </DialogContent>
      </Dialog>

      {/* Job Compare */}
      <Dialog open={showCompare} onOpenChange={setShowCompare}>
        <DialogContent className="bg-[#0c0a14]/95 border-zinc-800/60 max-w-4xl max-h-[80vh] backdrop-blur-xl dialog-elastic-enter">
          <DialogHeader className="dialog-header-glow">
            <DialogTitle className="text-sm flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-violet-400" />Compare Jobs
            </DialogTitle>
          </DialogHeader>
          <JobCompare jobs={allJobs} />
        </DialogContent>
      </Dialog>

      {/* Theme & Settings */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="bg-[#0c0a14]/95 border-zinc-800/60 max-w-sm backdrop-blur-xl dialog-elastic-enter">
          <DialogHeader className="dialog-header-glow">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Palette className="w-4 h-4 text-violet-400" />Theme & Settings
            </DialogTitle>
          </DialogHeader>
          <div className="gradient-divider" />
          <ThemePanel />
        </DialogContent>
      </Dialog>
    </div>
  )
}
