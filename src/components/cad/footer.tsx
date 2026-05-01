'use client'

import { useState, useEffect } from 'react'
import {
  Activity, CheckCircle2, Cpu, FileJson,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { Job, getStateHex } from './types'

// ─── Types ──────────────────────────────────────────────────────────────

interface FooterProps {
  jobs: Job[]
  jobCount: number
  jobCountFlash: boolean
  deliveredCount: number
  failedCount: number
  successRate: number
  onExport: () => void
}

// ─── Global Timeline Component ──────────────────────────────────────────

function GlobalTimeline({ jobs }: { jobs: Job[] }) {
  const recentJobs = [...jobs].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 40).reverse()

  return (
    <div className="flex items-center gap-0.5 h-3 px-2 border-x border-[color:var(--cad-border)] mx-4">
      {recentJobs.map((job) => (
        <TooltipProvider key={job.id} delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className="w-1 h-3 rounded-[1px] transition-all hover:h-4 hover:opacity-100 opacity-60"
                style={{ backgroundColor: getStateHex(job.state) }}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px] font-mono">
              <p>{job.state}: {job.inputRequest.slice(0, 30)}...</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
      {recentJobs.length === 0 && (
        <div className="text-[10px] text-[var(--cad-text-muted)] opacity-50 px-2 italic">Waiting for telemetry...</div>
      )}
    </div>
  )
}

// ─── Memory Usage Hook ──────────────────────────────────────────────────

function useMemoryUsage(): string | null {
  const [memory, setMemory] = useState<string | null>(null)

  useEffect(() => {
    const update = () => {
      try {
        // @ts-expect-error - performance.memory is Chrome-only
        const mem = performance.memory
        if (mem) {
          const usedMB = Math.round(mem.usedJSHeapSize / 1048576)
          const totalMB = Math.round(mem.jsHeapSizeLimit / 1048576)
          setMemory(`${usedMB}/${totalMB}MB`)
        }
      } catch {
        // performance.memory not available
      }
    }
    update()
    const interval = setInterval(update, 5000)
    return () => clearInterval(interval)
  }, [])

  return memory
}

// ─── Footer Metric Component ──────────────────────────────────────────────

function FooterMetric({
  tooltip,
  children,
  className = '',
}: {
  tooltip: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`footer-metric ${className}`}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[11px] font-mono bg-[var(--cad-surface-raised)] border-[color:var(--cad-border-strong)] text-[var(--cad-text-secondary)]">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─── Separator ──────────────────────────────────────────────────────────

function SeparatorDot() {
  return <span className="footer-separator h-1 w-1 rounded-full bg-[var(--cad-border-strong)] mx-1" />
}

// ─── Footer Component ──────────────────────────────────────────────────

export function Footer({
  jobs,
  jobCount,
  jobCountFlash,
  deliveredCount,
  failedCount,
  successRate,
  onExport,
}: FooterProps) {
  const memoryUsage = useMemoryUsage()
  const hasAttention = failedCount > 0

  return (
    <footer className="relative flex items-center px-4 py-1.5 border-t border-[color:var(--cad-border)] bg-[var(--cad-surface)] shrink-0 overflow-hidden">
      <div className="flex min-w-0 items-center gap-3 text-[11px] font-mono text-[var(--cad-text-muted)]">
        <FooterMetric tooltip="Jobs refresh automatically while the workspace is open">
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[var(--cad-success)] status-pulse" />
            <span className="hidden sm:inline opacity-70">AUTO-REFRESH</span>
          </span>
        </FooterMetric>
        <SeparatorDot />
        <FooterMetric tooltip="Total jobs in the system">
          <span className={jobCountFlash ? 'number-highlight' : ''}>
            {jobCount} RUNS
          </span>
        </FooterMetric>
        <SeparatorDot />
        <FooterMetric tooltip="Successfully delivered jobs">
          <span className="text-[var(--cad-success)] opacity-90">{deliveredCount} OK</span>
        </FooterMetric>
        {hasAttention && (
          <>
            <SeparatorDot />
            <FooterMetric tooltip="Items needing attention">
              <span className="text-[var(--cad-danger)] opacity-90">{failedCount} ERR</span>
            </FooterMetric>
          </>
        )}
      </div>

      <div className="flex-1 flex justify-center">
        <GlobalTimeline jobs={jobs} />
      </div>

      <div className="flex shrink-0 items-center gap-3 text-[11px] font-mono text-[var(--cad-text-muted)]">
        <FooterMetric tooltip="Delivery success rate (delivered vs failed)">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            {successRate}%
          </span>
        </FooterMetric>
        {memoryUsage && (
          <>
            <SeparatorDot />
            <FooterMetric tooltip="JavaScript heap memory usage">
              <span className="hidden xl:flex items-center gap-1">
                <Cpu className="w-3 h-3" />
                {memoryUsage}
              </span>
            </FooterMetric>
          </>
        )}
        <SeparatorDot />
        <FooterMetric tooltip="AgentSCAD application version">
          <span className="opacity-70 uppercase">v0.9-alpha</span>
        </FooterMetric>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 text-[10px] gap-1 text-[var(--cad-text-muted)] hover:text-[var(--cad-text-secondary)] hover:bg-[var(--cad-surface-raised)] border border-[color:var(--cad-border)] px-2 ml-1" 
          onClick={onExport}
        >
          <FileJson className="w-2.5 h-2.5" />EXPORT
        </Button>
      </div>
    </footer>
  )
}
