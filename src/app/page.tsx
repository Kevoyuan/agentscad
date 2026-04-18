'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Box, Play, Trash2, Settings, ChevronRight, Clock, CheckCircle2,
  XCircle, AlertTriangle, Loader2, Download, Code2, Shield, Cpu,
  Activity, Layers, RefreshCw, Eye, Search, Plus, ArrowUpDown,
  Wrench, Zap, FileCode, Image, RotateCcw, Send, X, Lightbulb,
  Beaker, Target, Globe, Info
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParameterDef {
  key: string
  label: string
  kind: string
  unit: string
  value: number
  min: number
  max: number
  step: number
  source: string
  editable: boolean
  description: string
  group: string
}

interface ParameterSchema {
  part_family: string
  design_summary: string
  parameters: ParameterDef[]
}

interface ValidationResult {
  rule_id: string
  rule_name: string
  level: string
  passed: boolean
  is_critical: boolean
  message: string
}

interface ExecutionLog {
  timestamp: string
  event: string
  message: string
}

interface Job {
  id: string
  state: string
  inputRequest: string
  customerId: string | null
  priority: number
  partFamily: string | null
  builderName: string | null
  generationPath: string | null
  scadSource: string | null
  parameterSchema: string | null
  parameterValues: string | null
  researchResult: string | null
  intentResult: string | null
  designResult: string | null
  stlPath: string | null
  pngPath: string | null
  renderLog: string | null
  validationResults: string | null
  executionLogs: string | null
  retryCount: number
  maxRetries: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  NEW: { bg: 'bg-slate-500/20', text: 'text-slate-300', dot: 'bg-slate-400' },
  SCAD_GENERATED: { bg: 'bg-amber-500/20', text: 'text-amber-300', dot: 'bg-amber-400' },
  RENDERED: { bg: 'bg-cyan-500/20', text: 'text-cyan-300', dot: 'bg-cyan-400' },
  VALIDATED: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  DELIVERED: { bg: 'bg-lime-500/20', text: 'text-lime-300', dot: 'bg-lime-400' },
  DEBUGGING: { bg: 'bg-orange-500/20', text: 'text-orange-300', dot: 'bg-orange-400' },
  REPAIRING: { bg: 'bg-orange-500/20', text: 'text-orange-300', dot: 'bg-orange-400' },
  VALIDATION_FAILED: { bg: 'bg-rose-500/20', text: 'text-rose-300', dot: 'bg-rose-400' },
  GEOMETRY_FAILED: { bg: 'bg-red-500/20', text: 'text-red-300', dot: 'bg-red-400' },
  RENDER_FAILED: { bg: 'bg-red-500/20', text: 'text-red-300', dot: 'bg-red-400' },
  HUMAN_REVIEW: { bg: 'bg-yellow-500/20', text: 'text-yellow-300', dot: 'bg-yellow-400' },
  CANCELLED: { bg: 'bg-zinc-500/20', text: 'text-zinc-400', dot: 'bg-zinc-500' },
}

const PIPELINE_STEPS = [
  { key: 'NEW', label: 'INTAKE', icon: InboxIcon },
  { key: 'SCAD_GENERATED', label: 'GENERATE', icon: Code2 },
  { key: 'RENDERED', label: 'RENDER', icon: Box },
  { key: 'VALIDATED', label: 'VALIDATE', icon: Shield },
  { key: 'DELIVERED', label: 'DELIVER', icon: CheckCircle2 },
]

function InboxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function timeAgo(iso: string) {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function getStateInfo(state: string) {
  return STATE_COLORS[state] || { bg: 'bg-zinc-500/20', text: 'text-zinc-300', dot: 'bg-zinc-400' }
}

function parseJSON<T>(str: string | null, fallback: T): T {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

function getPipelineProgress(state: string): number {
  const idx = PIPELINE_STEPS.findIndex(s => s.key === state)
  if (idx === -1) return 0
  return Math.round(((idx + 1) / PIPELINE_STEPS.length) * 100)
}

// ─── API Functions ────────────────────────────────────────────────────────────

async function fetchJobs(state?: string): Promise<{ jobs: Job[]; pagination: { total: number } }> {
  const url = state ? `/api/jobs?state=${state}&limit=50` : '/api/jobs?limit=50'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch jobs')
  return res.json()
}

async function createJob(inputRequest: string, customerId?: string, priority?: number): Promise<{ job: Job }> {
  const res = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputRequest, customerId, priority }),
  })
  if (!res.ok) throw new Error('Failed to create job')
  return res.json()
}

