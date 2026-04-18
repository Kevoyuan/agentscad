'use client'

import { useState, useEffect, useRef } from 'react'
import { Wrench, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Slider } from '@/components/ui/slider'
import { useToast } from '@/hooks/use-toast'
import { Job, ParameterDef, ParameterSchema, parseJSON, safeNum } from './types'
import { updateParameters } from './api'

export function ParameterPanel({ job, onUpdate }: { job: Job; onUpdate: () => void }) {
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
