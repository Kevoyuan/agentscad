'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  fadeInUp,
  fadeInUpTransition,
  staggerContainer,
  staggerChild,
  staggerTransition,
} from './motion-presets'
import {
  Job,
  ParameterDef,
  ParameterSchema,
  ValidationResult,
  parseJSON,
  getStateInfo,
} from './types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface JobCompareProps {
  jobs: Job[]
}

type TabKey = 'parameters' | 'validation' | 'scad'

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeSchema(
  raw: string | null
): ParameterSchema | null {
  if (!raw) return null
  const parsed = parseJSON<ParameterDef[] | ParameterSchema>(raw, null as unknown as ParameterDef[] | ParameterSchema)
  if (!parsed) return null
  if (Array.isArray(parsed)) {
    return { part_family: '', design_summary: '', parameters: parsed }
  }
  return parsed as ParameterSchema
}

function compareValue(
  a: number | string,
  b: number | string
): 'higher' | 'lower' | 'equal' {
  const na = typeof a === 'number' ? a : parseFloat(a as string)
  const nb = typeof b === 'number' ? b : parseFloat(b as string)
  if (isNaN(na) || isNaN(nb)) return 'equal'
  if (na > nb) return 'higher'
  if (na < nb) return 'lower'
  return 'equal'
}

// ─── Parameter Comparison Row ───────────────────────────────────────────────

function ParamRow({
  label,
  unit,
  leftVal,
  rightVal,
}: {
  label: string
  unit: string
  leftVal: number
  rightVal: number
}) {
  const diff = compareValue(leftVal, rightVal)

  return (
    <div className="grid grid-cols-[1fr_100px_20px_100px] items-center gap-1 py-1 px-2 border-b border-zinc-800/40 last:border-0">
      <span className="text-[11px] text-zinc-400 truncate">{label}</span>
      <span
        className={`text-[11px] font-mono text-right tabular-nums ${
          diff === 'higher'
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'text-zinc-300'
        }`}
      >
        {leftVal}
        {unit && <span className="text-zinc-600 ml-0.5">{unit}</span>}
      </span>
      <span className="flex items-center justify-center">
        {diff !== 'equal' ? (
          <ArrowLeftRight className="w-3 h-3 text-zinc-600" />
        ) : (
          <span className="w-3 h-px bg-zinc-700" />
        )}
      </span>
      <span
        className={`text-[11px] font-mono tabular-nums ${
          diff === 'lower'
            ? 'bg-rose-500/10 text-rose-400'
            : diff === 'higher'
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'text-zinc-300'
        }`}
      >
        {rightVal}
        {unit && <span className="text-zinc-600 ml-0.5">{unit}</span>}
      </span>
    </div>
  )
}

// ─── Validation Comparison Row ──────────────────────────────────────────────

function ValidationRow({
  ruleName,
  leftPassed,
  rightPassed,
  isCritical,
}: {
  ruleName: string
  leftPassed: boolean
  rightPassed: boolean
  isCritical: boolean
}) {
  const bothSame = leftPassed === rightPassed

  return (
    <div
      className={`grid grid-cols-[1fr_40px_20px_40px] items-center gap-1 py-1.5 px-2 border-b border-zinc-800/40 last:border-0 ${
        !bothSame ? 'bg-amber-500/5' : ''
      }`}
    >
      <span className="text-[11px] text-zinc-400 truncate flex items-center gap-1.5">
        {isCritical && <AlertTriangle className="w-3 h-3 text-amber-500/60 flex-shrink-0" />}
        {ruleName}
      </span>
      <span className="flex items-center justify-center">
        {leftPassed ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-rose-400" />
        )}
      </span>
      <span className="flex items-center justify-center">
        {!bothSame && <span className="w-1 h-1 rounded-full bg-amber-400" />}
      </span>
      <span className="flex items-center justify-center">
        {rightPassed ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-rose-400" />
        )}
      </span>
    </div>
  )
}

