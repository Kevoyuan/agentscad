'use client'

import { useState } from 'react'
import { ChevronRight, Copy, CheckCircle } from 'lucide-react'

interface BreadcrumbNavProps {
  jobId: string
  activeTab: string
  onNavigateHome?: () => void
  onNavigateJobs?: () => void
}

const TAB_LABELS: Record<string, string> = {
  PARAMS: 'Parameters',
  RESEARCH: 'Research',
  VALIDATE: 'Validation',
  SCAD: 'SCAD Code',
  LOG: 'Timeline Log',
  NOTES: 'Notes',
  DEPS: 'Dependencies',
  HISTORY: 'Version History',
  AI: 'AI Chat',
}

export function BreadcrumbNav({ jobId, activeTab, onNavigateHome, onNavigateJobs }: BreadcrumbNavProps) {
  const [copied, setCopied] = useState(false)
  const jobPrefix = jobId.slice(0, 8)
  const tabLabel = TAB_LABELS[activeTab] || activeTab

  const handleCopyId = () => {
    navigator.clipboard.writeText(jobId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {
      // Fallback: no-op
    })
  }

  return (
    <nav className="flex items-center gap-1 h-6 text-[9px] font-mono shrink-0 breadcrumb-fade-in" aria-label="Breadcrumb">
      <button
        className="text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition-colors duration-150"
        onClick={onNavigateHome}
        aria-label="Navigate to home"
      >
        AgentSCAD
      </button>
      <ChevronRight className="w-2.5 h-2.5 text-[var(--app-text-dim)]" />
      <button
        className="text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition-colors duration-150"
        onClick={onNavigateJobs}
        aria-label="Navigate to jobs list"
      >
        Jobs
      </button>
      <ChevronRight className="w-2.5 h-2.5 text-[var(--app-text-dim)]" />
      <button
        className="flex items-center gap-1 text-[var(--app-text-secondary)] hover:text-violet-400 transition-colors duration-150 group"
        onClick={handleCopyId}
        title="Click to copy full Job ID"
        aria-label={`Job ID: ${jobPrefix}. Click to copy.`}
      >
        <span>{jobPrefix}</span>
        {copied ? (
          <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
        ) : (
          <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity duration-150" />
        )}
      </button>
      <ChevronRight className="w-2.5 h-2.5 text-[var(--app-text-dim)]" />
      <span className="text-violet-400 font-medium">
        {tabLabel}
      </span>
    </nav>
  )
}