async function deleteJob(id: string): Promise<void> {
  const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete job')
}

async function processJob(id: string, onEvent: (data: Record<string, unknown>) => void): Promise<void> {
  const res = await fetch(`/api/jobs/${id}/process`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to start processing')
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          onEvent(data)
        } catch { /* skip malformed */ }
      }
    }
  }
}

async function updateParameters(id: string, parameterValues: Record<string, unknown>): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}/parameters`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parameterValues }),
  })
  if (!res.ok) throw new Error('Failed to update parameters')
  const data = await res.json()
  return data.job
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function StateBadge({ state, size = 'sm' }: { state: string; size?: 'sm' | 'md' }) {
  const info = getStateInfo(state)
  const label = state.replace(/_/g, ' ')
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md font-mono ${size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} ${info.bg} ${info.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${info.dot} ${state === 'DELIVERED' ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  )
}

function PipelineVisualization({ state }: { state: string }) {
  const currentIdx = PIPELINE_STEPS.findIndex(s => s.key === state)
  const failedStates = ['GEOMETRY_FAILED', 'RENDER_FAILED', 'VALIDATION_FAILED']
  const isFailed = failedStates.includes(state)

  return (
    <div className="flex items-center gap-0.5 px-2 py-3">
      {PIPELINE_STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx
        const isCurrent = idx === currentIdx
        const isPending = idx > currentIdx
        const Icon = step.icon

        return (
          <div key={step.key} className="flex items-center">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-md transition-all duration-300 ${
                    isCompleted ? 'text-lime-400' :
                    isCurrent && !isFailed ? 'text-amber-300 bg-amber-500/10' :
                    isCurrent && isFailed ? 'text-rose-400 bg-rose-500/10' :
                    'text-zinc-600'
                  }`}>
                    <Icon className={`w-4 h-4 ${isCurrent && !isFailed ? 'animate-pulse' : ''}`} />
                    <span className="text-[9px] font-mono tracking-wider">{step.label}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{step.label}: {step.key.replace(/_/g, ' ')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {idx < PIPELINE_STEPS.length - 1 && (
              <ChevronRight className={`w-3 h-3 mx-0.5 ${idx < currentIdx ? 'text-lime-500/60' : 'text-zinc-700'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ParameterPanel({ job, onUpdate }: { job: Job; onUpdate: () => void }) {
  const schema = parseJSON<ParameterSchema | null>(job.parameterSchema, null)
  const values = parseJSON<Record<string, number>>(job.parameterValues, {})
  const [localValues, setLocalValues] = useState(values)
  const [isUpdating, setIsUpdating] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setLocalValues(values)
  }, [job.parameterValues])

  if (!schema) return <div className="p-4 text-zinc-500 text-sm">No parameters available</div>

  const groups = [...new Set(schema.parameters.map(p => p.group))]

  const handleParamChange = (key: string, value: number) => {
    const newValues = { ...localValues, [key]: value }
    setLocalValues(newValues)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setIsUpdating(true)
      try {
        await updateParameters(job.id, newValues)
        onUpdate()
      } catch (err) {
        console.error('Parameter update failed:', err)
      } finally {
        setIsUpdating(false)
      }
    }, 600)
  }

  const sourceColor: Record<string, string> = {
    user: 'text-sky-400',
    inferred: 'text-amber-400',
    design_derived: 'text-violet-400',
    llm_declared: 'text-emerald-400',
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <h3 className="text-xs font-mono tracking-wider text-zinc-400 uppercase">Parameters</h3>
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {groups.map(group => (
            <div key={group}>
              <div className="text-[10px] font-mono tracking-widest text-zinc-600 uppercase mb-2 px-1">{group}</div>
              <div className="space-y-3">
                {schema.parameters.filter(p => p.group === group).map(param => (
                  <div key={param.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-zinc-300">{param.label}</span>
                        <span className={`text-[9px] font-mono ${sourceColor[param.source] || 'text-zinc-500'}`}>
                          [{param.source.replace('_', ' ')}]
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono text-zinc-200">
                          {typeof localValues[param.key] === 'number' ? localValues[param.key].toFixed(param.step < 1 ? 1 : 0) : param.value}
                        </span>
                        <span className="text-[10px] text-zinc-500">{param.unit}</span>
                      </div>
                    </div>
                    {param.kind === 'number' && (
                      <Slider
                        value={[localValues[param.key] ?? param.value]}
                        min={param.min ?? 0}
                        max={param.max ?? 100}
                        step={param.step ?? 1}
                        onValueChange={([v]) => handleParamChange(param.key, v)}
                        disabled={!param.editable}
                        className="py-1"
                      />
                    )}
                    <div className="flex justify-between text-[9px] text-zinc-600 font-mono">
                      <span>{param.min}</span>
                      <span>{param.max} {param.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function ValidationPanel({ job }: { job: Job }) {
  const results = parseJSON<ValidationResult[]>(job.validationResults, [])
  if (results.length === 0) return <div className="p-4 text-zinc-500 text-sm">No validation results</div>

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <h3 className="text-xs font-mono tracking-wider text-zinc-400 uppercase">Validation</h3>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-[10px] h-5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">{passed} PASS</Badge>
          {failed > 0 && <Badge variant="outline" className="text-[10px] h-5 bg-rose-500/10 text-rose-400 border-rose-500/20">{failed} FAIL</Badge>}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {results.map((r, i) => (
            <div key={i} className={`flex items-start gap-2 p-2 rounded-md ${r.passed ? 'bg-zinc-900/50' : 'bg-rose-500/5 border border-rose-500/10'}`}>
              {r.passed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-zinc-500">{r.rule_id}</span>
                  <span className="text-xs text-zinc-300">{r.rule_name}</span>
                  {r.is_critical && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">{r.message}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function ScadViewer({ code }: { code: string | null }) {
  if (!code) return <div className="flex items-center justify-center h-full text-zinc-600 text-sm">No SCAD source</div>

  return (
    <ScrollArea className="h-full">
      <pre className="p-4 text-xs font-mono leading-relaxed text-emerald-300/80 whitespace-pre overflow-x-auto">
        <code>{code}</code>
      </pre>
    </ScrollArea>
  )
}

function ThreeDViewer({ job }: { job: Job }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(false)

  const values = parseJSON<Record<string, number>>(job.parameterValues, {})
  const width = values.width ?? 40
  const depth = values.depth ?? 30
  const height = values.height ?? 15
  const wall = values.wall_thickness ?? 2

  useEffect(() => {
    if (!mountRef.current || job.state === 'NEW' || job.state === 'SCAD_GENERATED') return

    let cancelled = false
    setIsLoading(true)

    import('three').then(async (THREE) => {
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')

      if (cancelled || !mountRef.current) return

      const container = mountRef.current
      const w = container.clientWidth
      const h = container.clientHeight

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x0a0a12)

      const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000)
      camera.position.set(60, 50, 60)

      const renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(w, h)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      container.innerHTML = ''
      container.appendChild(renderer.domElement)

      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.05

      // Grid
      const gridHelper = new THREE.GridHelper(100, 20, 0x222244, 0x111133)
      scene.add(gridHelper)

      // Outer box
      const outerGeo = new THREE.BoxGeometry(width, height, depth)
      const outerMat = new THREE.MeshPhongMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      })
      const outerMesh = new THREE.Mesh(outerGeo, outerMat)
      outerMesh.position.y = height / 2
      scene.add(outerMesh)

      // Outer edges
      const outerEdges = new THREE.EdgesGeometry(outerGeo)
      const outerLine = new THREE.LineSegments(outerEdges, new THREE.LineBasicMaterial({ color: 0x818cf8 }))
      outerLine.position.y = height / 2
      scene.add(outerLine)

      // Inner cavity
      const innerW = Math.max(0.1, width - 2 * wall)
      const innerD = Math.max(0.1, depth - 2 * wall)
      const innerH = Math.max(0.1, height - 2 * wall)
      const innerGeo = new THREE.BoxGeometry(innerW, innerH, innerD)
      const innerMat = new THREE.MeshPhongMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
      })
      const innerMesh = new THREE.Mesh(innerGeo, innerMat)
      innerMesh.position.y = height / 2
      scene.add(innerMesh)

      // Inner edges
      const innerEdges = new THREE.EdgesGeometry(innerGeo)
      const innerLine = new THREE.LineSegments(innerEdges, new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.5 }))
      innerLine.position.y = height / 2
      scene.add(innerLine)

      // Lights
      const ambient = new THREE.AmbientLight(0x404040, 2)
      scene.add(ambient)
      const dirLight = new THREE.DirectionalLight(0xffffff, 1)
      dirLight.position.set(50, 80, 50)
      scene.add(dirLight)
      const pointLight = new THREE.PointLight(0x6366f1, 0.5, 200)
      pointLight.position.set(-30, 40, -30)
      scene.add(pointLight)

      setIsLoading(false)

      function animate() {
        if (cancelled) return
        requestAnimationFrame(animate)
        controls.update()
        renderer.render(scene, camera)
      }
      animate()

      const handleResize = () => {
        if (!container) return
        const nw = container.clientWidth
        const nh = container.clientHeight
        camera.aspect = nw / nh
        camera.updateProjectionMatrix()
        renderer.setSize(nw, nh)
      }
      window.addEventListener('resize', handleResize)

      return () => {
        cancelled = true
        window.removeEventListener('resize', handleResize)
        renderer.dispose()
        controls.dispose()
      }
    })

    return () => { cancelled = true }
  }, [job.state, job.parameterValues, width, depth, height, wall])

  if (job.state === 'NEW' || job.state === 'SCAD_GENERATED') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2">
        <Box className="w-8 h-8 opacity-30" />
        <span className="text-xs">Process job to generate 3D preview</span>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        </div>
      )}
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-2 text-[9px] font-mono text-zinc-600">
        {width}×{depth}×{height}mm · wall {wall}mm
      </div>
    </div>
  )
}

function TimelinePanel({ job }: { job: Job }) {
  const logs = parseJSON<ExecutionLog[]>(job.executionLogs, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <h3 className="text-xs font-mono tracking-wider text-zinc-400 uppercase">Timeline</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/50 transition-colors">
              <span className="text-[9px] font-mono text-zinc-600 mt-0.5 whitespace-nowrap">{formatTime(log.timestamp)}</span>
              <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${
                log.event.includes('FAILED') ? 'bg-rose-500/10 text-rose-400' :
                log.event === 'DELIVERED' ? 'bg-lime-500/10 text-lime-400' :
                'bg-zinc-800 text-zinc-400'
              }`}>{log.event}</span>
              <span className="text-[11px] text-zinc-400 flex-1">{log.message}</span>
            </div>
          ))}
          {logs.length === 0 && <div className="p-4 text-zinc-600 text-xs text-center">No events yet</div>}
        </div>
      </ScrollArea>
    </div>
  )
}

