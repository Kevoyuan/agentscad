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

// ─── Types ──────────────────────────────────────────────────────────────

interface FooterProps {
  jobCount: number
  jobCountFlash: boolean
  deliveredCount: number
  failedCount: number
  successRate: number
  onExport: () => void
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
          <span className={`footer-metric ${className}`} data-tooltip={tooltip}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[9px] font-mono">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─── Separator ──────────────────────────────────────────────────────────

function SeparatorDot() {
  return <span className="footer-separator" />
}

// ─── Footer Component ──────────────────────────────────────────────────

export function Footer({
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
    <footer className="relative flex items-center justify-between px-4 py-1.5 border-t border-[color:var(--app-border)] bg-[var(--app-surface)] shrink-0">
      <div className="flex min-w-0 items-center gap-3 text-[9px] font-mono text-[var(--app-text-muted)]">
        <FooterMetric tooltip="Jobs refresh automatically while the workspace is open">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 online-dot" />
            <Activity className="w-2.5 h-2.5 text-emerald-500" />
            Auto-refresh
          </span>
        </FooterMetric>
        <SeparatorDot />
        <FooterMetric tooltip="Total jobs in the system">
          <span className={jobCountFlash ? 'number-highlight' : ''}>
            {jobCount} runs
          </span>
        </FooterMetric>
        <SeparatorDot />
        <FooterMetric tooltip="Successfully delivered jobs">
          <span>{deliveredCount} delivered</span>
        </FooterMetric>
        {hasAttention && (
          <>
            <SeparatorDot />
            <FooterMetric tooltip="Items needing attention">
              <span className="text-rose-500/80">{failedCount} blockers</span>
            </FooterMetric>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-[9px] font-mono text-[var(--app-text-dim)]">
        <FooterMetric tooltip="Delivery success rate (delivered vs failed)">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" />
            {successRate}%
          </span>
        </FooterMetric>
        {memoryUsage && (
          <>
            <SeparatorDot />
            <FooterMetric tooltip="JavaScript heap memory usage">
              <span className="hidden xl:flex items-center gap-1">
                <Cpu className="w-2.5 h-2.5" />
                {memoryUsage}
              </span>
            </FooterMetric>
          </>
        )}
        <SeparatorDot />
        <FooterMetric tooltip="AgentSCAD application version">
          <span>v0.9</span>
        </FooterMetric>
        <Button variant="ghost" size="sm" className="h-4 text-[8px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]" onClick={onExport}>
          <FileJson className="w-2.5 h-2.5" />Export
        </Button>
      </div>
    </footer>
  )
}
