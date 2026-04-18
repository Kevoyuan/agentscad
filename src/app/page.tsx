'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Box, Play, Trash2, Settings, ChevronRight, Clock, CheckCircle2,
  XCircle, AlertTriangle, Loader2, Download, Code2, Shield, Cpu,
  Activity, Layers, RefreshCw, Eye, Search, Plus, ArrowUpDown,
  Wrench, Zap, FileCode, Image, RotateCcw, Send, X, Lightbulb,
  Beaker, Target, Globe, Info, MessageSquare, Copy, Keyboard,
  Sparkles, Gauge, Timer, Hash, AlertCircle, Star, Repeat, Maximize2
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
import { useToast } from '@/hooks/use-toast'

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

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
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

const STATE_COLORS: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  NEW: { bg: 'bg-slate-500/20', text: 'text-slate-300', dot: 'bg-slate-400', border: 'border-slate-500/30' },
  SCAD_GENERATED: { bg: 'bg-amber-500/20', text: 'text-amber-300', dot: 'bg-amber-400', border: 'border-amber-500/30' },
  RENDERED: { bg: 'bg-cyan-500/20', text: 'text-cyan-300', dot: 'bg-cyan-400', border: 'border-cyan-500/30' },
  VALIDATED: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', dot: 'bg-emerald-400', border: 'border-emerald-500/30' },
  DELIVERED: { bg: 'bg-lime-500/20', text: 'text-lime-300', dot: 'bg-lime-400', border: 'border-lime-500/30' },
  DEBUGGING: { bg: 'bg-orange-500/20', text: 'text-orange-300', dot: 'bg-orange-400', border: 'border-orange-500/30' },
  REPAIRING: { bg: 'bg-orange-500/20', text: 'text-orange-300', dot: 'bg-orange-400', border: 'border-orange-500/30' },
  VALIDATION_FAILED: { bg: 'bg-rose-500/20', text: 'text-rose-300', dot: 'bg-rose-400', border: 'border-rose-500/30' },
  GEOMETRY_FAILED: { bg: 'bg-red-500/20', text: 'text-red-300', dot: 'bg-red-400', border: 'border-red-500/30' },
  RENDER_FAILED: { bg: 'bg-red-500/20', text: 'text-red-300', dot: 'bg-red-400', border: 'border-red-500/30' },
  HUMAN_REVIEW: { bg: 'bg-yellow-500/20', text: 'text-yellow-300', dot: 'bg-yellow-400', border: 'border-yellow-500/30' },
  CANCELLED: { bg: 'bg-zinc-500/20', text: 'text-zinc-400', dot: 'bg-zinc-500', border: 'border-zinc-500/30' },
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

