'use client'

import { useState, useEffect } from 'react'
import {
  Activity, Wifi, WifiOff, GitBranch, Timer,
  CheckCircle2, Cpu, FileJson, MemoryStick, Clock,
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
  wsConnected: boolean
  jobCount: number
  jobCountFlash: boolean
  deliveredCount: number
  failedCount: number
  dependencyCount: number
  uptime: number
  successRate: number
  onExport: () => void
  formatUptime: (s: number) => string
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

// ─── Live Clock Hook ──────────────────────────────────────────────────────

function useLiveClock(): string {
  const [time, setTime] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }))
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  return time
}

// ─── Footer Metric Component ──────────────────────────────────────────────

function FooterMetric({
  tooltip,
  children,
}: {
  tooltip: string
  children: React.ReactNode
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="footer-metric" data-tooltip={tooltip}>
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
  wsConnected,
  jobCount,
  jobCountFlash,
  deliveredCount,
  failedCount,
  dependencyCount,
  uptime,
  successRate,
  onExport,
  formatUptime,
}: FooterProps) {
  const memoryUsage = useMemoryUsage()
  const liveClock = useLiveClock()

  return (
    <footer className="relative flex items-center justify-between px-4 py-1.5 border-t border-[color:var(--app-border)] bg-[var(--app-surface)] shrink-0">
      <div className="flex items-center gap-3 text-[9px] font-mono text-[var(--app-text-muted)]">
        <FooterMetric tooltip="System health status">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <Activity className="w-2.5 h-2.5 text-emerald-500" />
            Online
          </span>
        </FooterMetric>
        <SeparatorDot />
        <FooterMetric tooltip={wsConnected ? 'WebSocket connected to server' : 'WebSocket disconnected - using polling fallback'}>
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 online-dot' : 'bg-rose-500'}`} />
            WS: {wsConnected ? 'OK' : 'Down'}
          </span>
        </FooterMetric>
        <SeparatorDot />
        <FooterMetric tooltip="Total jobs in the system">
          <span className={jobCountFlash ? 'number-highlight' : ''}>
            Jobs: {jobCount}
          </span>
        </FooterMetric>
        <SeparatorDot />
        <FooterMetric tooltip="Successfully delivered jobs">
          <span className="text-lime-500/80">Done: {deliveredCount}</span>
        </FooterMetric>
        <SeparatorDot />
        <FooterMetric tooltip="Jobs that failed validation, geometry, or rendering">
          <span className="text-rose-500/80">Failed: {failedCount}</span>
        </FooterMetric>
        <SeparatorDot />
        <FooterMetric tooltip="Jobs with parent-child dependencies">
          <span className="flex items-center gap-1">
            <GitBranch className="w-2.5 h-2.5" />
            Deps: {dependencyCount}
          </span>
        </FooterMetric>
        {memoryUsage && (
          <>
            <SeparatorDot />
            <FooterMetric tooltip="JavaScript heap memory usage">
              <span className="flex items-center gap-1">
                <Cpu className="w-2.5 h-2.5" />
                Mem: {memoryUsage}
              </span>
            </FooterMetric>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 text-[9px] font-mono text-[var(--app-text-dim)]">
        <FooterMetric tooltip="Current time">
          <span className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {liveClock}
          </span>
        </FooterMetric>
        <SeparatorDot />
        <FooterMetric tooltip="Session uptime">
          <span className="flex items-center gap-1">
            <Timer className="w-2.5 h-2.5" />
            {formatUptime(uptime)}
          </span>
        </FooterMetric>
        <SeparatorDot />
        <FooterMetric tooltip="Delivery success rate (delivered vs failed)">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" />
            {successRate}%
          </span>
        </FooterMetric>
        <SeparatorDot />
        <FooterMetric tooltip="AgentSCAD application version">
          <span className="flex items-center gap-1">
            <Cpu className="w-2.5 h-2.5" />
            AgentSCAD v0.9
          </span>
        </FooterMetric>
        <Button variant="ghost" size="sm" className="h-4 text-[8px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]" onClick={onExport}>
          <FileJson className="w-2.5 h-2.5" />Export
        </Button>
      </div>
    </footer>
  )
}
