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
  GitBranch, ArrowUp, ArrowDown, Wand2, Tag, History, Link2,
  Sun, Moon, ChevronRight, Copy, CheckCircle
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import dynamic from 'next/dynamic'
import { ScadEditor } from '@/components/cad/scad-editor'
import { JobDependencies } from '@/components/cad/job-dependencies'
import { ThemePanel } from '@/components/cad/theme-panel'

// Heavy components - lazy loaded to reduce initial bundle size
const ThreeDViewer = dynamic(() => import('@/components/cad/three-d-viewer').then(m => ({ default: m.ThreeDViewer })), { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-[var(--app-text-muted)]" /></div> })
const ScadViewer = dynamic(() => import('@/components/cad/scad-viewer').then(m => ({ default: m.ScadViewer })), { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-[var(--app-text-muted)]" /></div> })
const ChatPanel = dynamic(() => import('@/components/cad/chat-panel').then(m => ({ default: m.ChatPanel })), { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-[var(--app-text-muted)]" /></div> })
const StatsDashboard = dynamic(() => import('@/components/cad/stats-dashboard').then(m => ({ default: m.StatsDashboard })), { ssr: false, loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-5 h-5 animate-spin text-[var(--app-text-muted)]" /></div> })
const JobCompare = dynamic(() => import('@/components/cad/job-compare').then(m => ({ default: m.JobCompare })), { ssr: false, loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-5 h-5 animate-spin text-[var(--app-text-muted)]" /></div> })
const JobStatusPage = dynamic(() => import('@/components/cad/job-status-page').then(m => ({ default: m.JobStatusPage })), { ssr: false, loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-5 h-5 animate-spin text-[var(--app-text-muted)]" /></div> })
const ResearchPanel = dynamic(() => import('@/components/cad/research-panel').then(m => ({ default: m.ResearchPanel })), { ssr: false, loading: () => <div className="p-4 text-[var(--app-text-dim)] text-xs">Loading...</div> })
const TimelinePanel = dynamic(() => import('@/components/cad/timeline-panel').then(m => ({ default: m.TimelinePanel })), { ssr: false, loading: () => <div className="p-4 text-[var(--app-text-dim)] text-xs">Loading...</div> })
const NotesPanel = dynamic(() => import('@/components/cad/notes-panel').then(m => ({ default: m.NotesPanel })), { ssr: false, loading: () => <div className="p-4 text-[var(--app-text-dim)] text-xs">Loading...</div> })
import { PartFamilyIcon, getPartFamilyLabel, getPartFamilyColor } from '@/components/cad/part-family-icon'
import { JobTemplateCards } from '@/components/cad/job-templates'
import { CaseMemory } from '@/components/cad/case-memory'
import { SortableJobCard, DragOverlayCard } from '@/components/cad/sortable-job-card'
import { JobVersionHistory } from '@/components/cad/job-version-history'
import { JobContextMenu } from '@/components/cad/job-context-menu'
import { BatchParameterEditor } from '@/components/cad/batch-parameter-editor'
import { NotificationCenter, Notification, NotificationType } from '@/components/cad/notification-center'
import { TagBadges, parseTags, buildCustomerId } from '@/components/cad/tag-badges'
import { CommandPalette, CommandAction } from '@/components/cad/command-palette'
import { SearchFilterPanel, FilterState, DEFAULT_FILTER_STATE, applyFilters, countActiveFilters, filtersToUrlParams, urlParamsToFilters } from '@/components/cad/search-filter-panel'
import { QuickActionsBar } from '@/components/cad/quick-actions-bar'
import { Footer } from '@/components/cad/footer'
import { JobActivityFeed, ActivityEvent, ActivityEventType } from '@/components/cad/job-activity-feed'
import { BreadcrumbNav } from '@/components/cad/breadcrumb-nav'


// Type & API imports
import {
  Job, FILTER_STATES, CANCELABLE_STATES, timeAgo, formatDate,
  getStateInfo, parseJSON, getPipelineProgress, safeNum, getPriorityColor
} from '@/components/cad/types'
import {
  fetchJobs, createJob, deleteJob, processJob,
  cancelJob, batchOperation, updatePriority, sendChatMessageStream,
  applyScadSource,
  batchUpdateParameters
} from '@/components/cad/api'

// ─── Main Page ───────────────────────────────────────────────────────────────

export function MainWorkspace() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [allJobs, setAllJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [filterState, setFilterState] = useState<FilterState>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const urlFilters = urlParamsToFilters(params)
      return { ...DEFAULT_FILTER_STATE, ...urlFilters }
    }
    return DEFAULT_FILTER_STATE
  })
  const [showCommandPalette, setShowCommandPalette] = useState(false)
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
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [newJobTags, setNewJobTags] = useState('')
  const [isAiEnhancing, setIsAiEnhancing] = useState(false)
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([])
  const [showActivityFeed, setShowActivityFeed] = useState(false)
  const [showThemePanel, setShowThemePanel] = useState(false)
  const { toast } = useToast()
  const startTimeRef = useRef(Date.now())
  const activityFeedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // ── Notification Helper ────────────────────────────────────────────────

  const addNotification = useCallback((type: NotificationType, title: string, description: string) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setNotifications(prev => {
      const next = [{ id, type, title, description, timestamp: new Date(), read: false }, ...prev]
      // Max 50 notifications, remove oldest
      return next.slice(0, 50)
    })
  }, [])

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }, [])

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const clearAllNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  // ── Activity Feed Helper ─────────────────────────────────────────────

  const addActivityEvent = useCallback((type: ActivityEventType, jobName: string, jobId: string, action: string) => {
    const id = `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setActivityEvents(prev => {
      const next = [{ id, type, jobName, jobId, action, timestamp: new Date() }, ...prev]
      // Max 50 events, remove oldest
      return next.slice(0, 50)
    })
  }, [])

  const clearActivityEvents = useCallback(() => {
    setActivityEvents([])
  }, [])

  // Close activity feed on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (activityFeedRef.current && !activityFeedRef.current.contains(e.target as Node)) {
        setShowActivityFeed(false)
      }
    }
    if (showActivityFeed) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showActivityFeed])

  // ── Recent Requests (for composer) ────────────────────────────────────

  const recentRequests = useMemo(() => {
    const seen = new Set<string>()
    const unique: string[] = []
    for (const j of [...allJobs].reverse()) {
      const req = j.inputRequest.trim()
      if (req && !seen.has(req.toLowerCase())) {
        seen.add(req.toLowerCase())
        unique.push(req)
        if (unique.length >= 5) break
      }
    }
    return unique
  }, [allJobs])

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

  // Use ref for selectedJob to avoid loadJobs dependency changes on selection
  const selectedJobRef = useRef<Job | null>(null)
  selectedJobRef.current = selectedJob

  const loadJobs = useCallback(async () => {
    try {
      const data = await fetchJobs()
      // Only update state if data actually changed to prevent card jumping
      setAllJobs(prev => {
        if (prev.length === data.jobs.length && prev.every((j, i) => j.id === data.jobs[i].id && j.state === data.jobs[i].state && j.priority === data.jobs[i].priority && j.updatedAt === data.jobs[i].updatedAt)) {
          return prev // No change, return same reference to skip re-render
        }
        return data.jobs
      })
      const filtered = applyFilters(data.jobs, filterState)
      setJobs(prev => {
        if (prev.length === filtered.length && prev.every((j, i) => j.id === filtered[i].id && j.state === filtered[i].state)) {
          return prev
        }
        return filtered
      })
      // Update selected job if it exists (using ref to avoid dep)
      const currentSelected = selectedJobRef.current
      if (currentSelected) {
        const updated = data.jobs.find(j => j.id === currentSelected.id)
        if (updated && (updated.state !== currentSelected.state || updated.updatedAt !== currentSelected.updatedAt)) {
          setSelectedJob(updated)
        }
      }
    } catch (err) {
      console.error('Failed to load jobs:', err)
    }
  }, [filterState])

  // ── WebSocket + Polling Fallback ─────────────────────────────────────────

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const socketRef = useRef<Socket | null>(null)

  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(loadJobs, 15000) // 15s to reduce card jumping
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
      const target = e.target as HTMLElement
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      // Ctrl+Shift+N: New job with focus on textarea
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        setShowComposer(true)
        // Focus textarea after dialog opens
        setTimeout(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>('[data-composer-textarea]')
          if (textarea) textarea.focus()
        }, 100)
        return
      }

      // ⌘K / Ctrl+K: Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowCommandPalette(true)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        setShowComposer(true)
        return
      }
      if (e.key === 'Escape') {
        setShowCommandPalette(false)
        setShowComposer(false)
        setShowShortcuts(false)
        setShowStats(false)
        setShowCompare(false)
        setShowSettings(false)
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !isInputFocused) {
        setShowShortcuts(prev => !prev)
      }
      if (e.key === 'Delete' && selectedJob && !showComposer && !isInputFocused) {
        handleDelete(selectedJob.id)
      }
      // Space: Process selected job
      if (e.key === ' ' && selectedJob && !showComposer && !isInputFocused) {
        e.preventDefault()
        if (selectedJob.state === 'NEW') handleProcess(selectedJob)
      }
      // E: Edit SCAD code
      if (e.key === 'e' && !e.metaKey && !e.ctrlKey && !isInputFocused && !showComposer) {
        setActiveTab('SCAD')
      }
      // D: Show dependencies
      if (e.key === 'd' && !e.metaKey && !e.ctrlKey && !isInputFocused && !showComposer) {
        setActiveTab('DEPS')
      }
      // H: Show history (LOG tab)
      if (e.key === 'h' && !e.metaKey && !e.ctrlKey && !isInputFocused && !showComposer) {
        setActiveTab('LOG')
      }
      // T: Open theme settings
      if (e.key === 't' && !e.metaKey && !e.ctrlKey && !isInputFocused && !showComposer) {
        setShowSettings(true)
      }
      // 1-7: Switch inspector tabs
      const tabMap: Record<string, string> = { '1': 'PARAMS', '2': 'RESEARCH', '3': 'VALIDATE', '4': 'SCAD', '5': 'LOG', '6': 'NOTES', '7': 'DEPS', '8': 'HISTORY', '9': 'AI' }
      if (tabMap[e.key] && !e.metaKey && !e.ctrlKey && !isInputFocused && !showComposer) {
        setActiveTab(tabMap[e.key])
      }
      // Shift+Up/Down: Move job priority
      if (e.shiftKey && e.key === 'ArrowUp' && selectedJob && !isInputFocused) {
        e.preventDefault()
        const newPriority = Math.min(10, selectedJob.priority + 1)
        updatePriority(selectedJob.id, newPriority).then(() => {
          addNotification('parameter_updated', 'Priority increased', `Job ${selectedJob.id.slice(0, 8)} → P${newPriority}`)
          loadJobs()
        })
      }
      if (e.shiftKey && e.key === 'ArrowDown' && selectedJob && !isInputFocused) {
        e.preventDefault()
        const newPriority = Math.max(1, selectedJob.priority - 1)
        updatePriority(selectedJob.id, newPriority).then(() => {
          addNotification('parameter_updated', 'Priority decreased', `Job ${selectedJob.id.slice(0, 8)} → P${newPriority}`)
          loadJobs()
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedJob, showComposer, addNotification, loadJobs])

  // ── Job Actions ───────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newJobText.trim()) return
    setIsCreating(true)
    try {
      const tagsCustomerId = newJobTags.trim() ? buildCustomerId(newJobTags.split(',').map(t => t.trim()).filter(t => t)) : undefined
      const { job } = await createJob(newJobText.trim(), tagsCustomerId, newJobPriority)
      toast({ title: 'Job created', description: `Priority ${newJobPriority}`, duration: 2000 })
      addNotification('parameter_updated', 'Job created', newJobText.trim().slice(0, 60))
      addActivityEvent('created', newJobText.trim().slice(0, 30), job.id.slice(0, 8), 'Created')
      setNewJobText('')
      setNewJobPriority(5)
      setNewJobTags('')
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
        setSelectedJob(prev => {
          if (!prev) return prev
          if (data.job) return data.job as Job

          const next = { ...prev }
          if (data.state) next.state = data.state as string
          if (data.scadSource) next.scadSource = data.scadSource as string
          if (data.parameterSchema) next.parameterSchema = typeof data.parameterSchema === 'string' ? data.parameterSchema : JSON.stringify(data.parameterSchema)
          if (data.parameterValues) next.parameterValues = typeof data.parameterValues === 'string' ? data.parameterValues : JSON.stringify(data.parameterValues)
          if (data.partFamily) next.partFamily = data.partFamily as string
          if (data.validationResults) next.validationResults = typeof data.validationResults === 'string' ? data.validationResults : JSON.stringify(data.validationResults)
          if (data.stlPath) next.stlPath = data.stlPath as string
          if (data.pngPath) next.pngPath = data.pngPath as string
          if (data.researchResult) next.researchResult = typeof data.researchResult === 'string' ? data.researchResult : JSON.stringify(data.researchResult)
          if (data.intentResult) next.intentResult = typeof data.intentResult === 'string' ? data.intentResult : JSON.stringify(data.intentResult)
          if (data.designResult) next.designResult = typeof data.designResult === 'string' ? data.designResult : JSON.stringify(data.designResult)
          if (data.renderLog) next.renderLog = typeof data.renderLog === 'string' ? data.renderLog : JSON.stringify(data.renderLog)
          if (data.builderName) next.builderName = data.builderName as string
          if (data.generationPath) next.generationPath = data.generationPath as string
          return next
        })
        const step = data.step as string
        if (step === 'scad_generated') {
          toast({ title: 'SCAD Generated', description: 'Code generated successfully', duration: 1500 })
          addNotification('scad_updated', 'SCAD Generated', `Job ${job.id.slice(0, 8)} - Code generated`)
          addActivityEvent('processed', job.inputRequest.slice(0, 30), job.id.slice(0, 8), 'SCAD Generated')
        } else if (step === 'rendered') {
          toast({ title: 'Rendered', description: '3D model rendered', duration: 1500 })
        } else if (step === 'validated') {
          toast({ title: 'Validated', description: 'Quality checks passed', duration: 1500 })
        } else if (step === 'delivered') {
          toast({ title: 'Delivered!', description: 'All deliverables ready', duration: 2000 })
          addNotification('job_completed', 'Job Delivered', `Job ${job.id.slice(0, 8)} - All deliverables ready`)
          addActivityEvent('delivered', job.inputRequest.slice(0, 30), job.id.slice(0, 8), 'Delivered')
        }
      })
      await loadJobs()
    } catch {
      toast({ title: 'Processing failed', variant: 'destructive', duration: 3000 })
      addNotification('job_failed', 'Processing Failed', `Job ${job.id.slice(0, 8)} - An error occurred`)
      addActivityEvent('failed', job.inputRequest.slice(0, 30), job.id.slice(0, 8), 'Processing Failed')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleApplyScad = useCallback(async (job: Job, scadSource: string) => {
    setIsProcessing(true)
    setSelectedJob(job)

    try {
      await applyScadSource(job.id, scadSource, (data) => {
        setSelectedJob(prev => {
          if (!prev) return prev
          if (data.job) return data.job as Job

          const next = { ...prev }
          if (data.state) next.state = data.state as string
          if (data.scadSource) next.scadSource = data.scadSource as string
          if (data.parameterSchema) next.parameterSchema = typeof data.parameterSchema === 'string' ? data.parameterSchema : JSON.stringify(data.parameterSchema)
          if (data.parameterValues) next.parameterValues = typeof data.parameterValues === 'string' ? data.parameterValues : JSON.stringify(data.parameterValues)
          if (data.validationResults) next.validationResults = typeof data.validationResults === 'string' ? data.validationResults : JSON.stringify(data.validationResults)
          if (data.renderLog) next.renderLog = typeof data.renderLog === 'string' ? data.renderLog : JSON.stringify(data.renderLog)
          if (data.stlPath) next.stlPath = data.stlPath as string
          if (data.pngPath) next.pngPath = data.pngPath as string
          if (data.generationPath) next.generationPath = data.generationPath as string
          return next
        })

        const step = data.step as string
        if (step === 'scad_applied') {
          toast({ title: 'SCAD applied', description: 'Rebuilding render and parameters…', duration: 1800 })
        } else if (step === 'rendered') {
          toast({ title: 'Rendered', description: 'Preview updated from applied SCAD', duration: 1500 })
        } else if (step === 'validated') {
          toast({ title: 'Validated', description: 'Applied SCAD checks passed', duration: 1500 })
        } else if (step === 'delivered') {
          toast({ title: 'Apply complete', description: 'SCAD, render, and parameters are now in sync', duration: 2000 })
        } else if (step === 'render_failed') {
          toast({ title: 'Render failed', description: String(data.error || 'Applied SCAD could not be rendered'), variant: 'destructive', duration: 3500 })
        }
      })

      await loadJobs()
    } catch (error) {
      toast({
        title: 'Apply failed',
        description: error instanceof Error ? error.message : 'Failed to apply SCAD',
        variant: 'destructive',
        duration: 3500,
      })
    } finally {
      setIsProcessing(false)
    }
  }, [loadJobs, toast])

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
      addNotification('job_cancelled', 'Job Cancelled', `Job ${job.id.slice(0, 8)} - Cancelled by user`)
      addActivityEvent('failed', job.inputRequest.slice(0, 30), job.id.slice(0, 8), 'Cancelled')
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

  const handleSetPriority = useCallback(async (id: string, priority: number) => {
    try {
      await updatePriority(id, priority)
      toast({ title: `Priority set to P${priority}`, duration: 1500 })
      addNotification('parameter_updated', 'Priority updated', `Job ${id.slice(0, 8)} → P${priority}`)
      await loadJobs()
    } catch {
      toast({ title: 'Failed to update priority', variant: 'destructive', duration: 2000 })
    }
  }, [toast, addNotification, loadJobs])

  const handleLinkParent = useCallback((job: Job) => {
    setSelectedJob(job)
    setActiveTab('DEPS')
  }, [])

  // ── Filter State Handler ────────────────────────────────────────────────

  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilterState(newFilters)
    // Sync to URL params
    const params = filtersToUrlParams(newFilters)
    const url = new URL(window.location.href)
    // Clear existing filter params
    for (const key of ['q', 'states', 'pmin', 'pmax', 'dr', 'df', 'dt', 'pf', 'bn', 'sort', 'order']) {
      url.searchParams.delete(key)
    }
    // Set new params
    params.forEach((value, key) => {
      url.searchParams.set(key, value)
    })
    window.history.replaceState(null, '', url.pathname + (params.toString() ? '?' + params.toString() : ''))
  }, [])

  // ── Command Palette Actions ──────────────────────────────────────────────

  const commandPaletteActions: CommandAction[] = useMemo(() => [
    {
      id: 'create-job',
      label: 'Create New Job',
      icon: <Plus className="w-4 h-4 text-emerald-400" />,
      shortcut: '⌘N',
      onSelect: () => setShowComposer(true),
      category: 'action' as const,
    },
    {
      id: 'toggle-theme',
      label: 'Toggle Theme',
      icon: <Palette className="w-4 h-4 text-[var(--app-accent-text)]" />,
      shortcut: 'T',
      onSelect: () => setShowSettings(true),
      category: 'action' as const,
    },
    {
      id: 'show-stats',
      label: 'Show Statistics',
      icon: <BarChart3 className="w-4 h-4 text-cyan-400" />,
      shortcut: '',
      onSelect: () => setShowStats(true),
      category: 'action' as const,
    },
    {
      id: 'show-compare',
      label: 'Compare Jobs',
      icon: <GitCompare className="w-4 h-4 text-amber-400" />,
      shortcut: '',
      onSelect: () => setShowCompare(true),
      category: 'action' as const,
    },
    {
      id: 'export-data',
      label: 'Export All Data',
      icon: <FileJson className="w-4 h-4 text-[var(--app-text-muted)]" />,
      shortcut: '',
      onSelect: () => exportAllData(),
      category: 'action' as const,
    },
  ], [])

  // ── Quick Action Handlers ──────────────────────────────────────────────

  const handleQuickEditPriority = useCallback((job: Job) => {
    const newPriority = Math.min(10, job.priority + 1)
    updatePriority(job.id, newPriority).then(() => {
      addNotification('parameter_updated', 'Priority updated', `Job ${job.id.slice(0, 8)} → P${newPriority}`)
      loadJobs()
    })
  }, [addNotification, loadJobs])

  const handleQuickViewLog = useCallback((job: Job) => {
    setSelectedJob(job)
    setActiveTab('LOG')
  }, [])

  const handleQuickView3D = useCallback(() => {
    // 3D viewer is already visible, just give feedback
    toast({ title: '3D viewer active', duration: 1000 })
  }, [toast])

  const handleQuickShare = useCallback((job: Job) => {
    const url = `${window.location.origin}?job=${job.id}`
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: 'Link copied to clipboard', description: `Share link for job ${job.id.slice(0, 8)}`, duration: 2000 })
    }).catch(() => {
      toast({ title: 'Failed to copy link', variant: 'destructive', duration: 2000 })
    })
  }, [toast])

  // ── Computed Values ───────────────────────────────────────────────────────

  // Sorted jobs for rendering (stable reference, no in-place sort mutation)
  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => b.priority - a.priority || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [jobs])

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
      version: '0.9',
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


  // ── AI Enhancement for Job Request ──────────────────────────────────────
  const handleAiEnhance = useCallback(() => {
    if (!newJobText.trim() || isAiEnhancing) return
    setIsAiEnhancing(true)
    let enhanced = ''
    const abort = sendChatMessageStream(
      [{ role: 'user', content: `Enhance this CAD request to be more specific and detailed for manufacturing. Add dimensions, tolerances, and material specifications where appropriate. Only return the enhanced request, nothing else:\n\n${newJobText}` }],
      undefined,
      (token) => { enhanced += token; setNewJobText(enhanced) },
      () => { setIsAiEnhancing(false) },
      () => { setIsAiEnhancing(false); toast({ title: 'AI enhancement failed', variant: 'destructive', duration: 2000 }) }
    )
    // Auto-abort after 15s
    setTimeout(() => { if (isAiEnhancing) abort() }, 15000)
  }, [newJobText, isAiEnhancing, toast])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-[var(--app-bg)] text-[var(--app-text-primary)] overflow-hidden">
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
            state={selectedJob?.state || 'NEW'} 
            job={selectedJob || undefined}
            onStepClick={(stepKey, tabName) => {
              if (selectedJob) setActiveTab(tabName)
            }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-[9px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]" onClick={() => setShowStats(true)} aria-label="Stats Dashboard">
                  <BarChart3 className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Stats Dashboard</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-[9px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]" onClick={() => setShowCompare(true)} aria-label="Compare Jobs">
                  <GitCompare className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Compare Jobs</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <NotificationCenter
            notifications={notifications}
            onMarkRead={markNotificationRead}
            onMarkAllRead={markAllNotificationsRead}
            onClearAll={clearAllNotifications}
          />
          {/* Activity Feed - Bell with popover */}
          <div className="relative" ref={activityFeedRef}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[9px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] relative"
              onClick={() => setShowActivityFeed(!showActivityFeed)}
              aria-label="Activity Feed"
            >
              <Activity className="w-3 h-3" />
              {activityEvents.length > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-0.5 -right-0.5 min-w-[12px] h-[12px] rounded-full bg-amber-500 text-white text-[6px] font-bold flex items-center justify-center px-0.5"
                >
                  {activityEvents.length > 9 ? '9+' : activityEvents.length}
                </motion.span>
              )}
            </Button>
            <AnimatePresence>
              {showActivityFeed && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 top-8 w-80 linear-surface linear-border rounded-lg linear-shadow-md z-50 max-h-[420px]"
                >
                  <JobActivityFeed
                    events={activityEvents}
                    onClear={clearActivityEvents}
                    onEventClick={(event) => {
                      const found = allJobs.find(j => j.id.slice(0, 8) === event.jobId)
                      if (found) {
                        setSelectedJob(found)
                        setActiveTab('PARAMS')
                      }
                      setShowActivityFeed(false)
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
                  const next = (mounted && resolvedTheme === 'dark') ? 'light' : 'dark'
                  setTheme(next)
                }} aria-label="Toggle theme">
                  {!mounted ? <div className="w-3 h-3" aria-hidden="true" /> : resolvedTheme === 'dark' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Toggle {!mounted ? 'Theme' : resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-[9px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]" onClick={() => setShowSettings(true)} aria-label="Theme & Settings">
                  <Palette className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Theme & Settings</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-[9px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]" onClick={() => setShowShortcuts(true)} aria-label="Keyboard Shortcuts">
                  <Keyboard className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Shortcuts (?)</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button size="sm" className="h-8 text-[10px] gap-1 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] linear-transition px-3" onClick={() => setShowComposer(true)}>
            <Plus className="w-3 h-3" />New Job
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left: Jobs List */}
          <ResizablePanel defaultSize={22} minSize={16} maxSize={35}>
            <div className="flex flex-col h-full bg-[var(--app-surface)]">
              {/* Search & Filter Panel */}
              <SearchFilterPanel
                filters={filterState}
                onFiltersChange={handleFilterChange}
                allJobs={allJobs}
                stateCounts={stateCounts}
              />

              {/* Batch Action Bar */}
              <AnimatePresence>
                {selectedIds.size > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-b border-[color:var(--app-border)] bg-[var(--app-batch-bar-bg)]"
                  >
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-[9px] font-mono text-[var(--app-batch-bar-text)]">{selectedIds.size} selected</span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-[9px] px-2 gap-1 text-amber-400 hover:text-amber-300" onClick={() => handleBatchAction('reprocess')}>
                          <RotateCcw className="w-3 h-3" />Reprocess
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-[9px] px-2 gap-1 text-orange-400 hover:text-orange-300" onClick={() => handleBatchAction('cancel')}>
                          <Ban className="w-3 h-3" />Cancel
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-[9px] px-2 gap-1 text-rose-400 hover:text-rose-300" onClick={() => handleBatchAction('delete')}>
                          <Trash2 className="w-3 h-3" />Delete
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-[9px] px-2 text-[var(--app-text-muted)]" onClick={() => setSelectedIds(new Set())} aria-label="Clear selection">
                          <X className="w-3 h-3" />
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
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <SortableContext
                    items={sortedJobs.map(j => j.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="p-2 space-y-1">
                      {sortedJobs.map(job => (
                        <JobContextMenu
                          key={job.id}
                          job={job}
                          onProcess={handleProcess}
                          onDuplicate={handleDuplicate}
                          onCancel={(j) => setCancelTarget(j)}
                          onDelete={handleDelete}
                          onSetPriority={handleSetPriority}
                          onLinkParent={handleLinkParent}
                        >
                          <SortableJobCard
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
                        </JobContextMenu>
                      ))}
                      {jobs.length === 0 && (
                        <div className="relative flex flex-col items-center justify-center py-12 text-[var(--app-text-muted)] gap-3">
                          <div className="w-14 h-14 rounded-2xl bg-[var(--app-empty-bg)] flex items-center justify-center empty-float">
                            <Layers className="w-7 h-7 opacity-20" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm text-[var(--app-text-muted)]">No jobs found</p>
                            <p className="text-[10px] text-[var(--app-text-dim)] mt-1">Create a new job or adjust filters</p>
                          </div>

                        </div>
                      )}
                    </div>
                  </SortableContext>
                </div>
                <DragOverlay>
                  {activeDragId ? (
                    <DragOverlayCard job={sortedJobs.find(j => j.id === activeDragId)!} />
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Center: 3D Viewer / Job Status */}
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

                    {/* Row 2: Input Request - larger, readable */}
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
                    onProcess={handleProcess}
                    onCancel={(j) => setCancelTarget(j)}
                    onDelete={handleDelete}
                    onReprocess={handleProcess}
                    onDownloadScad={downloadScad}
                    onView3D={handleQuickView3D}
                    onEditPriority={handleQuickEditPriority}
                    onViewLog={handleQuickViewLog}
                    onShare={handleQuickShare}
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
                          onViewLogs={() => setActiveTab('LOG')}
                          onCancel={(j) => setCancelTarget(j)}
                          isCancelable={isCancelable}
                        />
                      )
                    }

                    if (isFailed) {
                      return (
                        <JobStatusPage
                          job={selectedJob}
                          onViewLogs={() => setActiveTab('LOG')}
                          onCancel={(j) => setCancelTarget(j)}
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
                          onClick={() => handleProcess(selectedJob)}
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

                  <Button size="sm" className="h-7 text-[10px] gap-1 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] mt-2" onClick={() => setShowComposer(true)}>
                    <Plus className="w-3 h-3" />Create First Job
                  </Button>
                </div>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: Inspector Panel */}
          <ResizablePanel defaultSize={38} minSize={25} maxSize={50}>
            <div className="flex flex-col h-full bg-[var(--app-surface)]">
              {selectedJob ? (
                <Tabs value={activeTab} onValueChange={(v) => {
                  const tabOrder = ['PARAMS', 'RESEARCH', 'VALIDATE', 'SCAD', 'LOG', 'NOTES', 'DEPS', 'HISTORY', 'AI']
                  const newIdx = tabOrder.indexOf(v)
                  const oldIdx = tabOrder.indexOf(activeTab)
                  setTabDirection(newIdx > oldIdx ? 1 : -1)
                  setPrevTab(activeTab)
                  setActiveTab(v)
                }} className="flex flex-col h-full">
                  {/* Inspector Breadcrumb */}
                  <div className="px-3 py-1 shrink-0 breadcrumb-fade-in">
                    <BreadcrumbNav
                      jobId={selectedJob.id}
                      activeTab={activeTab}
                      onNavigateHome={() => setSelectedJob(null)}
                      onNavigateJobs={() => setSelectedJob(null)}
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
                          <ParameterPanel job={selectedJob} onUpdate={loadJobs} />
                        </TabsContent>
                        <TabsContent value="RESEARCH" className="h-full m-0 data-[state=inactive]:hidden">
                          <ResearchPanel job={selectedJob} />
                        </TabsContent>
                        <TabsContent value="VALIDATE" className="h-full m-0 data-[state=inactive]:hidden">
                          <ValidationPanel job={selectedJob} />
                        </TabsContent>
                        <TabsContent value="SCAD" className="h-full m-0 data-[state=inactive]:hidden">
                          <ScadEditor job={selectedJob} onUpdate={loadJobs} onApply={handleApplyScad} />
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
                        <TabsContent value="HISTORY" className="h-full m-0 data-[state=inactive]:hidden">
                          <JobVersionHistory key={selectedJob.id} job={selectedJob} />
                        </TabsContent>
                        <TabsContent value="AI" className="h-full m-0 data-[state=inactive]:hidden">
                          <ChatPanel key={selectedJob.id} job={selectedJob} onApplyScad={handleApplyScad} />
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
                  <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 mt-2 border-[color:var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] hover:border-[color:var(--app-border-strong)]" onClick={() => setShowComposer(true)}>
                    <Plus className="w-3 h-3" />Create a Job to Begin
                  </Button>
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      {/* Footer */}
      <Footer
        wsConnected={wsConnected}
        jobCount={allJobs.length}
        jobCountFlash={jobCountFlash}
        deliveredCount={stateCounts['DELIVERED'] || 0}
        failedCount={(stateCounts['VALIDATION_FAILED'] || 0) + (stateCounts['GEOMETRY_FAILED'] || 0) + (stateCounts['RENDER_FAILED'] || 0)}
        dependencyCount={linkedJobCount}
        uptime={uptime}
        successRate={successRate}
        onExport={exportAllData}
        formatUptime={formatUptime}
      />

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}

      {/* Job Composer */}
      <Dialog open={showComposer} onOpenChange={setShowComposer}>
        <DialogContent className="bg-[var(--app-dialog-bg)] border-[color:var(--app-border)] max-w-lg dialog-enter">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Plus className="w-4 h-4 text-[var(--app-accent-text)]" />New CAD Job
            </DialogTitle>
          </DialogHeader>
          <Separator />
          <div className="space-y-4">
            {/* Recent Requests */}
            {recentRequests.length > 0 && (
              <div>
                <label className="text-[10px] font-mono tracking-widest text-[var(--app-text-secondary)] uppercase mb-1.5 block">Recent Requests</label>
                <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  {recentRequests.map((req, i) => (
                    <button
                      key={i}
                      className="recent-request-item text-left text-[10px] text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] px-2.5 py-1.5 rounded border border-[color:var(--app-border)] hover:border-[color:var(--app-accent-border)] hover:bg-[var(--app-surface-raised)] truncate transition-colors"
                      onClick={() => setNewJobText(req)}
                    >
                      {req.slice(0, 80)}{req.length > 80 ? '…' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <JobTemplateCards onSelect={(template) => setNewJobText(template)} />
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-[10px] font-mono tracking-widest text-[var(--app-text-secondary)] uppercase">Request</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-5 text-[8px] gap-1 ${isAiEnhancing ? 'ai-enhance-glow text-[var(--app-accent-text)]' : 'text-[var(--app-accent-text)] hover:text-[var(--app-accent-text)]'}`}
                  onClick={handleAiEnhance}
                  disabled={!newJobText.trim() || isAiEnhancing}
                >
                  <Wand2 className="w-2.5 h-2.5" />
                  {isAiEnhancing ? 'Enhancing...' : 'Enhance with AI'}
                </Button>
              </div>
              <Textarea
                data-composer-textarea
                value={newJobText}
                onChange={e => setNewJobText(e.target.value)}
                placeholder="e.g. A 40mm×30mm×15mm electronics enclosure with 2mm walls"
                className="min-h-[100px] bg-[var(--app-bg)] border-[color:var(--app-border)] text-sm placeholder:text-[var(--app-text-dim)] focus:border-[color:var(--app-accent-border)]"
                maxLength={5000}
              />
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-[var(--app-text-muted)]">{newJobText.length}/5000</span>
                <span className="text-[10px] text-[var(--app-text-muted)]">⌘+Enter</span>
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
              <label className="text-[10px] font-mono tracking-widest text-[var(--app-text-secondary)] uppercase mb-2 block">Priority</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={newJobPriority}
                  onChange={e => setNewJobPriority(Number(e.target.value))}
                  className="flex-1 accent-[var(--app-accent)]"
                />
                <span className={`text-xs font-mono px-2 py-0.5 rounded border min-w-[36px] text-center ${getPriorityColor(newJobPriority)}`}>
                  P{newJobPriority}
                </span>
              </div>
              <div className="flex justify-between text-[9px] text-[var(--app-text-muted)] mt-1">
                <span>Low</span>
                <span>Critical</span>
              </div>
            </div>
            {/* Tags Input */}
            <div>
              <label className="text-[10px] font-mono tracking-widest text-[var(--app-text-secondary)] uppercase mb-2 flex items-center gap-1.5">
                <Tag className="w-2.5 h-2.5" />Tags
              </label>
              <Input
                value={newJobTags}
                onChange={e => setNewJobTags(e.target.value)}
                placeholder="enclosure, prototype, urgent"
                className="h-7 text-[11px] bg-[var(--app-bg)] border-[color:var(--app-border)] placeholder:text-[var(--app-text-dim)] focus:border-[color:var(--app-accent-border)]"
              />
              {newJobTags.trim() && (
                <div className="mt-1.5">
                  <TagBadges customerId={buildCustomerId(newJobTags.split(',').map(t => t.trim()).filter(t => t))} maxDisplay={6} />
                </div>
              )}
            </div>
            <Button
              className="w-full bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-white font-medium btn-press"
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
        <AlertDialogContent className="bg-[var(--app-surface-95)] border-[color:var(--app-border)] dialog-enter">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Cancel Job?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-[var(--app-text-muted)]">
              This will cancel job &quot;{cancelTarget?.inputRequest?.slice(0, 60)}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[var(--app-surface-raised)] border-[color:var(--app-border)] text-[var(--app-text-muted)] text-xs">Keep Running</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-600 hover:bg-orange-500 text-xs" onClick={() => cancelTarget && handleCancel(cancelTarget)}>
              Cancel Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Keyboard Shortcuts */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
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
                  { keys: ['1', '-', '7'], desc: 'Switch inspector tab' },
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
                  { key: '1', tab: 'PARAMS' },
                  { key: '2', tab: 'RESEARCH' },
                  { key: '3', tab: 'VALIDATE' },
                  { key: '4', tab: 'SCAD' },
                  { key: '5', tab: 'LOG' },
                  { key: '6', tab: 'NOTES' },
                  { key: '7', tab: 'DEPS' },
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
      <Dialog open={showStats} onOpenChange={setShowStats}>
        <DialogContent className="bg-[var(--app-surface-95)] border-[color:var(--app-border)] max-w-2xl dialog-enter">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--app-accent-text)]" />Stats Dashboard
            </DialogTitle>
          </DialogHeader>
          <StatsDashboard jobs={allJobs} />
        </DialogContent>
      </Dialog>

      {/* Job Compare */}
      <Dialog open={showCompare} onOpenChange={setShowCompare}>
        <DialogContent className="bg-[var(--app-surface-95)] border-[color:var(--app-border)] max-w-4xl max-h-[80vh] dialog-enter">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-[var(--app-accent-text)]" />Compare Jobs
            </DialogTitle>
          </DialogHeader>
          <JobCompare jobs={allJobs} />
        </DialogContent>
      </Dialog>

      {/* Theme & Settings */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
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
        open={showCommandPalette}
        onOpenChange={setShowCommandPalette}
        jobs={allJobs}
        onSelectJob={(job) => { setSelectedJob(job); setActiveTab('PARAMS') }}
        actions={commandPaletteActions}
      />
    </div>
  )
}
