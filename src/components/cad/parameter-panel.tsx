'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wrench, Loader2, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Job, ParameterDef, ParameterSchema, parseJSON, safeNum } from './types'
import { updateParameters } from './api'
import { staggerContainer, staggerChild, staggerTransition, slideInLeft, slideInLeftTransition } from './motion-presets'

export function ParameterPanel({
  job,
  onUpdate,
  onPreviewUpdate,
}: {
  job: Job
  onUpdate: () => void | Promise<void>
  onPreviewUpdate?: (parameterValues: Record<string, number>) => void
}) {
  // The parameterSchema in the DB can be either:
  // - A ParameterSchema object { part_family, design_summary, parameters: [...] }
  // - A raw ParameterDef[] array (from the process route)
  // Handle both formats
  const rawSchema = parseJSON<ParameterSchema | ParameterDef[] | null>(job.parameterSchema, null)
  const values = parseJSON<Record<string, number>>(job.parameterValues, {})
  const [localValues, setLocalValues] = useState(values)
  const [isUpdating, setIsUpdating] = useState(false)
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set())


  useEffect(() => {
    setLocalValues(values)
    setChangedKeys(new Set())
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

  const handleResetAll = useCallback(async () => {
    if (!schema) return
    const defaults: Record<string, number> = {}
    for (const p of schema.parameters) {
      defaults[p.key] = p.value
    }
    setLocalValues(defaults)
    setChangedKeys(new Set())
    onPreviewUpdate?.(defaults)
    setIsUpdating(true)
    try {
      await updateParameters(job.id, defaults)
      onUpdate()
      toast.success('Parameters reset', { description: 'All parameters reset to defaults' })
    } catch (err) {
      console.error('Parameter reset failed:', err)
      toast.error('Reset failed', { description: 'Failed to reset parameters' })
    } finally {
      setIsUpdating(false)
    }
  }, [schema, job.id, onPreviewUpdate, onUpdate])

  if (!schema) return (
    <div className="flex flex-col items-center justify-center h-full text-[var(--app-text-dim)] gap-3 p-6">
      <div className="w-12 h-12 rounded-xl bg-[var(--app-empty-bg)] flex items-center justify-center">
        <Wrench className="w-6 h-6 opacity-30" />
      </div>
      <div className="text-center">
        <p className="text-sm">No parameters available</p>
        <p className="text-[13px] text-[var(--app-text-dim)] mt-1">Process a job to generate parameters</p>
      </div>
    </div>
  )

  const groups = [...new Set(schema.parameters.map(p => p.group || 'general'))]

  const handleParamChange = (key: string, value: number, defaultValue: number) => {
    const newValues = { ...localValues, [key]: value }
    setLocalValues(newValues)
    onPreviewUpdate?.(newValues)
    // Track changed keys for pulse animation
    if (value !== defaultValue) {
      setChangedKeys(prev => new Set(prev).add(key))
    } else {
      setChangedKeys(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const handleParamCommit = async (key: string, value: number) => {
    const newValues = { ...localValues, [key]: value }
    setIsUpdating(true)
    try {
      await updateParameters(job.id, newValues)
      onUpdate()
      toast.success('Parameter saved', {
        description: `Set ${key} to ${value}`,
      })
    } catch (err) {
      console.error('Parameter update failed:', err)
      toast.error('Render failed', {
        description: err instanceof Error ? err.message : 'Failed to save parameter change',
        duration: 4000,
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleResetParam = async (key: string, defaultValue: number) => {
    const newValues = { ...localValues, [key]: defaultValue }
    setLocalValues(newValues)
    setChangedKeys(prev => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    onPreviewUpdate?.(newValues)
    setIsUpdating(true)
    try {
      await updateParameters(job.id, newValues)
      onUpdate()
      toast.success('Parameter reset', { description: `${key} reset to default` })
    } catch (err) {
      console.error('Parameter reset failed:', err)
      toast.error('Reset failed', { description: 'Failed to reset parameter' })
    } finally {
      setIsUpdating(false)
    }
  }

  const sourceColor: Record<string, string> = {
    user: 'text-sky-400',
    inferred: 'text-amber-400',
    design_derived: 'text-[var(--cad-accent)]',
    engineering: 'text-emerald-400',
    derived: 'text-cyan-400',
    llm_declared: 'text-emerald-400',
  }
  const changedCount = changedKeys.size

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-[color:var(--app-border)] px-3 py-1.5">
        <h3 className="text-[13px] font-mono tracking-widest text-[var(--app-text-muted)] uppercase">Parameters</h3>
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {changedCount > 0 && (
            <Badge variant="outline" className="text-xs h-4 bg-[var(--cad-accent-soft)] text-[var(--cad-accent)] border-[color:var(--cad-border)]">
              {changedCount} changed
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-xs gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-accent-text)]"
            onClick={handleResetAll}
            disabled={isUpdating}
          >
            <RotateCcw className="w-2.5 h-2.5" />
            Reset All
          </Button>
          <Badge variant="outline" className="text-xs h-4 bg-[var(--app-surface-raised)] text-[var(--app-text-muted)] border-[color:var(--app-border)]">
            {schema.parameters.length} params
          </Badge>
          {isUpdating && (
            <span className="flex items-center gap-1 text-xs font-mono text-[var(--cad-measure)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              saving
            </span>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <motion.div
          className="space-y-4 p-3 pb-24"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {groups.map((group, groupIdx) => (
            <motion.div
              key={group}
              variants={staggerChild}
              transition={staggerTransition}
              className={`rounded-lg border border-[color:var(--app-border)] bg-[var(--app-surface)] p-3 ${groupIdx > 0 ? 'border-t-[color:var(--cad-accent-soft)]' : ''}`}
            >
              <div className="text-xs font-mono tracking-widest text-[var(--app-text-dim)] uppercase mb-3 px-1 flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-[var(--cad-accent)] opacity-70" />
                {group}
              </div>
              <motion.div
                className="space-y-3"
                variants={staggerContainer}
                initial="initial"
                animate="animate"
              >
                {schema.parameters.filter(p => (p.group || 'general') === group).map(param => {
                  const min = safeNum(param.min, 0)
                  const max = safeNum(param.max, 100)
                  const step = safeNum(param.step, 1)
                  const value = safeNum(localValues[param.key], param.value)
                  const fillPercent = max > min ? ((value - min) / (max - min)) * 100 : 0
                  const isChanged = changedKeys.has(param.key) || (localValues[param.key] !== undefined && localValues[param.key] !== param.value)
                  const delta = value - safeNum(param.value, 0)
                  const precision = step < 1 ? 1 : 0

                  return (
                    <motion.div
                      key={param.key}
                      variants={slideInLeft}
                      transition={{ ...slideInLeftTransition, delay: 0.02 }}
                      className={`space-y-1 group/param relative ${isChanged ? 'ring-1 ring-[color:var(--cad-accent-soft)] rounded-md p-1.5 -m-1.5' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-[var(--app-text-secondary)] group-hover/param:text-[var(--app-text-primary)] transition-colors">{param.label}</span>
                          <span className={`text-[8px] font-mono px-1 py-0.5 rounded ${sourceColor[param.source] || 'text-[var(--app-text-muted)]'} bg-[var(--app-surface-raised)]`}>
                            {param.source.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <motion.span
                            className="text-xs font-mono text-[var(--app-text-primary)] tabular-nums"
                            key={value}
                            initial={{ scale: 1.15, color: 'var(--cad-accent)' }}
                            animate={{ scale: 1, color: '#e4e4e7' }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                          >
                            {typeof localValues[param.key] === 'number' ? localValues[param.key].toFixed(precision) : param.value?.toFixed(precision) ?? '0'}
                          </motion.span>
                          <span className="text-xs text-[var(--app-text-dim)]">{param.unit}</span>
                          {isChanged && (
                            <span className="rounded bg-[var(--cad-accent-soft)] px-1 py-0.5 text-[8px] font-mono text-[var(--cad-accent)]">
                              {delta > 0 ? '+' : ''}{delta.toFixed(precision)}
                            </span>
                          )}
                          {/* Reset to default button - appears on hover */}
                          <AnimatePresence>
                            {isChanged && (
                              <motion.button
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.7 }}
                                transition={{ duration: 0.15 }}
                                onClick={() => handleResetParam(param.key, param.value)}
                                className="ml-1 p-0.5 rounded hover:bg-[var(--app-surface-raised)] text-[var(--app-text-muted)] hover:text-[var(--app-accent-text)] transition-colors"
                                title="Reset to default"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                              </motion.button>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                      {param.kind === 'number' || param.kind === 'float' || param.kind === 'integer' ? (
                        <div className="relative py-1">
                          {/* Custom colored fill indicator behind the slider */}
                          <div className="absolute top-1/2 left-0 -translate-y-1/2 h-2 rounded-full pointer-events-none overflow-hidden w-full bg-[var(--cad-border)]">
                            <div
                              className="h-full bg-[var(--cad-accent-soft)] rounded-full transition-all duration-150"
                              style={{ width: `${fillPercent}%` }}
                            />
                          </div>
                          <Slider
                            value={[value]}
                            min={min}
                            max={max}
                            step={step}
                            onValueChange={([v]) => handleParamChange(param.key, v, param.value)}
                            onValueCommit={([v]) => handleParamCommit(param.key, v)}
                            disabled={isUpdating || !param.editable}
                            className="py-0.5 relative z-10"
                          />
                          <div className="pointer-events-none absolute left-0 right-0 top-1/2 z-0 flex -translate-y-1/2 justify-between px-0.5">
                            {Array.from({ length: 5 }).map((_, idx) => (
                              <span key={idx} className="h-2.5 w-px bg-[var(--cad-border-strong)] opacity-60" />
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="flex justify-between text-[8px] text-[var(--app-text-dim)] font-mono">
                        <span>{min}</span>
                        <span className="text-[8px] font-mono text-[var(--app-text-dim)]">{param.key}</span>
                        <span>{max} {param.unit}</span>
                      </div>
                      {param.description && (
                        <p className="text-[13px] text-[var(--app-text-dim)] leading-relaxed hidden group-hover/param:block transition-all">{param.description}</p>
                      )}
                    </motion.div>
                  )
                })}
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

export function SchemaInfoPanel({ schemaStr }: { schemaStr: string }) {
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
  if (!schema) return <span className="text-[var(--app-text-dim)] text-xs">Invalid schema</span>

  const sourceCounts: Record<string, number> = {}
  for (const p of schema.parameters) {
    sourceCounts[p.source] = (sourceCounts[p.source] || 0) + 1
  }

  const sourceColor: Record<string, string> = {
    user: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    inferred: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    design_derived: 'bg-[var(--cad-accent-soft)] text-[var(--cad-accent)] border-[color:var(--cad-border)]',
    engineering: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    derived: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[8px] h-4 bg-[var(--app-surface-raised)] text-[var(--app-text-muted)] border-[color:var(--app-border)]">
          {schema.part_family || 'unknown'}
        </Badge>
        <Badge variant="outline" className="text-[8px] h-4 bg-[var(--app-surface-raised)] text-[var(--app-text-muted)] border-[color:var(--app-border)]">
          {schema.parameters.length} params
        </Badge>
        {Object.entries(sourceCounts).map(([source, count]) => (
          <Badge key={source} variant="outline" className={`text-[8px] h-4 ${sourceColor[source] || 'bg-[var(--app-surface-raised)] text-[var(--app-text-muted)] border-[color:var(--app-border)]'}`}>
            {count} {source.replace('_', ' ')}
          </Badge>
        ))}
      </div>
      {schema.design_summary && (
        <p className="text-[13px] text-[var(--app-text-muted)] leading-relaxed">{schema.design_summary}</p>
      )}
    </div>
  )
}
