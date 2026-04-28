'use client'

import {
  Play, Loader2, Wand2, Tag, Ruler, Hammer, BoxSelect, Gauge, LockKeyhole, Brain,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

import { JobTemplateCards } from '@/components/cad/job-templates'
import { CaseMemory } from '@/components/cad/case-memory'
import { TagBadges, buildCustomerId } from '@/components/cad/tag-badges'

export function JobComposer({
  showComposer,
  newJobText,
  newJobModelId,
  newJobTags,
  isCreating,
  isAiEnhancing,
  recentRequests,
  onShowComposerChange,
  onNewJobTextChange,
  onNewJobModelIdChange,
  onNewJobTagsChange,
  onCreate,
  onAiEnhance,
}: {
  showComposer: boolean
  newJobText: string
  newJobModelId: string
  newJobTags: string
  isCreating: boolean
  isAiEnhancing: boolean
  recentRequests: string[]
  onShowComposerChange: (open: boolean) => void
  onNewJobTextChange: (text: string) => void
  onNewJobModelIdChange: (modelId: string) => void
  onNewJobTagsChange: (tags: string) => void
  onCreate: () => void
  onAiEnhance: () => void
}) {
  const { toast } = useToast()
  const generationModels = [
    {
      id: 'mimo-v2.5-pro',
      name: 'MiMo-V2.5-Pro',
      provider: 'Xiaomi MiMo',
      description: '默认低延迟 CAD 草稿模型',
    },
    {
      id: 'deepseek-v4-pro',
      name: 'DeepSeek V4 Pro',
      provider: 'DeepSeek',
      description: '更强推理，适合复杂 OpenSCAD 生成',
    },
    {
      id: 'openai/gpt-5.5',
      name: 'GPT-5.5',
      provider: 'OpenRouter',
      description: '高质量推理，适合复杂 CAD 方案',
    },
  ]
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
      <DialogContent className="bg-[var(--app-dialog-bg)] border-[color:var(--cad-border)] max-w-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden p-0 gap-0 grid-rows-[auto_auto_minmax(0,1fr)] dialog-enter" aria-describedby="composer-description">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-sm flex items-center gap-2">
            <BoxSelect className="w-4 h-4 text-[var(--cad-accent)]" />New CAD Spec
          </DialogTitle>
          <DialogDescription id="composer-description" className="sr-only">
            Create a new CAD job by describing the part you want to design
          </DialogDescription>
        </DialogHeader>
        <Separator />
        <div className="min-h-0 overflow-y-auto px-6 py-4 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--app-scrollbar-thumb) transparent' }}>
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
            <label className="text-[10px] font-mono tracking-widest text-[var(--app-text-secondary)] uppercase mb-2 flex items-center gap-1.5">
              <Brain className="w-2.5 h-2.5" />Generation Model
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {generationModels.map(model => (
                <button
                  key={model.id}
                  type="button"
                  className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                    newJobModelId === model.id
                      ? 'border-[color:var(--app-accent-border)] bg-[var(--app-accent-bg)] text-[var(--app-accent-text)]'
                      : 'border-[color:var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text-secondary)] hover:border-[color:var(--app-accent-border)] hover:text-[var(--app-text-primary)]'
                  }`}
                  onClick={() => onNewJobModelIdChange(model.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-semibold">{model.name}</span>
                    <span className="text-[8px] uppercase tracking-widest opacity-70">{model.provider}</span>
                  </div>
                  <p className="mt-1 text-[9px] leading-snug opacity-75">{model.description}</p>
                </button>
              ))}
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
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            Generate CAD
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
