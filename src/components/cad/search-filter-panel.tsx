'use client'

import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, SlidersHorizontal, X, ChevronDown, ChevronUp,
  Calendar, Filter, ArrowUpDown, RotateCcw, Hash,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Job, FILTER_STATES, getStateInfo } from './types'
import { StateBadge } from './state-badge'

// ─── Filter Types ───────────────────────────────────────────────────────────

export interface FilterState {
  search: string
  states: string[]
  priorityMin: number
  priorityMax: number
  dateRange: 'all' | 'today' | 'week' | 'month' | 'custom'
  dateFrom: string | null
  dateTo: string | null
  partFamily: string | null
  builderName: string | null
  sortBy: 'priority' | 'created' | 'updated' | 'state'
  sortOrder: 'asc' | 'desc'
}

export const DEFAULT_FILTER_STATE: FilterState = {
  search: '',
  states: [],
  priorityMin: 1,
  priorityMax: 10,
  dateRange: 'all',
  dateFrom: null,
  dateTo: null,
  partFamily: null,
  builderName: null,
  sortBy: 'priority',
  sortOrder: 'desc',
}

// ─── Filter Functions ───────────────────────────────────────────────────────

export function applyFilters(jobs: Job[], filters: FilterState): Job[] {
  let result = [...jobs]

  // Search filter
  if (filters.search) {
    const q = filters.search.toLowerCase()
    result = result.filter(j =>
      j.inputRequest.toLowerCase().includes(q) ||
      j.id.toLowerCase().includes(q) ||
      (j.builderName && j.builderName.toLowerCase().includes(q)) ||
      (j.partFamily && j.partFamily.toLowerCase().includes(q))
    )
  }

  // State filter (multi-select)
  if (filters.states.length > 0) {
    result = result.filter(j => {
      return filters.states.some(s => {
        if (s === 'FAILED') return ['VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED'].includes(j.state)
        return j.state === s
      })
    })
  }

  // Priority range
  result = result.filter(j => j.priority >= filters.priorityMin && j.priority <= filters.priorityMax)

  // Date range
  const now = new Date()
  if (filters.dateRange === 'today') {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    result = result.filter(j => new Date(j.createdAt) >= startOfDay)
  } else if (filters.dateRange === 'week') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    result = result.filter(j => new Date(j.createdAt) >= weekAgo)
  } else if (filters.dateRange === 'month') {
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    result = result.filter(j => new Date(j.createdAt) >= monthAgo)
  } else if (filters.dateRange === 'custom' && filters.dateFrom) {
    const from = new Date(filters.dateFrom)
    result = result.filter(j => new Date(j.createdAt) >= from)
    if (filters.dateTo) {
      const to = new Date(filters.dateTo)
      to.setHours(23, 59, 59, 999)
      result = result.filter(j => new Date(j.createdAt) <= to)
    }
  }

  // Part family filter
  if (filters.partFamily) {
    result = result.filter(j => j.partFamily === filters.partFamily)
  }

  // Builder name filter
  if (filters.builderName) {
    result = result.filter(j => j.builderName === filters.builderName)
  }

  // Sort
  result.sort((a, b) => {
    let cmp = 0
    switch (filters.sortBy) {
      case 'priority':
        cmp = a.priority - b.priority
        break
      case 'created':
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        break
      case 'updated':
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        break
      case 'state':
        cmp = a.state.localeCompare(b.state)
        break
    }
    return filters.sortOrder === 'desc' ? -cmp : cmp
  })

  return result
}

export function countActiveFilters(filters: FilterState): number {
  let count = 0
  if (filters.search) count++
  if (filters.states.length > 0) count++
  if (filters.priorityMin !== 1 || filters.priorityMax !== 10) count++
  if (filters.dateRange !== 'all') count++
  if (filters.partFamily) count++
  if (filters.builderName) count++
  if (filters.sortBy !== 'priority' || filters.sortOrder !== 'desc') count++
  return count
}

// ─── URL Params Serialization ───────────────────────────────────────────────

export function filtersToUrlParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.search) params.set('q', filters.search)
  if (filters.states.length > 0) params.set('states', filters.states.join(','))
  if (filters.priorityMin !== 1) params.set('pmin', String(filters.priorityMin))
  if (filters.priorityMax !== 10) params.set('pmax', String(filters.priorityMax))
  if (filters.dateRange !== 'all') params.set('dr', filters.dateRange)
  if (filters.dateFrom) params.set('df', filters.dateFrom)
  if (filters.dateTo) params.set('dt', filters.dateTo)
  if (filters.partFamily) params.set('pf', filters.partFamily)
  if (filters.builderName) params.set('bn', filters.builderName)
  if (filters.sortBy !== 'priority') params.set('sort', filters.sortBy)
  if (filters.sortOrder !== 'desc') params.set('order', filters.sortOrder)
  return params
}

