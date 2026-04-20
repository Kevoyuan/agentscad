'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Layers, Sliders, ApplyTemplate } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Job, parseJSON, ParameterDef } from './types'
import { batchUpdateParameters } from './api'

// ─── Types ────────────────────────────────────────────────────────────────

interface BatchParameterEditorProps {
  selectedJobs: Job[]
  onApply: () => void
}

interface CommonParam {
  key: string
  label: string
  unit: string
  min: number
  max: number
  step: number
  currentMin: number
  currentMax: number
  schema: ParameterDef
}

// ─── Component ────────────────────────────────────────────────────────────

export function BatchParameterEditor({ selectedJobs, onApply }: BatchParameterEditorProps) {
  const [editValues, setEditValues] = useState<Record<string, number>>({})
  const [isApplying, setIsApplying] = useState(false)

  // Find common parameters across all selected jobs
  const commonParams = useMemo(() => {
    if (selectedJobs.length < 2) return []

    // Parse all schemas and values
    const schemasWithValues = selectedJobs.map(job => {
      const schema = parseJSON<{ parameters: ParameterDef[] }>(job.parameterSchema, { parameters: [] })
      const values = parseJSON<Record<string, number>>(job.parameterValues, {})
      return { schema: schema.parameters || [], values, job }
    })

    // Find intersection of parameter keys
    const allKeySets = schemasWithValues.map(s => new Set(s.schema.map(p => p.key)))
    if (allKeySets.length === 0) return []

    const commonKeys = new Set(allKeySets[0])
    for (let i = 1; i < allKeySets.length; i++) {
      for (const key of commonKeys) {
        if (!allKeySets[i].has(key)) commonKeys.delete(key)
      }
    }

    // Build common params with range info
    const result: CommonParam[] = []
    for (const key of commonKeys) {
      // Get schema from first job
      const firstSchema = schemasWithValues[0].schema.find(p => p.key === key)
      if (!firstSchema || firstSchema.kind !== 'number') continue

      const values = schemasWithValues.map(s => s.values[key]).filter(v => typeof v === 'number') as number[]
      if (values.length === 0) continue

      result.push({
        key,
        label: firstSchema.label || key,
        unit: firstSchema.unit || '',
        min: firstSchema.min ?? 0,
        max: firstSchema.max ?? 100,
        step: firstSchema.step ?? 1,
        currentMin: Math.min(...values),
        currentMax: Math.max(...values),
        schema: firstSchema,
      })
    }

    return result
  }, [selectedJobs])

  const handleSliderChange = useCallback((key: string, value: number) => {
    setEditValues(prev => ({ ...prev, [key]: value }))
  }, [])

  const hasEdits = Object.keys(editValues).length > 0

  const handleApply = async () => {
    if (!hasEdits) return
    setIsApplying(true)
    try {
      const jobIds = selectedJobs.map(j => j.id)
      await batchUpdateParameters(jobIds, editValues)
      setEditValues({})
      onApply()
    } catch (err) {
      console.error('Batch update failed:', err)
    } finally {
      setIsApplying(false)
    }
  }

  if (selectedJobs.length < 2 || commonParams.length === 0) {
    return null
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
    >
      <div className="border-t border-[color:var(--app-border)] bg-[var(--app-surface)]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/40">
          <div className="flex items-center gap-2">
            <Sliders className="w-3 h-3 text-violet-400" />
            <span className="text-[9px] font-mono tracking-widest text-violet-300 uppercase">Batch Edit</span>
            <Badge variant="outline" className="text-[8px] h-3.5 bg-violet-600/10 text-violet-400 border-violet-500/30">
              {selectedJobs.length} jobs
            </Badge>
            <Badge variant="outline" className="text-[8px] h-3.5 bg-zinc-800/50 text-zinc-500 border-zinc-700/50">
              {commonParams.length} params
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[8px] gap-1 text-zinc-500 hover:text-zinc-300"
              onClick={() => setEditValues({})}
              disabled={!hasEdits}
            >
              Reset
            </Button>
            <Button
              size="sm"
              className={`h-5 text-[8px] gap-1 ${
                hasEdits
                  ? 'bg-violet-600 hover:bg-violet-500'
                  : 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
              }`}
              onClick={handleApply}
              disabled={!hasEdits || isApplying}
            >
              {isApplying ? (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }} className="w-2.5 h-2.5 border border-violet-300 border-t-transparent rounded-full" />
              ) : (
                <ApplyTemplate className="w-2.5 h-2.5" />
              )}
              {isApplying ? 'Applying...' : `Apply to ${selectedJobs.length}`}
            </Button>
          </div>
        </div>

        {/* Parameters */}
        <ScrollArea className="max-h-48">
          <div className="p-3 space-y-2">
            {commonParams.map(param => {
              const editValue = editValues[param.key]
              const hasChange = editValue !== undefined
              const displayValue = hasChange ? editValue : `${param.currentMin}–${param.currentMax}`

              return (
                <div key={param.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-zinc-300">{param.label}</span>
                      <span className="text-[8px] font-mono text-zinc-600">{param.key}</span>
                      {param.unit && <span className="text-[8px] text-zinc-700">{param.unit}</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {hasChange && (
                        <span className="text-[8px] text-zinc-600">
                          was {param.currentMin === param.currentMax ? param.currentMin : `${param.currentMin}–${param.currentMax}`}
                        </span>
                      )}
                      <span className={`text-[10px] font-mono ${hasChange ? 'text-violet-300' : 'text-zinc-400'}`}>
                        {typeof displayValue === 'number' ? displayValue.toFixed(param.step < 1 ? 1 : 0) : displayValue}
                        {param.unit ? ` ${param.unit}` : ''}
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    value={hasChange ? editValue : (param.currentMin + param.currentMax) / 2}
                    onChange={e => handleSliderChange(param.key, Number(e.target.value))}
                    className={`w-full h-1 rounded-full appearance-none cursor-pointer accent-violet-500 ${
                      hasChange ? 'accent-violet-500' : 'accent-zinc-600'
                    }`}
                  />
                  <div className="flex justify-between text-[7px] text-zinc-700 font-mono">
                    <span>{param.min}</span>
                    <span>{param.max}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </motion.div>
  )
}
