'use client'

import {
  Plus, Loader2, Wand2, Tag, Ruler, Hammer, BoxSelect, Gauge, LockKeyhole,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

import { getPriorityColor } from '@/components/cad/types'
import { JobTemplateCards } from '@/components/cad/job-templates'
import { CaseMemory } from '@/components/cad/case-memory'
import { TagBadges, buildCustomerId } from '@/components/cad/tag-badges'

export function JobComposer({
  showComposer,
  newJobText,
  newJobPriority,
  newJobTags,
  isCreating,
  isAiEnhancing,
  recentRequests,
  onShowComposerChange,
  onNewJobTextChange,
  onNewJobPriorityChange,
  onNewJobTagsChange,
  onCreate,
  onAiEnhance,
}: {
  showComposer: boolean
  newJobText: string
  newJobPriority: number
  newJobTags: string
  isCreating: boolean
  isAiEnhancing: boolean
  recentRequests: string[]
  onShowComposerChange: (open: boolean) => void
  onNewJobTextChange: (text: string) => void
  onNewJobPriorityChange: (priority: number) => void
  onNewJobTagsChange: (tags: string) => void
  onCreate: () => void
  onAiEnhance: () => void
}) {
  const { toast } = useToast()
  const specGroups = [
    {
      label: 'Dimensions',
      icon: Ruler,
      values: ['120 x 80 x 32 mm', '2.5mm walls', '6mm radius', 'M3 screw posts'],
    },
    {
      label: 'Material',
      icon: BoxSelect,
      values: ['PLA', 'PETG', 'Aluminum', 'ABS'],
    },
    {
      label: 'Process',
      icon: Hammer,
      values: ['FDM print', 'CNC-ready', 'laser cut', 'prototype fit'],
    },
    {
      label: 'Tolerance',
      icon: Gauge,
      values: ['0.2mm tolerance', 'snap-fit lid', 'heat-set inserts', 'clearance holes'],
    },
  ]

  const appendSpec = (value: string) => {
    const next = newJobText.trim() ? `${newJobText.trim()}, ${value}` : value
    onNewJobTextChange(next)
  }

  return (
    <Dialog open={showComposer} onOpenChange={onShowComposerChange}>
      <DialogContent className="bg-[var(--app-dialog-bg)] border-[color:var(--cad-border)] max-w-2xl dialog-enter">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <BoxSelect className="w-4 h-4 text-[var(--cad-accent)]" />New CAD Spec
          </DialogTitle>
        </DialogHeader>
        <Separator />
        <div className="space-y-4">
          {/* Recent Requests */}
          {recentRequests.length > 0 && (
            <div>
              <label className="text-[10px] font-mono tracking-widest text-[var(--app-text-secondary)] uppercase mb-1.5 block">Recent Requests</label>
              <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                {recentRequests.map((req, i) => (
                  <button
                    key={i}
                    className="recent-request-item text-left text-[10px] text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] px-2.5 py-1.5 rounded border border-[color:var(--app-border)] hover:border-[color:var(--app-accent-border)] hover:bg-[var(--app-surface-raised)] truncate transition-colors"
                    onClick={() => onNewJobTextChange(req)}
                  >
                    {req.slice(0, 80)}{req.length > 80 ? '…' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-3">
              <JobTemplateCards onSelect={(template) => onNewJobTextChange(template)} />
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="text-[10px] font-mono tracking-widest text-[var(--app-text-secondary)] uppercase">Part intent</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-5 text-[8px] gap-1 ${isAiEnhancing ? 'ai-enhance-glow text-[var(--app-accent-text)]' : 'text-[var(--app-accent-text)] hover:text-[var(--app-accent-text)]'}`}
                    onClick={onAiEnhance}
                    disabled={!newJobText.trim() || isAiEnhancing}
                  >
                    <Wand2 className="w-2.5 h-2.5" />
                    {isAiEnhancing ? 'Enhancing...' : 'Enhance with AI'}
                  </Button>
                </div>
                <Textarea
                  data-composer-textarea
                  value={newJobText}
                  onChange={e => onNewJobTextChange(e.target.value)}
                  placeholder="e.g. Hinged electronics enclosure with screw posts, 120 x 80 x 32 mm, 2.5mm walls, FDM print"
                  className="min-h-[132px] bg-[var(--app-bg)] border-[color:var(--cad-border)] text-sm placeholder:text-[var(--app-text-dim)] focus:border-[color:var(--cad-accent)]"
                  maxLength={5000}
                />
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px] text-[var(--app-text-muted)]">{newJobText.length}/5000</span>
                  <span className="text-[10px] text-[var(--app-text-muted)]">⌘+Enter</span>
                </div>
                {/* Case Memory - Similar Past Jobs */}
                <CaseMemory
                  searchQuery={newJobText}
                  onSuggestionClick={(job) => {
                    toast({
                      title: 'Similar job found',
                      description: job.inputRequest.slice(0, 60),
                      duration: 3000,
                    })
                  }}
                />
              </div>
            </div>

            <div className="cad-panel p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-widest text-[var(--cad-text-secondary)] uppercase">Constraint chips</span>
                <LockKeyhole className="w-3 h-3 text-[var(--cad-text-muted)]" />
              </div>
              <div className="space-y-3">
                {specGroups.map(group => {
                  const Icon = group.icon
                  return (
                    <div key={group.label} className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[9px] font-mono tracking-widest uppercase text-[var(--cad-text-muted)]">
                        <Icon className="w-3 h-3" />
                        {group.label}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.values.map(value => (
                          <button
                            key={value}
                            type="button"
                            className="cad-chip hover:border-[color:var(--cad-accent)] hover:text-[var(--cad-text)] transition-colors"
                            onClick={() => appendSpec(value)}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-widest text-[var(--app-text-secondary)] uppercase mb-2 block">Priority</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={10}
                value={newJobPriority}
                onChange={e => onNewJobPriorityChange(Number(e.target.value))}
                className="flex-1 accent-[var(--cad-accent)]"
              />
              <span className={`text-xs font-mono px-2 py-0.5 rounded border min-w-[36px] text-center ${getPriorityColor(newJobPriority)}`}>
                P{newJobPriority}
              </span>
            </div>
            <div className="flex justify-between text-[9px] text-[var(--app-text-muted)] mt-1">
              <span>Low</span>
              <span>Critical</span>
            </div>
          </div>
          {/* Tags Input */}
          <div>
            <label className="text-[10px] font-mono tracking-widest text-[var(--app-text-secondary)] uppercase mb-2 flex items-center gap-1.5">
              <Tag className="w-2.5 h-2.5" />Tags
            </label>
            <Input
              value={newJobTags}
              onChange={e => onNewJobTagsChange(e.target.value)}
              placeholder="enclosure, prototype, urgent"
              className="h-7 text-[11px] bg-[var(--app-bg)] border-[color:var(--app-border)] placeholder:text-[var(--app-text-dim)] focus:border-[color:var(--app-accent-border)]"
            />
            {newJobTags.trim() && (
              <div className="mt-1.5">
                <TagBadges customerId={buildCustomerId(newJobTags.split(',').map(t => t.trim()).filter(t => t))} maxDisplay={6} />
              </div>
            )}
          </div>
          <Button
            className="w-full bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-white font-medium btn-press"
            onClick={onCreate}
            disabled={!newJobText.trim() || isCreating}
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Create Job
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
