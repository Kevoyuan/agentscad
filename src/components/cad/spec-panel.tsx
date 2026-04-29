'use client'

import { AlertTriangle, Cpu, RotateCcw, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Job, parseJSON } from './types'
import { CadConstraintChip, CadExportChecklist, CadPanel, CadSectionHeader } from './cad-primitives'
import { getPartFamilyLabel } from './part-family-icon'

export function SpecPanel({
  job,
  onProcess,
  onRepair,
}: {
  job: Job
  onProcess: (job: Job) => void
  onRepair: (job: Job) => void
}) {
  const values = parseJSON<Record<string, number>>(job.parameterValues, {})
  const failed = ['VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED'].includes(job.state)
  const stale = job.state === 'DELIVERED' && !job.stlPath
  const dimensions = [
    values.width ?? values.phone_width ?? values.outer_diameter ?? values.diameter,
    values.depth ?? values.phone_length ?? values.thickness,
    values.height ?? values.phone_thickness,
  ].filter(v => typeof v === 'number')

  const chips = [
    job.partFamily ? getPartFamilyLabel(job.partFamily) : 'Part family pending',
    job.generationPath?.replace(/_/g, ' ') || 'Generation path pending',
    job.builderName || 'Builder pending',
    dimensions.length ? `${dimensions.join(' x ')} mm` : 'Dimensions pending',
  ]

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-3">
        <CadSectionHeader>Spec</CadSectionHeader>
        <CadPanel>
          <div className="space-y-3 p-3">
            <p className="text-sm leading-relaxed text-[var(--cad-text)]">{job.inputRequest}</p>
            <div className="flex flex-wrap gap-1.5">
              {chips.map(chip => <CadConstraintChip key={chip}>{chip}</CadConstraintChip>)}
            </div>
          </div>
        </CadPanel>

        {(failed || stale) && (
          <CadPanel title={failed ? 'Diagnostic action' : 'Stale render'} eyebrow="repair">
            <div className="space-y-3 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cad-warning)]" />
                <p className="text-sm leading-relaxed text-[var(--cad-text-secondary)]">
                  {failed
                    ? 'If artifacts already exist, Auto Repair will restore the run without regenerating geometry. Otherwise retry the pipeline.'
                    : 'Parameters changed after render. Rebuild STL before export.'}
                </p>
              </div>
              <div className="flex gap-2">
                {failed && (
                  <Button size="sm" className="h-7 gap-1.5 bg-[var(--cad-accent)] text-[13px]" onClick={() => onRepair(job)}>
                    <Wrench className="h-3 w-3" />
                    Auto Repair
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 gap-1.5 border-[color:var(--cad-border)] text-[13px]" onClick={() => onProcess(job)}>
                  <RotateCcw className="h-3 w-3" />
                  {failed ? 'Retry Pipeline' : 'Rebuild STL'}
                </Button>
              </div>
            </div>
          </CadPanel>
        )}

        <CadExportChecklist job={job} />

        {(job.builderName || job.generationPath) && (
          <div className="flex items-center gap-2 px-1 text-[13px] font-mono text-[var(--cad-text-muted)]">
            <Cpu className="h-3 w-3" />
            {[job.builderName, job.generationPath].filter(Boolean).join(' / ')}
          </div>
        )}
      </div>
    </div>
  )
}