export function urlParamsToFilters(params: URLSearchParams): Partial<FilterState> {
  const filters: Partial<FilterState> = {}
  if (params.get('q')) filters.search = params.get('q')!
  if (params.get('states')) filters.states = params.get('states')!.split(',').filter(Boolean)
  if (params.get('pmin')) filters.priorityMin = Number(params.get('pmin'))
  if (params.get('pmax')) filters.priorityMax = Number(params.get('pmax'))
  if (params.get('dr')) filters.dateRange = params.get('dr') as FilterState['dateRange']
  if (params.get('df')) filters.dateFrom = params.get('df')
  if (params.get('dt')) filters.dateTo = params.get('dt')
  if (params.get('pf')) filters.partFamily = params.get('pf')
  if (params.get('bn')) filters.builderName = params.get('bn')
  if (params.get('sort')) filters.sortBy = params.get('sort') as FilterState['sortBy']
  if (params.get('order')) filters.sortOrder = params.get('order') as FilterState['sortOrder']
  return filters
}

// ─── Search Filter Panel Component ──────────────────────────────────────────

interface SearchFilterPanelProps {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  allJobs: Job[]
  stateCounts: Record<string, number>
}

const ALL_STATES = [
  'NEW', 'SCAD_GENERATED', 'RENDERED', 'VALIDATED',
  'DELIVERED', 'CANCELLED', 'VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED',
]

const DATE_OPTIONS = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
]

const SORT_OPTIONS = [
  { key: 'priority', label: 'Priority' },
  { key: 'created', label: 'Created' },
  { key: 'updated', label: 'Updated' },
  { key: 'state', label: 'State' },
]

