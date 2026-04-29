'use client'

import { CheckCircle2, Circle, CircleAlert, LockKeyhole } from 'lucide-react'
import { Job, ValidationResult, parseJSON } from './types'

export function CadPanel({
  title,
  eyebrow,
  children,
  className = '',
}: {
  title?: string
  eyebrow?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`cad-panel ${className}`}>
      {(title || eyebrow) && (
        <div className="border-b border-[color:var(--cad-border)] px-3 py-2">
          {eyebrow && <p className="text-[8px] font-mono uppercase tracking-[0.18em] text-[var(--cad-text-muted)]">{eyebrow}</p>}
          {title && <h3 className="mt-0.5 text-xs font-medium text-[var(--cad-text)]">{title}</h3>}
        </div>
      )}
      {children}
    </section>
  )
}

export function CadSectionHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <h3 className="text-[13px] font-mono uppercase tracking-[0.18em] text-[var(--cad-text-muted)]">{children}</h3>
      {action}
    </div>
  )
}

export function CadStatusDot({ tone = 'neutral' }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' }) {
  const color = {
    neutral: 'var(--cad-text-muted)',
    success: 'var(--cad-success)',
    warning: 'var(--cad-warning)',
    danger: 'var(--cad-danger)',
    accent: 'var(--cad-accent)',
  }[tone]

  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)` }}
    />
  )
}

export function CadMetric({
  label,
  value,
  unit,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  unit?: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'
}) {
  return (
    <div className="rounded-md border border-[color:var(--cad-border)] bg-black/10 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <CadStatusDot tone={tone} />
        <span className="text-[8px] font-mono uppercase tracking-[0.16em] text-[var(--cad-text-muted)]">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1 font-mono tabular-nums">
        <span className="text-sm text-[var(--cad-text)]">{value}</span>
        {unit && <span className="text-xs text-[var(--cad-text-muted)]">{unit}</span>}
      </div>
    </div>
  )
}

export function CadConstraintChip({
  children,
  locked,
}: {
  children: React.ReactNode
  locked?: boolean
}) {
  return (
    <span className="cad-chip">
      {locked && <LockKeyhole className="h-3 w-3" />}
      {children}
    </span>
  )
}

export function CadExportChecklist({ job }: { job: Job }) {
  const validation = parseJSON<ValidationResult[]>(job.validationResults, [])
  const isSkipped = (rule: ValidationResult) => rule.message.toLowerCase().startsWith('skipped')
  const skipped = validation.filter(isSkipped)
  const blockers = validation.filter(rule => !rule.passed && rule.is_critical)
  const warnings = validation.filter(rule => !rule.passed && !rule.is_critical)
  const checks = [
    { label: 'SCAD source', ok: Boolean(job.scadSource), detail: job.scadSource ? 'Inspectable' : 'Missing' },
    { label: 'STL artifact', ok: Boolean(job.stlPath), detail: job.stlPath ? 'Ready' : 'Stale or missing' },
    { label: 'Preview image', ok: Boolean(job.pngPath), detail: job.pngPath ? 'Ready' : 'Stale or missing' },
    {
      label: 'Critical validation',
      ok: blockers.length === 0 && validation.length > 0 && skipped.length < validation.length,
      detail: validation.length
        ? skipped.length
          ? `${blockers.length} blockers, ${skipped.length} skipped`
          : `${blockers.length} blockers`
        : 'Pending',
    },
  ]
  const ready = checks.every(check => check.ok)

  return (
    <CadPanel title={ready ? 'Export-ready' : 'Export readiness'} eyebrow="quality gate">
      <div className="space-y-2 p-3">
        {checks.map(check => (
          <div key={check.label} className="flex items-center justify-between gap-3 rounded-md bg-black/10 px-2 py-1.5">
            <div className="flex items-center gap-2">
              {check.ok
                ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--cad-success)]" />
                : <CircleAlert className="h-3.5 w-3.5 text-[var(--cad-warning)]" />
              }
              <span className="text-sm text-[var(--cad-text-secondary)]">{check.label}</span>
            </div>
            <span className="text-xs font-mono text-[var(--cad-text-muted)]">{check.detail}</span>
          </div>
        ))}
        {warnings.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-[color:var(--cad-border)] px-2 py-1.5 text-[13px] text-[var(--cad-warning)]">
            <Circle className="h-3 w-3" />
            {warnings.length} non-blocking warning{warnings.length === 1 ? '' : 's'}
          </div>
        )}
        {skipped.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-[color:var(--cad-border)] px-2 py-1.5 text-[13px] text-[var(--cad-warning)]">
            <CircleAlert className="h-3 w-3" />
            {skipped.length} validation rule{skipped.length === 1 ? '' : 's'} skipped
          </div>
        )}
      </div>
    </CadPanel>
  )
}