// ─── SCAD Comparison ────────────────────────────────────────────────────────

function ScadCompare({ left, right }: { left: string | null; right: string | null }) {
  const leftLines = (left || '').split('\n')
  const rightLines = (right || '').split('\n')
  const maxLines = Math.max(leftLines.length, rightLines.length)

  return (
    <div className="grid grid-cols-2 gap-0 divide-x divide-zinc-800/60 font-mono text-[10px]">
      <div className="overflow-auto max-h-60 p-2">
        {leftLines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-6 text-right text-zinc-700 mr-2 select-none flex-shrink-0">
              {i + 1}
            </span>
            <span className="text-zinc-400 whitespace-pre">{line || ' '}</span>
          </div>
        ))}
      </div>
      <div className="overflow-auto max-h-60 p-2">
        {rightLines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-6 text-right text-zinc-700 mr-2 select-none flex-shrink-0">
              {i + 1}
            </span>
            <span className="text-zinc-400 whitespace-pre">{line || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function JobCompare({ jobs }: JobCompareProps) {
  const [leftId, setLeftId] = useState<string>('')
  const [rightId, setRightId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabKey>('parameters')

  const leftJob = useMemo(() => jobs.find((j) => j.id === leftId), [jobs, leftId])
  const rightJob = useMemo(() => jobs.find((j) => j.id === rightId), [jobs, rightId])

  const leftSchema = useMemo(() => normalizeSchema(leftJob?.parameterSchema || null), [leftJob])
  const rightSchema = useMemo(() => normalizeSchema(rightJob?.parameterSchema || null), [rightJob])

  const leftValues = useMemo(
    () => parseJSON<Record<string, number>>(leftJob?.parameterValues || null, {}),
    [leftJob]
  )
  const rightValues = useMemo(
    () => parseJSON<Record<string, number>>(rightJob?.parameterValues || null, {}),
    [rightJob]
  )

  const leftValidation = useMemo(
    () => parseJSON<ValidationResult[]>(leftJob?.validationResults || null, []),
    [leftJob]
  )
  const rightValidation = useMemo(
    () => parseJSON<ValidationResult[]>(rightJob?.validationResults || null, []),
    [rightJob]
  )

  // Merge parameter keys from both schemas
  const allParams = useMemo(() => {
    const map = new Map<string, ParameterDef>()
    if (leftSchema) {
      for (const p of leftSchema.parameters) map.set(p.key, p)
    }
    if (rightSchema) {
      for (const p of rightSchema.parameters) {
        if (!map.has(p.key)) map.set(p.key, p)
      }
    }
    return Array.from(map.values())
  }, [leftSchema, rightSchema])

  // Merge validation rules from both jobs
  const allValidationRules = useMemo(() => {
    const map = new Map<string, { rule_name: string; is_critical: boolean }>()
    for (const v of leftValidation) {
      map.set(v.rule_id, { rule_name: v.rule_name, is_critical: v.is_critical })
    }
    for (const v of rightValidation) {
      if (!map.has(v.rule_id)) {
        map.set(v.rule_id, { rule_name: v.rule_name, is_critical: v.is_critical })
      }
    }
    return Array.from(map.entries())
  }, [leftValidation, rightValidation])

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'parameters', label: 'PARAMS' },
    { key: 'validation', label: 'VALIDATION' },
    { key: 'scad', label: 'SCAD' },
  ]

  return (
    <motion.div
      className="w-full"
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={fadeInUpTransition}
    >
      {/* Header with job selectors */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <ArrowLeftRight className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-zinc-200 tracking-wide">
            Compare Jobs
          </h2>
        </div>
      </div>

      {/* Job selectors */}
      <div className="grid grid-cols-[1fr_20px_1fr] gap-2 mb-4 items-center">
        <Select value={leftId} onValueChange={setLeftId}>
          <SelectTrigger className="h-8 bg-zinc-900/60 border-zinc-800/60 text-zinc-300 text-xs">
            <SelectValue placeholder="Select job A..." />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            {jobs.map((j) => (
              <SelectItem key={j.id} value={j.id} className="text-xs">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{
                    backgroundColor: getStateInfo(j.state).dot.replace('bg-', ''),
                  }} />
                  <span className="truncate max-w-40">{j.inputRequest.slice(0, 30)}</span>
                  <span className="text-zinc-600 font-mono">{j.id.slice(0, 6)}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center justify-center">
          <span className="text-zinc-700">vs</span>
        </div>

        <Select value={rightId} onValueChange={setRightId}>
          <SelectTrigger className="h-8 bg-zinc-900/60 border-zinc-800/60 text-zinc-300 text-xs">
            <SelectValue placeholder="Select job B..." />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            {jobs.map((j) => (
              <SelectItem key={j.id} value={j.id} className="text-xs">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{
                    backgroundColor: getStateInfo(j.state).dot.replace('bg-', ''),
                  }} />
                  <span className="truncate max-w-40">{j.inputRequest.slice(0, 30)}</span>
                  <span className="text-zinc-600 font-mono">{j.id.slice(0, 6)}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`
              text-[10px] font-mono tracking-widest px-3 py-1.5 rounded-md transition-all
              ${
                activeTab === tab.key
                  ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                  : 'text-zinc-600 hover:text-zinc-400 border border-transparent'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Comparison content */}
      <AnimatePresence mode="wait">
        {!leftJob || !rightJob ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center py-12 text-zinc-600 text-xs"
          >
            Select two jobs to compare
          </motion.div>
        ) : (
          <motion.div
            key={`${leftId}-${rightId}-${activeTab}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 overflow-hidden"
          >
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_100px_20px_100px] items-center gap-1 px-2 py-1.5 bg-zinc-800/30 border-b border-zinc-800/60">
              <span className="text-[9px] font-mono text-zinc-600 tracking-widest uppercase">
                {activeTab === 'parameters' ? 'Parameter' : activeTab === 'validation' ? 'Rule' : ''}
              </span>
              <span className="text-[9px] font-mono text-zinc-600 tracking-widest uppercase text-right">
                Job A
              </span>
              <span />
              <span className="text-[9px] font-mono text-zinc-600 tracking-widest uppercase">
                Job B
              </span>
            </div>

            {/* Content based on tab */}
            {activeTab === 'parameters' && (
              <div className="max-h-80 overflow-y-auto">
                {allParams.length === 0 ? (
                  <div className="py-6 text-center text-[10px] text-zinc-600">
                    No parameters to compare
                  </div>
                ) : (
                  allParams.map((param) => (
                    <ParamRow
                      key={param.key}
                      label={param.label || param.key}
                      unit={param.unit}
                      leftVal={leftValues[param.key] ?? param.value}
                      rightVal={rightValues[param.key] ?? param.value}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === 'validation' && (
              <div className="max-h-80 overflow-y-auto">
                {allValidationRules.length === 0 ? (
                  <div className="py-6 text-center text-[10px] text-zinc-600">
                    No validation results to compare
                  </div>
                ) : (
                  allValidationRules.map(([ruleId, meta]) => {
                    const leftResult = leftValidation.find((v) => v.rule_id === ruleId)
                    const rightResult = rightValidation.find((v) => v.rule_id === ruleId)
                    return (
                      <ValidationRow
                        key={ruleId}
                        ruleName={meta.rule_name}
                        leftPassed={leftResult?.passed ?? false}
                        rightPassed={rightResult?.passed ?? false}
                        isCritical={meta.is_critical}
                      />
                    )
                  })
                )}
              </div>
            )}

            {activeTab === 'scad' && (
              <ScadCompare
                left={leftJob.scadSource}
                right={rightJob.scadSource}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