function ResearchPanel({ job }: { job: Job }) {
  const research = parseJSON<Record<string, unknown> | null>(job.researchResult, null)
  const intent = parseJSON<Record<string, unknown> | null>(job.intentResult, null)
  const design = parseJSON<Record<string, unknown> | null>(job.designResult, null)

  const hasData = research || intent || design

  if (!hasData) return (
    <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2">
      <Beaker className="w-6 h-6 opacity-30" />
      <span className="text-xs">No research data yet</span>
      <span className="text-[10px] text-zinc-700">Process a job to generate research</span>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <h3 className="text-xs font-mono tracking-wider text-zinc-400 uppercase">Research & Intent</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Part Family & Builder */}
          <div className="flex items-center gap-2 flex-wrap">
            {job.partFamily && (
              <Badge variant="outline" className="text-[10px] h-5 bg-violet-500/10 text-violet-400 border-violet-500/20 gap-1">
                <Target className="w-3 h-3" />{job.partFamily.replace(/_/g, ' ')}
              </Badge>
            )}
            {job.builderName && (
              <Badge variant="outline" className="text-[10px] h-5 bg-cyan-500/10 text-cyan-400 border-cyan-500/20 gap-1">
                <Cpu className="w-3 h-3" />{job.builderName}
              </Badge>
            )}
            {job.generationPath && (
              <Badge variant="outline" className="text-[10px] h-5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1">
                <Layers className="w-3 h-3" />{job.generationPath.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>

          {/* Research Result */}
          {research && (
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/30 border-b border-zinc-800/50">
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[10px] font-mono tracking-wider text-sky-400 uppercase">Research</span>
              </div>
              <div className="p-3 space-y-2">
                {Object.entries(research).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2">
                    <span className="text-[10px] font-mono text-zinc-600 min-w-[100px] shrink-0">{key}</span>
                    <span className="text-[11px] text-zinc-400 flex-1">
                      {Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value, null, 1) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Intent Result */}
          {intent && (
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/30 border-b border-zinc-800/50">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-mono tracking-wider text-amber-400 uppercase">Intent</span>
              </div>
              <div className="p-3 space-y-2">
                {Object.entries(intent).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2">
                    <span className="text-[10px] font-mono text-zinc-600 min-w-[100px] shrink-0">{key}</span>
                    <span className="text-[11px] text-zinc-400 flex-1">
                      {Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value, null, 1) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Design Result */}
          {design && (
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/30 border-b border-zinc-800/50">
                <Beaker className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[10px] font-mono tracking-wider text-violet-400 uppercase">Design</span>
              </div>
              <div className="p-3 space-y-2">
                {Object.entries(design).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2">
                    <span className="text-[10px] font-mono text-zinc-600 min-w-[100px] shrink-0">{key}</span>
                    <span className="text-[11px] text-zinc-400 flex-1">
                      {Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value, null, 1) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parameter Schema Summary */}
          {job.parameterSchema && (
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/30 border-b border-zinc-800/50">
                <Info className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-mono tracking-wider text-emerald-400 uppercase">Schema Info</span>
              </div>
              <div className="p-3">
                <SchemaInfoPanel schemaStr={job.parameterSchema} />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function SchemaInfoPanel({ schemaStr }: { schemaStr: string }) {
  const schema = parseJSON<ParameterSchema | null>(schemaStr, null)
  if (!schema) return <span className="text-zinc-600 text-xs">Invalid schema</span>

  const sourceCounts: Record<string, number> = {}
  for (const p of schema.parameters) {
    sourceCounts[p.source] = (sourceCounts[p.source] || 0) + 1
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[9px] h-4 bg-zinc-800 text-zinc-400 border-zinc-700">
          {schema.part_family || 'unknown'}
        </Badge>
        <Badge variant="outline" className="text-[9px] h-4 bg-zinc-800 text-zinc-400 border-zinc-700">
          {schema.parameters.length} params
        </Badge>
        {Object.entries(sourceCounts).map(([source, count]) => (
          <Badge key={source} variant="outline" className={`text-[9px] h-4 ${
            source === 'user' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' :
            source === 'inferred' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
            source === 'design_derived' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' :
            'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          }`}>
            {count} {source.replace('_', ' ')}
          </Badge>
        ))}
      </div>
      {schema.design_summary && (
        <p className="text-[11px] text-zinc-500 leading-relaxed">{schema.design_summary}</p>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [allJobs, setAllJobs] = useState<Job[]>([])  // unfiltered for stats
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [filterState, setFilterState] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [newRequest, setNewRequest] = useState('')
  const [showComposer, setShowComposer] = useState(false)
  const [rightTab, setRightTab] = useState('parameters')
  const [processingState, setProcessingState] = useState<string | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  const loadJobs = useCallback(async () => {
    try {
      // Always load all jobs for stats
      const allData = await fetchJobs()
      setAllJobs(allData.jobs)

      // Load filtered jobs for display
      const data = await fetchJobs(filterState || undefined)
      setJobs(data.jobs)
      if (selectedJob) {
        const updated = allData.jobs.find(j => j.id === selectedJob.id)
        if (updated) setSelectedJob(updated)
      }
    } catch (err) {
      console.error('Failed to load jobs:', err)
    } finally {
      setIsLoading(false)
    }
  }, [filterState]) // removed selectedJob dependency to avoid infinite loops

  useEffect(() => {
    loadJobs()
  }, [filterState, loadJobs])

  // Auto-poll for updates - stable interval
  useEffect(() => {
    pollRef.current = setInterval(loadJobs, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadJobs])

  const handleCreate = async () => {
    if (!newRequest.trim()) return
    setIsCreating(true)
    try {
      const { job } = await createJob(newRequest.trim())
      setNewRequest('')
      setShowComposer(false)
      await loadJobs()
      setSelectedJob(job)
    } catch (err) {
      console.error('Failed to create job:', err)
    } finally {
      setIsCreating(false)
    }
  }

  const handleProcess = async (job: Job) => {
    setIsProcessing(true)
    setProcessingState('NEW')
    try {
      await processJob(job.id, (data) => {
        if (data.state) setProcessingState(data.state as string)
      })
      await loadJobs()
      const freshJobs = await fetchJobs()
      const updated = freshJobs.jobs.find(j => j.id === job.id)
      if (updated) setSelectedJob(updated)
    } catch (err) {
      console.error('Failed to process job:', err)
    } finally {
      setIsProcessing(false)
      setProcessingState(null)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteJob(id)
      if (selectedJob?.id === id) setSelectedJob(null)
      await loadJobs()
    } catch (err) {
      console.error('Failed to delete job:', err)
    }
  }

  // Stats use allJobs (unfiltered) so they don't change when filtering
  const stats = {
    total: allJobs.length,
    delivered: allJobs.filter(j => j.state === 'DELIVERED').length,
    processing: allJobs.filter(j => !['DELIVERED', 'CANCELLED', 'HUMAN_REVIEW'].includes(j.state)).length,
    failed: allJobs.filter(j => j.state.includes('FAILED')).length,
  }

  // Search-filtered jobs (applied on top of state filter)
  const displayedJobs = searchQuery
    ? jobs.filter(j => j.inputRequest.toLowerCase().includes(searchQuery.toLowerCase()))
    : jobs

  return (
    <div className="flex flex-col h-screen bg-[#0c0a14] text-zinc-100 overflow-hidden">
      {/* ─── Top Bar ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between h-11 px-4 border-b border-zinc-800/80 bg-[#0f0d18]/90 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-tight">AgentSCAD</span>
            <span className="text-[10px] font-mono text-zinc-600 ml-1">v0.1</span>
          </div>
          <Separator orientation="vertical" className="h-5 bg-zinc-800" />
          <PipelineVisualization state={selectedJob?.state || 'NEW'} />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 mr-3 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-zinc-500"><Layers className="w-3 h-3" />{stats.total}</span>
            <span className="flex items-center gap-1 text-lime-500"><CheckCircle2 className="w-3 h-3" />{stats.delivered}</span>
            <span className="flex items-center gap-1 text-amber-500"><Activity className="w-3 h-3" />{stats.processing}</span>
            {stats.failed > 0 && <span className="flex items-center gap-1 text-rose-500"><XCircle className="w-3 h-3" />{stats.failed}</span>}
          </div>
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-500"
            onClick={() => setShowComposer(true)}
          >
            <Plus className="w-3.5 h-3.5" /> New Job
          </Button>
        </div>
      </header>

      {/* ─── Main Content ────────────────────────────────────── */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* ─── Left Panel: Jobs List ─────────────────────────── */}
        <ResizablePanel defaultSize={22} minSize={18} maxSize={35}>
          <div className="flex flex-col h-full bg-[#0e0c16]">
            {/* Search bar */}
            <div className="px-3 py-2 border-b border-zinc-800/50">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search jobs..."
                  className="h-7 text-xs bg-[#0c0a14] border-zinc-800 pl-8 placeholder:text-zinc-700 focus:border-violet-500/50"
                />
              </div>
            </div>
            {/* Filter pills */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800/50 overflow-x-auto">
              {['ALL', 'NEW', 'SCAD_GENERATED', 'RENDERED', 'VALIDATED', 'DELIVERED', 'FAILED'].map(s => (
                <button
                  key={s}
                  onClick={() => setFilterState(s === 'ALL' ? null : s === 'FAILED' ? 'VALIDATION_FAILED' : s)}
                  className={`text-[9px] font-mono tracking-wider px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
                    (filterState === null && s === 'ALL') || filterState === s || (s === 'FAILED' && filterState === 'VALIDATION_FAILED')
                      ? 'bg-violet-500/20 text-violet-300'
                      : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50'
                  }`}
                >
                  {s.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            {/* Jobs list */}
            <ScrollArea className="flex-1">
              <div className="p-1.5 space-y-0.5">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
                  </div>
                ) : displayedJobs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-600 gap-2">
                    <InboxIcon className="w-8 h-8 opacity-30" />
                    <span className="text-xs">No jobs yet</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-zinc-800 text-zinc-400" onClick={() => setShowComposer(true)}>
                      <Plus className="w-3 h-3" /> Create first job
                    </Button>
                  </div>
                ) : (
                  displayedJobs.map(job => (
                    <motion.div
                      key={job.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedJob(job)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedJob(job) }}
                        className={`w-full text-left p-2.5 rounded-lg transition-all duration-150 group cursor-pointer ${
                          selectedJob?.id === job.id
                            ? 'bg-violet-500/10 border border-violet-500/20'
                            : 'hover:bg-zinc-800/40 border border-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-zinc-300 truncate">{job.inputRequest}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <StateBadge state={job.state} />
                              <span className="text-[9px] text-zinc-600 font-mono">{timeAgo(job.createdAt)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {job.state === 'NEW' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleProcess(job) }}
                                className="p-1 rounded hover:bg-emerald-500/20 text-emerald-500"
                              >
                                <Play className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(job.id) }}
                              className="p-1 rounded hover:bg-rose-500/20 text-rose-500"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-zinc-800/50 w-px hover:bg-violet-500/30 transition-colors" />

        {/* ─── Center Panel: Job Detail ──────────────────────── */}
        <ResizablePanel defaultSize={45} minSize={30}>
          <div className="flex flex-col h-full bg-[#0c0a14]">
            {selectedJob ? (
              <>
                {/* Job header */}
                <div className="px-4 py-3 border-b border-zinc-800/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <StateBadge state={selectedJob.state} size="md" />
                      <span className="text-[10px] font-mono text-zinc-600">{selectedJob.id.slice(0, 8)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {['NEW', 'VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED', 'HUMAN_REVIEW'].includes(selectedJob.state) && (
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500"
                          disabled={isProcessing}
                          onClick={() => handleProcess(selectedJob)}
                        >
                          {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          {isProcessing ? 'Processing...' : 'Process'}
                        </Button>
                      )}
                      {selectedJob.state === 'DELIVERED' && (
                        <>
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1.5 bg-amber-600 hover:bg-amber-500"
                            onClick={() => { setSelectedJob({...selectedJob, state: 'NEW'}); handleProcess({...selectedJob, state: 'NEW'}) }}
                          >
                            <RotateCcw className="w-3 h-3" /> Reprocess
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-zinc-700 text-zinc-400" onClick={() => window.open(`/api/jobs/${selectedJob.id}/artifacts/scad`, '_blank')}>
                            <Download className="w-3 h-3" /> SCAD
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-zinc-700 text-zinc-400" onClick={() => window.open(`/api/jobs/${selectedJob.id}/artifacts/stl`, '_blank')}>
                            <Download className="w-3 h-3" /> STL
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-500 hover:text-rose-400" onClick={() => handleDelete(selectedJob.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-300 mt-2">{selectedJob.inputRequest}</p>
                  {/* Job metadata row */}
                  <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-zinc-600">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Created {formatDate(selectedJob.createdAt)} {formatTime(selectedJob.createdAt)}</span>
                    {selectedJob.completedAt && <span className="flex items-center gap-1 text-lime-500"><CheckCircle2 className="w-3 h-3" />Completed {formatTime(selectedJob.completedAt)}</span>}
                    {selectedJob.partFamily && <span className="flex items-center gap-1 text-violet-400"><Target className="w-3 h-3" />{selectedJob.partFamily.replace(/_/g, ' ')}</span>}
                    {selectedJob.renderLog && (() => {
                      const rl = parseJSON<Record<string, unknown> | null>(selectedJob.renderLog, null)
                      return rl?.render_time_ms ? <span className="flex items-center gap-1 text-cyan-400"><Zap className="w-3 h-3" />Render {rl.render_time_ms}ms</span> : null
                    })()}
                    {selectedJob.retryCount > 0 && <span className="flex items-center gap-1 text-amber-400"><RotateCcw className="w-3 h-3" />{selectedJob.retryCount} retries</span>}
                  </div>

                  {/* Processing progress */}
                  {isProcessing && processingState && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mb-1">
                        <span>Pipeline Progress</span>
                        <span>{getPipelineProgress(processingState)}%</span>
                      </div>
                      <Progress value={getPipelineProgress(processingState)} className="h-1 bg-zinc-800" />
                    </div>
                  )}
                </div>

                {/* 3D Viewer */}
                <div className="flex-1 min-h-0 relative">
                  <ThreeDViewer job={selectedJob} />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-600">
                <div className="w-16 h-16 rounded-2xl bg-zinc-800/30 flex items-center justify-center">
                  <Box className="w-8 h-8 opacity-30" />
                </div>
                <div className="text-center">
                  <p className="text-sm">Select a job to view details</p>
                  <p className="text-xs mt-1 text-zinc-700">Or create a new job to get started</p>
                </div>
                <Button size="sm" className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-500" onClick={() => setShowComposer(true)}>
                  <Plus className="w-3.5 h-3.5" /> New Job
                </Button>
              </div>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-zinc-800/50 w-px hover:bg-violet-500/30 transition-colors" />

        {/* ─── Right Panel: Inspector ────────────────────────── */}
        <ResizablePanel defaultSize={33} minSize={22} maxSize={45}>
          <div className="flex flex-col h-full bg-[#0e0c16]">
            {selectedJob ? (
              <Tabs value={rightTab} onValueChange={setRightTab} className="flex flex-col h-full">
                <TabsList className="w-full justify-start rounded-none border-b border-zinc-800/50 bg-transparent p-0 h-9 shrink-0 overflow-x-auto">
                  <TabsTrigger value="parameters" className="text-[10px] font-mono tracking-wider rounded-none border-b-2 border-transparent data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 h-9 shrink-0">
                    <Wrench className="w-3 h-3 mr-1.5" />PARAMS
                  </TabsTrigger>
                  <TabsTrigger value="research" className="text-[10px] font-mono tracking-wider rounded-none border-b-2 border-transparent data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 h-9 shrink-0">
                    <Globe className="w-3 h-3 mr-1.5" />RESEARCH
                  </TabsTrigger>
                  <TabsTrigger value="validation" className="text-[10px] font-mono tracking-wider rounded-none border-b-2 border-transparent data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 h-9 shrink-0">
                    <Shield className="w-3 h-3 mr-1.5" />VALIDATE
                  </TabsTrigger>
                  <TabsTrigger value="scad" className="text-[10px] font-mono tracking-wider rounded-none border-b-2 border-transparent data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 h-9 shrink-0">
                    <FileCode className="w-3 h-3 mr-1.5" />SCAD
                  </TabsTrigger>
                  <TabsTrigger value="timeline" className="text-[10px] font-mono tracking-wider rounded-none border-b-2 border-transparent data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 h-9 shrink-0">
                    <Clock className="w-3 h-3 mr-1.5" />LOG
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="parameters" className="flex-1 min-h-0 mt-0">
                  <ParameterPanel job={selectedJob} onUpdate={loadJobs} />
                </TabsContent>
                <TabsContent value="research" className="flex-1 min-h-0 mt-0">
                  <ResearchPanel job={selectedJob} />
                </TabsContent>
                <TabsContent value="validation" className="flex-1 min-h-0 mt-0">
                  <ValidationPanel job={selectedJob} />
                </TabsContent>
                <TabsContent value="scad" className="flex-1 min-h-0 mt-0">
                  <ScadViewer code={selectedJob.scadSource} />
                </TabsContent>
                <TabsContent value="timeline" className="flex-1 min-h-0 mt-0">
                  <TimelinePanel job={selectedJob} />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-700 text-xs">
                Select a job
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* ─── New Job Composer ─────────────────────────────────── */}
      <AnimatePresence>
        {showComposer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowComposer(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-lg mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="bg-[#151222] border-zinc-800/80 shadow-2xl shadow-violet-500/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="w-4 h-4 text-violet-400" />
                      New CAD Job
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-500" onClick={() => setShowComposer(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-zinc-500 tracking-wider uppercase mb-2 block">Describe your CAD request</label>
                    <Textarea
                      value={newRequest}
                      onChange={(e) => setNewRequest(e.target.value)}
                      placeholder="e.g. A 40mm×30mm×15mm electronics enclosure with 2mm walls"
                      className="min-h-[100px] bg-[#0c0a14] border-zinc-800 text-zinc-200 placeholder:text-zinc-700 focus:border-violet-500/50 resize-none text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCreate()
                      }}
                    />
                    <p className="text-[10px] text-zinc-600 mt-1">Press ⌘+Enter to submit</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                      <span className="font-mono">{newRequest.length}/5000</span>
                    </div>
                    <Button
                      onClick={handleCreate}
                      disabled={!newRequest.trim() || isCreating}
                      className="gap-1.5 bg-violet-600 hover:bg-violet-500"
                    >
                      {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {isCreating ? 'Creating...' : 'Create Job'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Footer ───────────────────────────────────────────── */}
      <footer className="flex items-center justify-between h-7 px-4 border-t border-zinc-800/50 bg-[#0f0d18] shrink-0 text-[10px] font-mono text-zinc-600">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-emerald-500" /> System Online</span>
          <Separator orientation="vertical" className="h-3 bg-zinc-800" />
          <span>{stats.total} jobs</span>
        </div>
        <div className="flex items-center gap-3">
          <span>AgentSCAD Engine v0.1</span>
          <Separator orientation="vertical" className="h-3 bg-zinc-800" />
          <span>SQLite</span>
        </div>
      </footer>
    </div>
  )
}
