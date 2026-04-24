'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, ArrowRight } from 'lucide-react'
import { PartFamilyIcon, getPartFamilyLabel } from './part-family-icon'
import { StateBadge } from './state-badge'
import { timeAgo } from './types'
import {
  staggerContainer,
  staggerChild,
  staggerTransition,
} from './motion-presets'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SimilarJob {
  id: string
  inputRequest: string
  partFamily: string | null
  parameterSchema: string | null
  parameterValues: string | null
  state: string
  createdAt: string
  completedAt: string | null
  builderName: string | null
  generationPath: string | null
}

interface CaseMemoryProps {
  searchQuery: string
  onSuggestionClick?: (job: SimilarJob) => void
}

// ─── Debounce Hook ──────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)
    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

// ─── Case Memory Component ──────────────────────────────────────────────────

export function CaseMemory({ searchQuery, onSuggestionClick }: CaseMemoryProps) {
  const [similarJobs, setSimilarJobs] = useState<SimilarJob[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const debouncedQuery = useDebounce(searchQuery, 300)

  const searchSimilar = useCallback(async (q: string) => {
    if (!q || q.trim().length < 3) {
      setSimilarJobs([])
      return
    }

    // Cancel previous request
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller

    setIsSearching(true)
    try {
      const res = await fetch(`/api/jobs/similar?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      if (!controller.signal.aborted) {
        setSimilarJobs(data.similar || [])
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Similar jobs search failed:', err)
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false)
      }
    }
  }, [])

  useEffect(() => {
    searchSimilar(debouncedQuery)
  }, [debouncedQuery, searchSimilar])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [])

  if (!debouncedQuery || debouncedQuery.trim().length < 3) {
    return null
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Brain className="w-3 h-3 text-[var(--app-accent-text)]" />
        <span className="text-[9px] font-mono text-[var(--app-text-muted)] tracking-widest uppercase">
          Case Memory
        </span>
        {isSearching && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[8px] text-[var(--app-accent-text)] animate-pulse"
          >
            searching...
          </motion.span>
        )}
      </div>

      <AnimatePresence>
        {similarJobs.length > 0 ? (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={staggerTransition}
            className="space-y-1.5 max-h-48 overflow-y-auto pr-1"
          >
            {similarJobs.map((job) => (
              <motion.div
                key={job.id}
                variants={staggerChild}
                className="group/suggestion relative rounded-lg linear-surface linear-border p-2.5 cursor-pointer hover:border-[color:var(--cad-accent)] hover:bg-[var(--cad-accent-soft)] linear-transition"
                onClick={() => onSuggestionClick?.(job)}
              >
                <div className="flex items-start gap-2">
                  <PartFamilyIcon family={job.partFamily || 'unknown'} size={16} animate={false} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[var(--app-text-secondary)] leading-tight line-clamp-2">
                      {job.inputRequest}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <StateBadge state={job.state} />
                      {job.partFamily && (
                        <span className="text-[8px] font-mono text-[var(--app-text-dim)]">
                          {getPartFamilyLabel(job.partFamily)}
                        </span>
                      )}
                      <span className="text-[8px] text-[var(--app-text-dim)] font-mono">
                        {timeAgo(job.createdAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    className="shrink-0 flex items-center gap-0.5 text-[8px] text-[var(--app-accent-text)] opacity-0 group-hover/suggestion:opacity-100 transition-opacity duration-200 hover:text-[var(--app-accent-text)] bg-[var(--app-accent-bg)] px-1.5 py-1 rounded border border-[color:var(--cad-border)]"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSuggestionClick?.(job)
                    }}
                  >
                    Use <ArrowRight className="w-2 h-2" />
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          !isSearching && debouncedQuery.trim().length >= 3 && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[10px] text-[var(--app-text-dim)] py-2 text-center"
            >
              No similar past jobs found
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  )
}