export function SearchFilterPanel({
  filters,
  onFiltersChange,
  allJobs,
  stateCounts,
}: SearchFilterPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const activeCount = countActiveFilters(filters)

  // Extract unique values from jobs for filter options
  const partFamilies = useMemo(() => {
    const families = new Set<string>()
    allJobs.forEach(j => { if (j.partFamily) families.add(j.partFamily) })
    return Array.from(families).sort()
  }, [allJobs])

  const builderNames = useMemo(() => {
    const names = new Set<string>()
    allJobs.forEach(j => { if (j.builderName) names.add(j.builderName) })
    return Array.from(names).sort()
  }, [allJobs])

  const updateFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onFiltersChange({ ...filters, [key]: value })
  }, [filters, onFiltersChange])

  const toggleState = useCallback((state: string) => {
    const next = filters.states.includes(state)
      ? filters.states.filter(s => s !== state)
      : [...filters.states, state]
    updateFilter('states', next)
  }, [filters.states, updateFilter])

  const clearAll = useCallback(() => {
    onFiltersChange(DEFAULT_FILTER_STATE)
  }, [onFiltersChange])

  return (
    <div className="border-b border-[color:var(--app-border)]">
      {/* Search Row - Always visible */}
      <div className="px-3 py-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--app-text-dim)]" />
          <Input
            value={filters.search}
            onChange={e => updateFilter('search', e.target.value)}
            placeholder="Search jobs... (⌘K for command palette)"
            className="h-7 pl-7 pr-7 text-[11px] bg-[var(--app-bg)] border-[color:var(--app-border)] placeholder:text-[var(--app-text-dim)]"
            suppressHydrationWarning
          />
          {filters.search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--app-text-dim)] hover:text-[var(--app-text-muted)] transition-colors"
              onClick={() => updateFilter('search', '')}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 px-1.5 gap-1 text-[9px] font-mono ${filters.sortBy === 'created' && filters.sortOrder === 'desc' ? 'bg-[var(--app-accent-bg)] text-[var(--app-accent-text)]' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]'}`}
                onClick={() => {
                  if (filters.sortBy === 'created' && filters.sortOrder === 'desc') {
                    onFiltersChange({ ...filters, sortBy: 'priority', sortOrder: 'desc' })
                  } else {
                    onFiltersChange({ ...filters, sortBy: 'created', sortOrder: 'desc' })
                  }
                }}
              >
                <Clock className="w-3 h-3" />
                {filters.sortBy === 'created' && filters.sortOrder === 'desc' ? 'Time' : 'Prio'}
              </Button>
            </TooltipTrigger>
            <TooltipContent><p className="text-xs">{filters.sortBy === 'created' && filters.sortOrder === 'desc' ? 'Switch to priority sort' : 'Switch to time sort'}</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 relative ${expanded ? 'bg-[var(--app-accent-bg)] text-[var(--app-accent-text)]' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]'}`}
                onClick={() => setExpanded(!expanded)}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {activeCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-violet-500 text-white text-[7px] font-mono flex items-center justify-center">
                    {activeCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent><p className="text-xs">Filter & Sort</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* State Pills - Always visible */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-t border-[color:var(--app-border-separator)] overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {FILTER_STATES.map(f => {
          const totalFiltered = Object.values(stateCounts).reduce((a, b) => a + b, 0)
          const count = f.key === 'ALL' ? totalFiltered :
            f.key === 'FAILED' ? (stateCounts['VALIDATION_FAILED'] || 0) + (stateCounts['GEOMETRY_FAILED'] || 0) + (stateCounts['RENDER_FAILED'] || 0) :
            stateCounts[f.key] || 0
          const isMultiActive = f.key === 'ALL'
            ? filters.states.length === 0
            : filters.states.includes(f.key === 'FAILED' ? 'FAILED' : f.key)
          return (
            <button
              key={f.key}
              className={`shrink-0 text-[9px] font-mono px-2.5 py-1.5 rounded-md transition-colors min-h-[28px] ${
                isMultiActive ? 'bg-[var(--app-accent-bg)] text-[var(--app-accent-text)] border border-[color:var(--app-accent-border)]' : 'text-[var(--app-text-dim)] hover:text-[var(--app-text-muted)] border border-transparent'
              }`}
              onClick={() => {
                if (f.key === 'ALL') {
                  updateFilter('states', [])
                } else {
                  toggleState(f.key === 'FAILED' ? 'FAILED' : f.key)
                }
              }}
              aria-label={`Filter by ${f.label}`}
              aria-pressed={isMultiActive}
            >
              {f.label} {count > 0 ? count : ''}
            </button>
          )
        })}
      </div>

      {/* Expanded Filter Panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2.5 space-y-3 border-t border-[color:var(--app-border-separator)] bg-[var(--app-code-bg)]">
              {/* Row 1: Priority Range + Date Range */}
              <div className="flex items-start gap-4">
                {/* Priority Range */}
                <div className="flex-1">
                  <label className="text-[9px] font-mono tracking-widest text-[var(--app-text-dim)] uppercase mb-1.5 block">
                    Priority Range
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={filters.priorityMin}
                      onChange={e => updateFilter('priorityMin', Math.min(Number(e.target.value), filters.priorityMax))}
                      className="flex-1 accent-violet-500 h-1"
                    />
                    <span className="text-[9px] font-mono text-[var(--app-text-muted)] min-w-[28px] text-center">P{filters.priorityMin}</span>
                    <span className="text-[9px] text-[var(--app-text-dim)]">—</span>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={filters.priorityMax}
                      onChange={e => updateFilter('priorityMax', Math.max(Number(e.target.value), filters.priorityMin))}
                      className="flex-1 accent-violet-500 h-1"
                    />
                    <span className="text-[9px] font-mono text-[var(--app-text-muted)] min-w-[28px] text-center">P{filters.priorityMax}</span>
                  </div>
                </div>

                {/* Date Range */}
                <div className="flex-1">
                  <label className="text-[9px] font-mono tracking-widest text-[var(--app-text-dim)] uppercase mb-1.5 block">
                    Date Range
                  </label>
                  <div className="flex items-center gap-1">
                    {DATE_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        className={`text-[9px] px-2.5 py-1.5 rounded-md min-h-[28px] transition-colors ${
                          filters.dateRange === opt.key
                            ? 'bg-[var(--app-accent-bg)] text-[var(--app-accent-text)] border border-[color:var(--app-accent-border)]'
                            : 'text-[var(--app-text-dim)] hover:text-[var(--app-text-muted)] border border-transparent'
                        }`}
                        onClick={() => updateFilter('dateRange', opt.key as FilterState['dateRange'])}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {filters.dateRange === 'custom' && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <Input
                        type="date"
                        value={filters.dateFrom || ''}
                        onChange={e => updateFilter('dateFrom', e.target.value || null)}
                        className="h-6 text-[10px] bg-[var(--app-bg)] border-[color:var(--app-border)] text-[var(--app-text-secondary)]"
                      />
                      <span className="text-[9px] text-[var(--app-text-dim)]">to</span>
                      <Input
                        type="date"
                        value={filters.dateTo || ''}
                        onChange={e => updateFilter('dateTo', e.target.value || null)}
                        className="h-6 text-[10px] bg-[var(--app-bg)] border-[color:var(--app-border)] text-[var(--app-text-secondary)]"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Part Family + Builder + Sort */}
              <div className="flex items-start gap-4">
                {/* Part Family */}
                <div className="flex-1">
                  <label className="text-[9px] font-mono tracking-widest text-[var(--app-text-dim)] uppercase mb-1.5 block">
                    Part Family
                  </label>
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      className={`text-[9px] px-2.5 py-1.5 rounded-md min-h-[28px] transition-colors ${
                        !filters.partFamily
                          ? 'bg-[var(--app-accent-bg)] text-[var(--app-accent-text)] border border-[color:var(--app-accent-border)]'
                          : 'text-[var(--app-text-dim)] hover:text-[var(--app-text-muted)] border border-transparent'
                      }`}
                      onClick={() => updateFilter('partFamily', null)}
                    >
                      All
                    </button>
                    {partFamilies.map(pf => (
                      <button
                        key={pf}
                        className={`text-[9px] px-2.5 py-1.5 rounded-md min-h-[28px] transition-colors ${
                          filters.partFamily === pf
                            ? 'bg-[var(--app-accent-bg)] text-[var(--app-accent-text)] border border-[color:var(--app-accent-border)]'
                            : 'text-[var(--app-text-dim)] hover:text-[var(--app-text-muted)] border border-transparent'
                        }`}
                        onClick={() => updateFilter('partFamily', pf === filters.partFamily ? null : pf)}
                      >
                        {pf.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Builder Name */}
                <div className="flex-1">
                  <label className="text-[9px] font-mono tracking-widest text-[var(--app-text-dim)] uppercase mb-1.5 block">
                    Builder
                  </label>
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      className={`text-[9px] px-2.5 py-1.5 rounded-md min-h-[28px] transition-colors ${
                        !filters.builderName
                          ? 'bg-[var(--app-accent-bg)] text-[var(--app-accent-text)] border border-[color:var(--app-accent-border)]'
                          : 'text-[var(--app-text-dim)] hover:text-[var(--app-text-muted)] border border-transparent'
                      }`}
                      onClick={() => updateFilter('builderName', null)}
                    >
                      All
                    </button>
                    {builderNames.map(bn => (
                      <button
                        key={bn}
                        className={`text-[9px] px-2.5 py-1.5 rounded-md min-h-[28px] transition-colors ${
                          filters.builderName === bn
                            ? 'bg-[var(--app-accent-bg)] text-[var(--app-accent-text)] border border-[color:var(--app-accent-border)]'
                            : 'text-[var(--app-text-dim)] hover:text-[var(--app-text-muted)] border border-transparent'
                        }`}
                        onClick={() => updateFilter('builderName', bn === filters.builderName ? null : bn)}
                      >
                        {bn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort */}
                <div className="flex-1">
                  <label className="text-[9px] font-mono tracking-widest text-[var(--app-text-dim)] uppercase mb-1.5 block">
                    Sort By
                  </label>
                  <div className="flex items-center gap-1">
                    {SORT_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        className={`text-[9px] px-2.5 py-1.5 rounded-md min-h-[28px] transition-colors ${
                          filters.sortBy === opt.key
                            ? 'bg-[var(--app-accent-bg)] text-[var(--app-accent-text)] border border-[color:var(--app-accent-border)]'
                            : 'text-[var(--app-text-dim)] hover:text-[var(--app-text-muted)] border border-transparent'
                        }`}
                        onClick={() => updateFilter('sortBy', opt.key as FilterState['sortBy'])}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <button
                      className="text-[9px] px-1.5 py-1 rounded-md text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition-colors"
                      onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                      title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                    >
                      <ArrowUpDown className={`w-3 h-3 transition-transform ${filters.sortOrder === 'asc' ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Clear All */}
              {activeCount > 0 && (
                <div className="flex items-center justify-between pt-1 border-t border-[color:var(--app-border-separator)]">
                  <span className="text-[9px] text-[var(--app-text-dim)]">
                    {activeCount} active filter{activeCount !== 1 ? 's' : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[9px] gap-1 text-rose-400 hover:text-rose-300"
                    onClick={clearAll}
                  >
                    <RotateCcw className="w-2.5 h-2.5" />Clear all filters
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