const FILTER_STATES = [
  { key: 'ALL', label: 'ALL' },
  { key: 'NEW', label: 'NEW' },
  { key: 'SCAD_GENERATED', label: 'GEN' },
  { key: 'RENDERED', label: 'RENDER' },
  { key: 'VALIDATED', label: 'VALID' },
  { key: 'DELIVERED', label: 'DONE' },
  { key: 'FAILED', label: 'FAILED', stateKey: 'VALIDATION_FAILED' },
]

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
  if (diff < 0) return 'just now'
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function getStateInfo(state: string) {
  return STATE_COLORS[state] || { bg: 'bg-zinc-500/20', text: 'text-zinc-300', dot: 'bg-zinc-400', border: 'border-zinc-500/30' }
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

function safeNum(val: unknown, fallback: number): number {
  if (typeof val === 'number' && !isNaN(val)) return val
  return fallback
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

async function sendChatMessage(messages: Array<{ role: string; content: string }>, jobId?: string): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, jobId }),
  })
  if (!res.ok) throw new Error('Chat request failed')
  const data = await res.json()
  return data.message?.content || 'No response'
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function StateBadge({ state, size = 'sm' }: { state: string; size?: 'sm' | 'md' }) {
  const info = getStateInfo(state)
  const label = state.replace(/_/g, ' ')
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md font-mono ${size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} ${info.bg} ${info.text} ${info.border} border`}>
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
    <div className="flex items-center gap-0.5 px-2 py-1">
      {PIPELINE_STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx
        const isCurrent = idx === currentIdx
        const Icon = step.icon

        return (
          <div key={step.key} className="flex items-center">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md transition-all duration-300 ${
                    isCompleted ? 'text-lime-400' :
                    isCurrent && !isFailed ? 'text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/20' :
                    isCurrent && isFailed ? 'text-rose-400 bg-rose-500/10 ring-1 ring-rose-500/20' :
                    'text-zinc-600'
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${isCurrent && !isFailed ? 'animate-pulse' : ''}`} />
                    <span className="text-[8px] font-mono tracking-wider">{step.label}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{step.label}: {step.key.replace(/_/g, ' ')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {idx < PIPELINE_STEPS.length - 1 && (
              <ChevronRight className={`w-2.5 h-2.5 mx-0.5 transition-colors duration-300 ${idx < currentIdx ? 'text-lime-500/60' : 'text-zinc-700'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ParameterPanel({ job, onUpdate }: { job: Job; onUpdate: () => void }) {
  // The parameterSchema in the DB can be either:
  // - A ParameterSchema object { part_family, design_summary, parameters: [...] }
  // - A raw ParameterDef[] array (from the process route)
  // Handle both formats
  const rawSchema = parseJSON<ParameterSchema | ParameterDef[] | null>(job.parameterSchema, null)
  const values = parseJSON<Record<string, number>>(job.parameterValues, {})
  const [localValues, setLocalValues] = useState(values)
  const [isUpdating, setIsUpdating] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    setLocalValues(values)
  }, [job.parameterValues])

  // Normalize schema: if it's a raw array, wrap it in a ParameterSchema object
  let schema: ParameterSchema | null = null
  if (rawSchema) {
    if (Array.isArray(rawSchema)) {
      schema = { part_family: 'unknown', design_summary: '', parameters: rawSchema as ParameterDef[] }
    } else if (rawSchema.parameters && Array.isArray(rawSchema.parameters)) {
      schema = rawSchema as ParameterSchema
    }
  }

  if (!schema) return (
    <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3 p-6">
      <div className="w-12 h-12 rounded-xl bg-zinc-800/30 flex items-center justify-center">
        <Wrench className="w-6 h-6 opacity-30" />
      </div>
      <div className="text-center">
        <p className="text-sm">No parameters available</p>
        <p className="text-[10px] text-zinc-700 mt-1">Process a job to generate parameters</p>
      </div>
    </div>
  )

  const groups = [...new Set(schema.parameters.map(p => p.group || 'general'))]

  const handleParamChange = (key: string, value: number) => {
    const newValues = { ...localValues, [key]: value }
    setLocalValues(newValues)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setIsUpdating(true)
      try {
        await updateParameters(job.id, newValues)
        onUpdate()
        toast({ title: 'Parameter updated', description: `${key} = ${value}`, duration: 2000 })
      } catch (err) {
        console.error('Parameter update failed:', err)
        toast({ title: 'Update failed', description: 'Failed to save parameter change', variant: 'destructive', duration: 3000 })
      } finally {
        setIsUpdating(false)
      }
    }, 600)
  }

  const sourceColor: Record<string, string> = {
    user: 'text-sky-400',
    inferred: 'text-amber-400',
    design_derived: 'text-violet-400',
    engineering: 'text-emerald-400',
    derived: 'text-cyan-400',
    llm_declared: 'text-emerald-400',
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Parameters</h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] h-4 bg-zinc-800/50 text-zinc-500 border-zinc-700/50">
            {schema.parameters.length} params
          </Badge>
          {isUpdating && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {groups.map(group => (
            <div key={group}>
              <div className="text-[9px] font-mono tracking-widest text-zinc-600 uppercase mb-2 px-1 flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-violet-500/50" />
                {group}
              </div>
              <div className="space-y-3">
                {schema.parameters.filter(p => (p.group || 'general') === group).map(param => {
                  const min = safeNum(param.min, 0)
                  const max = safeNum(param.max, 100)
                  const step = safeNum(param.step, 1)
                  const value = safeNum(localValues[param.key], param.value)
                  return (
                    <div key={param.key} className="space-y-1 group/param">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-zinc-300 group-hover/param:text-zinc-100 transition-colors">{param.label}</span>
                          <span className={`text-[8px] font-mono px-1 py-0.5 rounded ${sourceColor[param.source] || 'text-zinc-500'} bg-zinc-800/50`}>
                            {param.source.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-mono text-zinc-200 tabular-nums">
                            {typeof localValues[param.key] === 'number' ? localValues[param.key].toFixed(step < 1 ? 1 : 0) : param.value?.toFixed(step < 1 ? 1 : 0) ?? '0'}
                          </span>
                          <span className="text-[9px] text-zinc-600">{param.unit}</span>
                        </div>
                      </div>
                      {param.kind === 'number' || param.kind === 'float' || param.kind === 'integer' ? (
                        <Slider
                          value={[value]}
                          min={min}
                          max={max}
                          step={step}
                          onValueChange={([v]) => handleParamChange(param.key, v)}
                          disabled={!param.editable}
                          className="py-0.5"
                        />
                      ) : null}
                      <div className="flex justify-between text-[8px] text-zinc-700 font-mono">
                        <span>{min}</span>
                        <span>{max} {param.unit}</span>
                      </div>
                      {param.description && (
                        <p className="text-[10px] text-zinc-600 leading-relaxed hidden group-hover/param:block transition-all">{param.description}</p>
                      )}
                    </div>
                  )
                })}
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
  if (results.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3 p-6">
      <div className="w-12 h-12 rounded-xl bg-zinc-800/30 flex items-center justify-center">
        <Shield className="w-6 h-6 opacity-30" />
      </div>
      <p className="text-sm">No validation results</p>
    </div>
  )

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const score = Math.round((passed / results.length) * 100)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Validation</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-8 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${score === 100 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${score}%` }} />
            </div>
            <span className="text-[9px] font-mono text-zinc-500">{score}%</span>
          </div>
          <Badge variant="outline" className="text-[9px] h-4 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">{passed}✓</Badge>
          {failed > 0 && <Badge variant="outline" className="text-[9px] h-4 bg-rose-500/10 text-rose-400 border-rose-500/20">{failed}✗</Badge>}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {results.map((r, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-start gap-2 p-2.5 rounded-lg transition-colors ${
                r.passed
                  ? 'bg-zinc-900/40 hover:bg-zinc-900/60'
                  : 'bg-rose-500/5 border border-rose-500/10 hover:bg-rose-500/10'
              }`}
            >
              {r.passed
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                : <XCircle className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono text-zinc-600 bg-zinc-800/50 px-1 rounded">{r.rule_id}</span>
                  <span className="text-xs text-zinc-300">{r.rule_name}</span>
                  {r.is_critical && (
                    <span className="flex items-center gap-0.5 text-[8px] text-amber-500">
                      <AlertTriangle className="w-2.5 h-2.5" />CRITICAL
                    </span>
                  )}
                  <Badge variant="outline" className="text-[8px] h-3 px-1 border-zinc-700/50 text-zinc-500">{r.level}</Badge>
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">{r.message}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function ScadViewer({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false)

  if (!code) return (
    <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3 p-6">
      <div className="w-12 h-12 rounded-xl bg-zinc-800/30 flex items-center justify-center">
        <FileCode className="w-6 h-6 opacity-30" />
      </div>
      <p className="text-sm">No SCAD source</p>
    </div>
  )

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">SCAD Source</h3>
        <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300" onClick={handleCopy}>
          {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <pre className="p-4 text-xs font-mono leading-relaxed text-emerald-300/80 whitespace-pre overflow-x-auto">
          <code>{code}</code>
        </pre>
      </ScrollArea>
    </div>
  )
}

function ThreeDViewer({ job }: { job: Job }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showWireframe, setShowWireframe] = useState(false)

  const values = parseJSON<Record<string, number>>(job.parameterValues, {})
  const width = safeNum(values.width, 40)
  const depth = safeNum(values.depth, 30)
  const height = safeNum(values.height, 15)
  const wall = safeNum(values.wall_thickness, 2)
  const teeth = safeNum(values.teeth, 20)
  const outerDiam = safeNum(values.outer_diameter, 50)
  const boreDiam = safeNum(values.bore_diameter, 8)
  const thickness = safeNum(values.thickness, 8)
  const partFamily = job.partFamily || 'unknown'

  useEffect(() => {
    if (!mountRef.current || job.state === 'NEW' || job.state === 'SCAD_GENERATED') return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const container = mountRef.current

    // Check dimensions first
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === 0 || h === 0) {
      setIsLoading(false)
      return
    }

    let renderer: any = null
    let controls: any = null
    let animFrameId: number | null = null

    import('three').then(async (THREE) => {
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')

      if (cancelled || !mountRef.current) return

      try {
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0x080810)
        scene.fog = new THREE.Fog(0x080810, 100, 200)

        const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000)
        camera.position.set(60, 50, 60)

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setSize(w, h)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.shadowMap.enabled = true

        // Clear previous content
        while (container.firstChild) {
          container.removeChild(container.firstChild)
        }
        container.appendChild(renderer.domElement)

        controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.05
        controls.autoRotate = true
        controls.autoRotateSpeed = 0.5

        // Grid
        const gridHelper = new THREE.GridHelper(120, 24, 0x1a1a3e, 0x0d0d1f)
        scene.add(gridHelper)

        // Axis helper
        const axisHelper = new THREE.AxesHelper(30)
        axisHelper.position.set(-50, 0.1, -50)
        scene.add(axisHelper)

        // Build geometry based on part family
        const mainGroup = new THREE.Group()

        if (partFamily === 'spur_gear') {
          // Gear body
          const gearRadius = outerDiam / 2
          const gearGeo = new THREE.CylinderGeometry(gearRadius, gearRadius, thickness, Math.max(8, teeth), 1)
          const gearMat = new THREE.MeshPhongMaterial({
            color: 0x6366f1,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
          })
          const gearMesh = new THREE.Mesh(gearGeo, gearMat)
          gearMesh.rotation.x = Math.PI / 2
          gearMesh.position.y = thickness / 2
          mainGroup.add(gearMesh)

          // Gear teeth
          for (let i = 0; i < teeth; i++) {
            const angle = (i / teeth) * Math.PI * 2
            const toothGeo = new THREE.BoxGeometry(outerDiam * 0.06, thickness, outerDiam * 0.08)
            const toothMesh = new THREE.Mesh(toothGeo, gearMat.clone())
            toothMesh.position.x = Math.cos(angle) * (gearRadius + outerDiam * 0.02)
            toothMesh.position.z = Math.sin(angle) * (gearRadius + outerDiam * 0.02)
            toothMesh.position.y = thickness / 2
            toothMesh.rotation.y = -angle
            mainGroup.add(toothMesh)
          }

          // Bore hole
          const boreGeo = new THREE.CylinderGeometry(boreDiam / 2, boreDiam / 2, thickness + 1, 32)
          const boreMat = new THREE.MeshPhongMaterial({
            color: 0x080810,
            side: THREE.BackSide,
          })
          const boreMesh = new THREE.Mesh(boreGeo, boreMat)
          boreMesh.rotation.x = Math.PI / 2
          boreMesh.position.y = thickness / 2
          mainGroup.add(boreMesh)

          // Edges
          const edgesGeo = new THREE.EdgesGeometry(gearGeo)
          const edgesMat = new THREE.LineBasicMaterial({ color: 0x818cf8 })
          const edgesLine = new THREE.LineSegments(edgesGeo, edgesMat)
          edgesLine.rotation.x = Math.PI / 2
          edgesLine.position.y = thickness / 2
          mainGroup.add(edgesLine)

        } else if (partFamily === 'device_stand') {
          const standH = safeNum(values.stand_height, 80)
          const deviceW = safeNum(values.device_width, 75)
          const wallT = safeNum(values.wall_thickness, 3)

          // Base
          const baseGeo = new THREE.BoxGeometry(deviceW + wallT * 2 + 40, wallT, deviceW * 0.6)
          const baseMat = new THREE.MeshPhongMaterial({ color: 0x6366f1, transparent: true, opacity: 0.7 })
          const baseMesh = new THREE.Mesh(baseGeo, baseMat)
          baseMesh.position.y = wallT / 2
          mainGroup.add(baseMesh)

          // Back support
          const backGeo = new THREE.BoxGeometry(deviceW + wallT * 2, standH, wallT)
          const backMesh = new THREE.Mesh(backGeo, baseMat.clone())
          backMesh.position.y = standH / 2
          backMesh.position.z = -deviceW * 0.2
          mainGroup.add(backMesh)

          // Front lip
          const lipGeo = new THREE.BoxGeometry(deviceW + wallT * 2, safeNum(values.lip_height, 10), wallT)
          const lipMesh = new THREE.Mesh(lipGeo, baseMat.clone())
          lipMesh.position.y = safeNum(values.lip_height, 10) / 2
          lipMesh.position.z = deviceW * 0.2
          mainGroup.add(lipMesh)

          // Edges
          mainGroup.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
              const edges = new THREE.EdgesGeometry(child.geometry)
              const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x818cf8 }))
              line.position.copy(child.position)
              mainGroup.add(line)
            }
          })

        } else if (partFamily === 'phone_case') {
          const bodyL = safeNum(values.body_length, 158)
          const bodyW = safeNum(values.body_width, 78)
          const bodyD = safeNum(values.body_depth, 8)
          const wallT = safeNum(values.wall_thickness, 1.5)

          // Outer shell
          const outerGeo = new THREE.BoxGeometry(bodyL + wallT * 2, bodyD + wallT, bodyW + wallT * 2)
          const outerMat = new THREE.MeshPhongMaterial({ color: 0x6366f1, transparent: true, opacity: 0.5 })
          const outerMesh = new THREE.Mesh(outerGeo, outerMat)
          outerMesh.position.y = (bodyD + wallT) / 2
          mainGroup.add(outerMesh)

          // Inner cavity
          const innerGeo = new THREE.BoxGeometry(bodyL, bodyD, bodyW)
          const innerMat = new THREE.MeshPhongMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.15, side: THREE.BackSide })
          const innerMesh = new THREE.Mesh(innerGeo, innerMat)
          innerMesh.position.y = wallT + bodyD / 2
          mainGroup.add(innerMesh)

          // Edges
          const outerEdges = new THREE.EdgesGeometry(outerGeo)
          const outerLine = new THREE.LineSegments(outerEdges, new THREE.LineBasicMaterial({ color: 0x818cf8 }))
          outerLine.position.y = (bodyD + wallT) / 2
          mainGroup.add(outerLine)

        } else {
          // Default: electronics_enclosure / unknown box
          const outerGeo = new THREE.BoxGeometry(width, height, depth)
          const outerMat = new THREE.MeshPhongMaterial({
            color: 0x6366f1,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
          })
          const outerMesh = new THREE.Mesh(outerGeo, outerMat)
          outerMesh.position.y = height / 2
          mainGroup.add(outerMesh)

          const outerEdges = new THREE.EdgesGeometry(outerGeo)
          const outerLine = new THREE.LineSegments(outerEdges, new THREE.LineBasicMaterial({ color: 0x818cf8 }))
          outerLine.position.y = height / 2
          mainGroup.add(outerLine)

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
          mainGroup.add(innerMesh)

          const innerEdges = new THREE.EdgesGeometry(innerGeo)
          const innerLine = new THREE.LineSegments(innerEdges, new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.5 }))
          innerLine.position.y = height / 2
          mainGroup.add(innerLine)
        }

        scene.add(mainGroup)

        // Lights
        const ambient = new THREE.AmbientLight(0x404060, 2.5)
        scene.add(ambient)
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
        dirLight.position.set(50, 80, 50)
        dirLight.castShadow = true
        scene.add(dirLight)
        const pointLight1 = new THREE.PointLight(0x6366f1, 0.6, 200)
        pointLight1.position.set(-30, 40, -30)
        scene.add(pointLight1)
        const pointLight2 = new THREE.PointLight(0x22d3ee, 0.3, 150)
        pointLight2.position.set(30, 20, 30)
        scene.add(pointLight2)

        setIsLoading(false)

        function animate() {
          if (cancelled) return
          animFrameId = requestAnimationFrame(animate)
          controls.update()
          renderer.render(scene, camera)
        }
        animate()

      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '3D rendering failed')
          setIsLoading(false)
        }
      }
    }).catch((err) => {
      if (!cancelled) {
        setError('Failed to load 3D library')
        setIsLoading(false)
      }
    })

    return () => {
      cancelled = true
      if (animFrameId !== null) cancelAnimationFrame(animFrameId)
      if (renderer) {
        renderer.dispose()
        renderer = null
      }
      if (controls) {
        controls.dispose()
        controls = null
      }
      if (container) {
        while (container.firstChild) {
          container.removeChild(container.firstChild)
        }
      }
    }
  }, [job.state, job.parameterValues, width, depth, height, wall, teeth, outerDiam, boreDiam, thickness, partFamily, showWireframe])

  if (job.state === 'NEW' || job.state === 'SCAD_GENERATED') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800/20 flex items-center justify-center">
          <Box className="w-8 h-8 opacity-20" />
        </div>
        <span className="text-xs">Process job to generate 3D preview</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3 p-4">
        <AlertCircle className="w-8 h-8 text-rose-500/50" />
        <span className="text-xs text-rose-400">3D preview unavailable</span>
        <span className="text-[10px] text-zinc-700">{error}</span>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            <span className="text-[10px] text-zinc-500">Loading 3D preview...</span>
          </div>
        </div>
      )}
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-2 flex items-center gap-2">
        <span className="text-[9px] font-mono text-zinc-600 bg-black/40 px-1.5 py-0.5 rounded">
          {partFamily === 'spur_gear' ? `${teeth}T ⌀${outerDiam}mm` :
           partFamily === 'phone_case' ? `${safeNum(values.body_length, 158)}×${safeNum(values.body_width, 78)}mm` :
           partFamily === 'device_stand' ? `${safeNum(values.device_width, 75)}mm stand` :
           `${width}×${depth}×${height}mm`}
        </span>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50"
          onClick={() => setShowWireframe(!showWireframe)}
          title="Toggle wireframe"
        >
          <Eye className="w-3 h-3" />
        </Button>
      </div>
    </div>
  )
}

function TimelinePanel({ job }: { job: Job }) {
  const logs = parseJSON<ExecutionLog[]>(job.executionLogs, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Timeline</h3>
        <Badge variant="outline" className="text-[9px] h-4 bg-zinc-800/50 text-zinc-500 border-zinc-700/50">
          {logs.length} events
        </Badge>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {logs.map((log, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-800/40 transition-colors group"
            >
              <span className="text-[8px] font-mono text-zinc-700 mt-0.5 whitespace-nowrap">{formatTime(log.timestamp)}</span>
              <span className={`text-[8px] font-mono px-1 py-0.5 rounded shrink-0 ${
                log.event.includes('FAILED') ? 'bg-rose-500/10 text-rose-400' :
                log.event === 'DELIVERED' ? 'bg-lime-500/10 text-lime-400' :
                log.event === 'SCAD_GENERATED' ? 'bg-amber-500/10 text-amber-400' :
                log.event === 'RENDERED' ? 'bg-cyan-500/10 text-cyan-400' :
                log.event === 'VALIDATED' ? 'bg-emerald-500/10 text-emerald-400' :
                'bg-zinc-800/60 text-zinc-400'
              }`}>{log.event}</span>
              <span className="text-[11px] text-zinc-500 flex-1">{log.message}</span>
            </motion.div>
          ))}
          {logs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-600 gap-2">
              <Clock className="w-6 h-6 opacity-30" />
              <span className="text-xs">No events yet</span>
            </div>
          )}
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
    <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3 p-6">
      <div className="w-12 h-12 rounded-xl bg-zinc-800/30 flex items-center justify-center">
        <Beaker className="w-6 h-6 opacity-30" />
      </div>
      <div className="text-center">
        <p className="text-sm">No research data yet</p>
        <p className="text-[10px] text-zinc-700 mt-1">Process a job to generate research</p>
      </div>
    </div>
  )

  const sections = [
    { data: research, icon: Globe, label: 'Research', color: 'text-sky-400' },
    { data: intent, icon: Lightbulb, label: 'Intent', color: 'text-amber-400' },
    { data: design, icon: Beaker, label: 'Design', color: 'text-violet-400' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Research & Intent</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Part Family & Builder Tags */}
          <div className="flex items-center gap-2 flex-wrap">
            {job.partFamily && (
              <Badge variant="outline" className="text-[9px] h-5 bg-violet-500/10 text-violet-400 border-violet-500/20 gap-1">
                <Target className="w-2.5 h-2.5" />{job.partFamily.replace(/_/g, ' ')}
              </Badge>
            )}
            {job.builderName && (
              <Badge variant="outline" className="text-[9px] h-5 bg-cyan-500/10 text-cyan-400 border-cyan-500/20 gap-1">
                <Cpu className="w-2.5 h-2.5" />{job.builderName}
              </Badge>
            )}
            {job.generationPath && (
              <Badge variant="outline" className="text-[9px] h-5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1">
                <Layers className="w-2.5 h-2.5" />{job.generationPath.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>

          {/* Data Sections */}
          {sections.map(({ data, icon: Icon, label, color }) => data && (
            <div key={label} className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/20 border-b border-zinc-800/40">
                <Icon className={`w-3 h-3 ${color}`} />
                <span className={`text-[9px] font-mono tracking-wider ${color} uppercase`}>{label}</span>
              </div>
              <div className="p-2.5 space-y-1.5">
                {Object.entries(data).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2">
                    <span className="text-[9px] font-mono text-zinc-600 min-w-[90px] shrink-0">{key}</span>
                    <span className="text-[10px] text-zinc-400 flex-1">
                      {Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value, null, 0) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Parameter Schema Summary */}
          {job.parameterSchema && (
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/20 border-b border-zinc-800/40">
                <Info className="w-3 h-3 text-emerald-400" />
                <span className="text-[9px] font-mono tracking-wider text-emerald-400 uppercase">Schema Info</span>
              </div>
              <div className="p-2.5">
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
  const rawSchema = parseJSON<ParameterSchema | ParameterDef[] | null>(schemaStr, null)
  // Normalize: handle both raw array and object format
  let schema: ParameterSchema | null = null
  if (rawSchema) {
    if (Array.isArray(rawSchema)) {
      schema = { part_family: 'unknown', design_summary: '', parameters: rawSchema as ParameterDef[] }
    } else if (rawSchema.parameters && Array.isArray(rawSchema.parameters)) {
      schema = rawSchema as ParameterSchema
    }
  }
  if (!schema) return <span className="text-zinc-600 text-xs">Invalid schema</span>

  const sourceCounts: Record<string, number> = {}
  for (const p of schema.parameters) {
    sourceCounts[p.source] = (sourceCounts[p.source] || 0) + 1
  }

  const sourceColor: Record<string, string> = {
    user: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    inferred: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    design_derived: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    engineering: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    derived: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[8px] h-4 bg-zinc-800/50 text-zinc-400 border-zinc-700/50">
          {schema.part_family || 'unknown'}
        </Badge>
        <Badge variant="outline" className="text-[8px] h-4 bg-zinc-800/50 text-zinc-400 border-zinc-700/50">
          {schema.parameters.length} params
        </Badge>
        {Object.entries(sourceCounts).map(([source, count]) => (
          <Badge key={source} variant="outline" className={`text-[8px] h-4 ${sourceColor[source] || 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50'}`}>
            {count} {source.replace('_', ' ')}
          </Badge>
        ))}
      </div>
      {schema.design_summary && (
        <p className="text-[10px] text-zinc-500 leading-relaxed">{schema.design_summary}</p>
      )}
    </div>
  )
}

function ChatPanel({ job }: { job: Job }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const chatHistory = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const response = await sendChatMessage(chatHistory, job.id)
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date() }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', timestamp: new Date() }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-violet-400" />AI Assistant
        </h3>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" className="h-4 text-[8px] text-zinc-600 hover:text-zinc-400" onClick={() => setMessages([])}>
            Clear
          </Button>
        )}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272a #0c0a14' }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-violet-500/50" />
            </div>
            <div className="text-center">
              <p className="text-xs">Ask about this CAD job</p>
              <p className="text-[10px] text-zinc-700 mt-1">Get help with parameters, design, or manufacturing</p>
            </div>
            <div className="flex flex-wrap gap-1 justify-center mt-1">
              {['Optimize wall thickness', 'Explain this design', 'Suggest improvements'].map(q => (
                <button
                  key={q}
                  className="text-[9px] font-mono text-zinc-600 bg-zinc-800/40 px-2 py-1 rounded-md hover:text-zinc-400 hover:bg-zinc-800/60 transition-colors"
                  onClick={() => setInput(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-violet-600/20 text-violet-200 border border-violet-500/20'
                : 'bg-zinc-800/50 text-zinc-300 border border-zinc-700/30'
            }`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-1 mb-1">
                  <Sparkles className="w-2.5 h-2.5 text-violet-400" />
                  <span className="text-[8px] font-mono text-violet-400">AgentSCAD</span>
                </div>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                <span className="text-[10px] text-zinc-500">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="p-2 border-t border-zinc-800/60">
        <div className="flex items-center gap-1.5">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Ask about this design..."
            className="h-7 text-[11px] bg-[#0c0a14] border-zinc-800/60 placeholder:text-zinc-700 focus:border-violet-500/40"
          />
          <Button size="sm" className="h-7 w-7 p-0 bg-violet-600 hover:bg-violet-500 shrink-0" onClick={handleSend} disabled={!input.trim() || isLoading}>
            <Send className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [allJobs, setAllJobs] = useState<Job[]>([])
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
  const [uptimeStart] = useState(Date.now())
  const [showShortcuts, setShowShortcuts] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const { toast } = useToast()

  const loadJobs = useCallback(async () => {
    try {
      const allData = await fetchJobs()
      setAllJobs(allData.jobs)
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
  }, [filterState])

  useEffect(() => {
    loadJobs()
  }, [filterState, loadJobs])

  useEffect(() => {
    pollRef.current = setInterval(loadJobs, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadJobs])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        setShowComposer(true)
      }
      if (e.key === 'Escape') {
        setShowComposer(false)
        setShowShortcuts(false)
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          setShowShortcuts(prev => !prev)
        }
      }
      if (e.key === 'Delete' && selectedJob) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          handleDelete(selectedJob.id)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedJob])

  const handleCreate = async () => {
    if (!newRequest.trim()) return
    setIsCreating(true)
    try {
      const { job } = await createJob(newRequest.trim())
      setNewRequest('')
      setShowComposer(false)
      await loadJobs()
      setSelectedJob(job)
      toast({
        title: 'Job created',
        description: `"${job.inputRequest.slice(0, 50)}${job.inputRequest.length > 50 ? '...' : ''}"`,
        duration: 3000,
      })
    } catch (err) {
      console.error('Failed to create job:', err)
      toast({ title: 'Error', description: 'Failed to create job', variant: 'destructive' })
    } finally {
      setIsCreating(false)
    }
  }

  const handleProcess = async (job: Job) => {
    setIsProcessing(true)
    setProcessingState('NEW')
    toast({ title: 'Processing started', description: `Job ${job.id.slice(0, 8)}...`, duration: 2000 })
    try {
      await processJob(job.id, (data) => {
        if (data.state) setProcessingState(data.state as string)
      })
      await loadJobs()
      const freshJobs = await fetchJobs()
      const updated = freshJobs.jobs.find(j => j.id === job.id)
      if (updated) setSelectedJob(updated)
      toast({
        title: 'Job completed!',
        description: `Job ${job.id.slice(0, 8)} has been delivered`,
        duration: 4000,
      })
    } catch (err) {
      console.error('Failed to process job:', err)
      toast({ title: 'Processing failed', description: 'Check the job for errors', variant: 'destructive' })
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
      toast({ title: 'Job deleted', duration: 2000 })
    } catch (err) {
      console.error('Failed to delete job:', err)
      toast({ title: 'Delete failed', variant: 'destructive' })
    }
  }

  const handleDuplicate = async (job: Job) => {
    try {
      const { job: newJob } = await createJob(job.inputRequest)
      setSelectedJob(newJob)
      await loadJobs()
      toast({ title: 'Job duplicated', duration: 2000 })
    } catch (err) {
      toast({ title: 'Duplicate failed', variant: 'destructive' })
    }
  }

  const stats = useMemo(() => ({
    total: allJobs.length,
    delivered: allJobs.filter(j => j.state === 'DELIVERED').length,
    processing: allJobs.filter(j => !['DELIVERED', 'CANCELLED', 'HUMAN_REVIEW'].includes(j.state)).length,
    failed: allJobs.filter(j => j.state.includes('FAILED')).length,
    new: allJobs.filter(j => j.state === 'NEW').length,
  }), [allJobs])

  const displayedJobs = searchQuery
    ? jobs.filter(j => j.inputRequest.toLowerCase().includes(searchQuery.toLowerCase()) || j.id.toLowerCase().includes(searchQuery.toLowerCase()))
    : jobs

  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const j of allJobs) {
      const s = j.state.includes('FAILED') ? 'FAILED' : j.state
      counts[s] = (counts[s] || 0) + 1
    }
    return counts
  }, [allJobs])

  const uptimeSeconds = Math.floor((Date.now() - uptimeStart) / 1000)

  return (
    <div className="flex flex-col h-screen bg-[#0c0a14] text-zinc-100 overflow-hidden">
      {/* ─── Top Bar ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between h-10 px-4 border-b border-zinc-800/60 bg-[#0f0d18]/95 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Cpu className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-tight bg-gradient-to-r from-violet-200 to-cyan-200 bg-clip-text text-transparent">AgentSCAD</span>
            <span className="text-[9px] font-mono text-zinc-600 ml-0.5">v0.2</span>
          </div>
          <Separator orientation="vertical" className="h-4 bg-zinc-800/60" />
          <PipelineVisualization state={selectedJob?.state || 'NEW'} />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 mr-2 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-zinc-500"><Layers className="w-3 h-3" />{stats.total}</span>
            <span className="flex items-center gap-1 text-lime-500"><CheckCircle2 className="w-3 h-3" />{stats.delivered}</span>
            <span className="flex items-center gap-1 text-amber-500"><Activity className="w-3 h-3" />{stats.processing}</span>
            {stats.failed > 0 && <span className="flex items-center gap-1 text-rose-500"><XCircle className="w-3 h-3" />{stats.failed}</span>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-zinc-600 hover:text-zinc-400"
            onClick={() => setShowShortcuts(true)}
            title="Keyboard shortcuts"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            className="h-6 text-[10px] gap-1 bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-600/20"
            onClick={() => setShowComposer(true)}
          >
            <Plus className="w-3 h-3" /> New Job
          </Button>
        </div>
      </header>

      {/* ─── Main Content ────────────────────────────────────── */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* ─── Left Panel: Jobs List ─────────────────────────── */}
        <ResizablePanel defaultSize={22} minSize={16} maxSize={35}>
          <div className="flex flex-col h-full bg-[#0e0c16]">
            {/* Search */}
            <div className="px-3 py-2 border-b border-zinc-800/40">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search jobs..."
                  className="h-6 text-[11px] bg-[#0c0a14] border-zinc-800/60 pl-7 placeholder:text-zinc-700 focus:border-violet-500/40"
                />
              </div>
            </div>
            {/* Filter pills */}
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-zinc-800/40 overflow-x-auto">
              {FILTER_STATES.map(s => {
                const count = s.key === 'ALL' ? stats.total : (stateCounts[s.stateKey || s.key] || 0)
                const isActive = (filterState === null && s.key === 'ALL') || filterState === s.key || (s.key === 'FAILED' && filterState === 'VALIDATION_FAILED')
                return (
                  <button
                    key={s.key}
                    onClick={() => setFilterState(s.key === 'ALL' ? null : s.stateKey || s.key)}
                    className={`text-[8px] font-mono tracking-wider px-1.5 py-0.5 rounded-md transition-all whitespace-nowrap flex items-center gap-1 ${
                      isActive
                        ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30'
                        : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/40'
                    }`}
                  >
                    {s.label}
                    {count > 0 && <span className={`text-[7px] ${isActive ? 'text-violet-400' : 'text-zinc-700'}`}>{count}</span>}
                  </button>
                )
              })}
            </div>

            {/* Jobs list */}
            <ScrollArea className="flex-1">
              <div className="p-1 space-y-0.5">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
                  </div>
                ) : displayedJobs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-600 gap-3">
                    <div className="w-12 h-12 rounded-xl bg-zinc-800/20 flex items-center justify-center">
                      <InboxIcon className="w-6 h-6 opacity-30" />
                    </div>
                    <span className="text-xs">No jobs found</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-zinc-800 text-zinc-400 hover:text-zinc-200" onClick={() => setShowComposer(true)}>
                      <Plus className="w-3 h-3" /> Create job
                    </Button>
                  </div>
                ) : (
                  displayedJobs.map(job => (
                    <motion.div
                      key={job.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedJob(job)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedJob(job) }}
                        className={`w-full text-left p-2.5 rounded-lg transition-all duration-150 group cursor-pointer ${
                          selectedJob?.id === job.id
                            ? 'bg-violet-500/10 border border-violet-500/20 shadow-lg shadow-violet-500/5'
                            : 'hover:bg-zinc-800/30 border border-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-zinc-300 truncate group-hover:text-zinc-100 transition-colors">{job.inputRequest}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <StateBadge state={job.state} />
                              <span className="text-[9px] text-zinc-600 font-mono">{timeAgo(job.createdAt)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {job.state === 'NEW' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleProcess(job) }}
                                className="p-1 rounded hover:bg-emerald-500/20 text-emerald-500 transition-colors"
                                title="Process"
                              >
                                <Play className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDuplicate(job) }}
                              className="p-1 rounded hover:bg-violet-500/20 text-violet-500 transition-colors"
                              title="Duplicate"
                            >
                              <Repeat className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(job.id) }}
                              className="p-1 rounded hover:bg-rose-500/20 text-rose-500 transition-colors"
                              title="Delete"
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

        <ResizableHandle withHandle className="bg-zinc-800/30 w-px hover:bg-violet-500/20 transition-colors" />

        {/* ─── Center Panel: Job Detail ──────────────────────── */}
        <ResizablePanel defaultSize={45} minSize={30}>
          <div className="flex flex-col h-full bg-[#0c0a14]">
            {selectedJob ? (
              <>
                {/* Job header */}
                <div className="px-4 py-2.5 border-b border-zinc-800/40 bg-[#0d0b15]/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <StateBadge state={selectedJob.state} size="md" />
                      <span className="text-[9px] font-mono text-zinc-600 bg-zinc-800/40 px-1.5 py-0.5 rounded">{selectedJob.id.slice(0, 8)}</span>
                      {selectedJob.partFamily && (
                        <Badge variant="outline" className="text-[8px] h-4 bg-violet-500/10 text-violet-400 border-violet-500/20 gap-0.5">
                          <Target className="w-2 h-2" />{selectedJob.partFamily.replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {['NEW', 'VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED', 'HUMAN_REVIEW'].includes(selectedJob.state) && (
                        <Button
                          size="sm"
                          className="h-6 text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20"
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
                            className="h-6 text-[10px] gap-1 bg-amber-600 hover:bg-amber-500"
                            onClick={() => { setSelectedJob({...selectedJob, state: 'NEW'}); handleProcess({...selectedJob, state: 'NEW'}) }}
                          >
                            <RotateCcw className="w-3 h-3" /> Reprocess
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 border-zinc-700/50 text-zinc-400" onClick={() => window.open(`/api/jobs/${selectedJob.id}/artifacts/scad`, '_blank')}>
                            <Download className="w-3 h-3" /> SCAD
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 border-zinc-700/50 text-zinc-400" onClick={() => window.open(`/api/jobs/${selectedJob.id}/artifacts/stl`, '_blank')}>
                            <Download className="w-3 h-3" /> STL
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-zinc-500 hover:text-violet-400" onClick={() => handleDuplicate(selectedJob)} title="Duplicate">
                        <Repeat className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-zinc-500 hover:text-rose-400" onClick={() => handleDelete(selectedJob.id)} title="Delete">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1.5">{selectedJob.inputRequest}</p>
                  {/* Metadata row */}
                  <div className="flex items-center gap-3 mt-1.5 text-[9px] font-mono text-zinc-600 flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{formatDate(selectedJob.createdAt)} {formatTime(selectedJob.createdAt)}</span>
                    {selectedJob.completedAt && <span className="flex items-center gap-1 text-lime-500"><CheckCircle2 className="w-2.5 h-2.5" />{formatTime(selectedJob.completedAt)}</span>}
                    {selectedJob.builderName && <span className="flex items-center gap-1 text-cyan-500"><Cpu className="w-2.5 h-2.5" />{selectedJob.builderName}</span>}
                    {selectedJob.renderLog && (() => {
                      const rl = parseJSON<Record<string, unknown> | null>(selectedJob.renderLog, null)
                      return rl?.render_time_ms ? <span className="flex items-center gap-1 text-cyan-400"><Zap className="w-2.5 h-2.5" />{rl.render_time_ms}ms</span> : null
                    })()}
                    {selectedJob.retryCount > 0 && <span className="flex items-center gap-1 text-amber-400"><RotateCcw className="w-2.5 h-2.5" />{selectedJob.retryCount} retries</span>}
                  </div>
                  {/* Processing progress */}
                  {isProcessing && processingState && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 mb-1">
                        <span className="flex items-center gap-1"><Activity className="w-2.5 h-2.5 animate-pulse text-amber-400" />Pipeline Progress</span>
                        <span className="text-amber-400">{getPipelineProgress(processingState)}%</span>
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
                <div className="w-20 h-20 rounded-2xl bg-zinc-800/20 flex items-center justify-center border border-zinc-800/30">
                  <Box className="w-10 h-10 opacity-20" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-500">Select a job to view details</p>
                  <p className="text-xs mt-1 text-zinc-700">Or create a new job to get started</p>
                </div>
                <Button size="sm" className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-600/20" onClick={() => setShowComposer(true)}>
                  <Plus className="w-3.5 h-3.5" /> New Job
                </Button>
                <div className="flex items-center gap-2 text-[9px] text-zinc-700 mt-2">
                  <Keyboard className="w-3 h-3" />
                  <span>Ctrl+N to create · ? for shortcuts</span>
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-zinc-800/30 w-px hover:bg-violet-500/20 transition-colors" />

        {/* ─── Right Panel: Inspector ────────────────────────── */}
        <ResizablePanel defaultSize={33} minSize={22} maxSize={45}>
          <div className="flex flex-col h-full bg-[#0e0c16]">
            {selectedJob ? (
              <Tabs value={rightTab} onValueChange={setRightTab} className="flex flex-col h-full">
                <TabsList className="w-full justify-start rounded-none border-b border-zinc-800/40 bg-transparent p-0 h-8 shrink-0 overflow-x-auto">
                  {[
                    { value: 'parameters', icon: Wrench, label: 'PARAMS' },
                    { value: 'research', icon: Globe, label: 'RESEARCH' },
                    { value: 'validation', icon: Shield, label: 'VALIDATE' },
                    { value: 'scad', icon: FileCode, label: 'SCAD' },
                    { value: 'timeline', icon: Clock, label: 'LOG' },
                    { value: 'chat', icon: MessageSquare, label: 'AI' },
                  ].map(tab => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="text-[8px] font-mono tracking-wider rounded-none border-b-2 border-transparent data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 h-8 shrink-0 gap-0.5 data-[state=active]:text-violet-300 text-zinc-600 hover:text-zinc-400"
                    >
                      <tab.icon className="w-2.5 h-2.5" />{tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="parameters" className="flex-1 min-h-0 mt-0" forceMount={rightTab !== 'parameters' ? false : undefined}>
                  <ParameterPanel job={selectedJob} onUpdate={loadJobs} />
                </TabsContent>
                <TabsContent value="research" className="flex-1 min-h-0 mt-0" forceMount={rightTab !== 'research' ? false : undefined}>
                  <ResearchPanel job={selectedJob} />
                </TabsContent>
                <TabsContent value="validation" className="flex-1 min-h-0 mt-0" forceMount={rightTab !== 'validation' ? false : undefined}>
                  <ValidationPanel job={selectedJob} />
                </TabsContent>
                <TabsContent value="scad" className="flex-1 min-h-0 mt-0" forceMount={rightTab !== 'scad' ? false : undefined}>
                  <ScadViewer code={selectedJob.scadSource} />
                </TabsContent>
                <TabsContent value="timeline" className="flex-1 min-h-0 mt-0" forceMount={rightTab !== 'timeline' ? false : undefined}>
                  <TimelinePanel job={selectedJob} />
                </TabsContent>
                <TabsContent value="chat" className="flex-1 min-h-0 mt-0" forceMount={rightTab !== 'chat' ? false : undefined}>
                  <ChatPanel job={selectedJob} />
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
              <Card className="bg-[#151222] border-zinc-800/60 shadow-2xl shadow-violet-500/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
                        <Zap className="w-3 h-3 text-white" />
                      </div>
                      New CAD Job
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-300" onClick={() => setShowComposer(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-[10px] font-mono text-zinc-500 tracking-wider uppercase mb-1.5 block">Describe your CAD request</label>
                    <Textarea
                      value={newRequest}
                      onChange={(e) => setNewRequest(e.target.value)}
                      placeholder="e.g. A 40mm×30mm×15mm electronics enclosure with 2mm walls"
                      className="min-h-[80px] bg-[#0c0a14] border-zinc-800/60 text-zinc-200 placeholder:text-zinc-700 focus:border-violet-500/40 resize-none text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCreate()
                      }}
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-[9px] text-zinc-600">
                      <span className="font-mono">{newRequest.length}/5000</span>
                      <span className="flex items-center gap-1"><Keyboard className="w-2.5 h-2.5" />⌘+Enter</span>
                    </div>
                    <Button
                      onClick={handleCreate}
                      disabled={!newRequest.trim() || isCreating}
                      className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-600/20"
                    >
                      {isCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      {isCreating ? 'Creating...' : 'Create Job'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Keyboard Shortcuts Modal ─────────────────────────── */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowShortcuts(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="bg-[#151222] border-zinc-800/60 shadow-2xl shadow-violet-500/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Keyboard className="w-4 h-4 text-violet-400" /> Keyboard Shortcuts
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-zinc-500" onClick={() => setShowShortcuts(false)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { keys: '⌘/Ctrl + N', action: 'New job' },
                      { keys: 'Escape', action: 'Close dialog' },
                      { keys: 'Delete', action: 'Delete selected job' },
                      { keys: '?', action: 'Show shortcuts' },
                    ].map(s => (
                      <div key={s.keys} className="flex items-center justify-between py-1">
                        <span className="text-xs text-zinc-400">{s.action}</span>
                        <kbd className="text-[9px] font-mono bg-zinc-800/50 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700/50">{s.keys}</kbd>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Footer ───────────────────────────────────────────── */}
      <footer className="flex items-center justify-between h-6 px-4 border-t border-zinc-800/40 bg-[#0f0d18] shrink-0 text-[9px] font-mono text-zinc-600">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Activity className="w-2.5 h-2.5 text-emerald-500" />Online</span>
          <Separator orientation="vertical" className="h-2.5 bg-zinc-800/50" />
          <span className="flex items-center gap-1"><Hash className="w-2.5 h-2.5" />{stats.total} jobs</span>
          <Separator orientation="vertical" className="h-2.5 bg-zinc-800/50" />
          <span className="flex items-center gap-1"><Timer className="w-2.5 h-2.5" />{uptimeSeconds}s</span>
        </div>
        <div className="flex items-center gap-3">
          <span>AgentSCAD Engine v0.2</span>
          <Separator orientation="vertical" className="h-2.5 bg-zinc-800/50" />
          <span className="flex items-center gap-1"><Gauge className="w-2.5 h-2.5" />SQLite</span>
        </div>
      </footer>
    </div>
  )
}
