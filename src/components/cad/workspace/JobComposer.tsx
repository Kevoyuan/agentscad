'use client'

import { useEffect, useState } from 'react'
import {
  Play, Loader2, Sparkles, Tag, Ruler, Hammer, BoxSelect, Gauge, LockKeyhole, Cpu, Clock, CornerDownLeft, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

import { JobTemplateCards } from '@/components/cad/job-templates'
import { CaseMemory } from '@/components/cad/case-memory'
import { TagBadges, buildCustomerId } from '@/components/cad/tag-badges'
import { fetchModels, type ModelInfo } from '@/components/cad/api'

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
  onAddProvider,
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
  onAddProvider: () => void
}) {

  const [generationModels, setGenerationModels] = useState<Array<Pick<ModelInfo, 'id' | 'name' | 'providerName' | 'description'>>>([])
  const [isLoadingModels, setIsLoadingModels] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchModels()
      .then(data => {
        if (cancelled) return
        const configured = data.models.slice(0, 9)
        setGenerationModels(configured)
        if (configured.length > 0 && !configured.some(model => model.id === newJobModelId)) {
          onNewJobModelIdChange(configured[0].id)
        }
        if (configured.length === 0 && newJobModelId) {
          onNewJobModelIdChange('')
        }
      })
      .catch(() => {
        if (!cancelled) setGenerationModels([])
      })
      .finally(() => {
        if (!cancelled) setIsLoadingModels(false)
      })
    return () => {
      cancelled = true
    }
  }, [newJobModelId, onNewJobModelIdChange])
  
  const specGroups = [
    {
      label: 'Dimensions',
      icon: Ruler,
      values: ['120x80x32mm', '2.5mm walls', '6mm radius', 'M3 posts'],
    },
    {
      label: 'Material',
      icon: BoxSelect,
      values: ['PLA', 'PETG', 'Aluminum', 'ABS'],
    },
    {
      label: 'Process',
      icon: Hammer,
      values: ['FDM', 'CNC-ready', 'Laser cut', 'Prototype'],
    },
    {
      label: 'Tolerance',
      icon: Gauge,
      values: ['0.2mm', 'Snap-fit', 'Inserts', 'Clearance'],
    },
  ]

  const appendSpec = (value: string) => {
    const next = newJobText.trim() ? `${newJobText.trim()}, ${value}` : value
    onNewJobTextChange(next)
  }

  // Handle Cmd+Enter to submit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (showComposer && newJobText.trim() && newJobModelId && !isCreating) {
          e.preventDefault()
          onCreate()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showComposer, newJobText, newJobModelId, isCreating, onCreate])

  return (
    <Dialog open={showComposer} onOpenChange={onShowComposerChange}>
      <DialogContent className="bg-[var(--cad-surface)] text-[var(--cad-text)] border border-[color:var(--cad-border)] shadow-[0_24px_50px_-12px_rgba(15,23,42,0.18)] sm:rounded-[12px] max-w-[980px] w-[calc(100vw-24px)] p-0 gap-0 overflow-hidden font-sans outline-none focus:outline-none" aria-describedby="composer-description">
        <DialogHeader className="sr-only">
          <DialogTitle>New Specification</DialogTitle>
          <DialogDescription id="composer-description">Create a new CAD specification</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[calc(100dvh-24px)] flex-col overflow-y-auto md:grid md:grid-cols-[minmax(0,1fr)_minmax(300px,340px)] md:h-[min(82vh,760px)] md:min-h-[520px] md:overflow-hidden">
          
          {/* LEFT COLUMN: Main Input */}
          <div className="flex min-h-[360px] flex-col min-w-0 md:min-h-0 border-b md:border-b-0 md:border-r border-[color:var(--cad-border)] bg-[var(--cad-surface)]">
            
            {/* Header */}
            <div className="px-5 py-3.5 flex items-center justify-between gap-3 border-b border-[color:var(--cad-border)] shrink-0 bg-[var(--app-surface)]">
              <div className="flex items-center gap-2.5 min-w-0 text-[13px] font-semibold text-[var(--cad-text)]">
                <div className="flex items-center justify-center w-5 h-5 rounded-[5px] bg-[var(--cad-surface-raised)] border border-[color:var(--cad-border)] shadow-sm shrink-0">
                  <BoxSelect className="w-3 h-3 text-[var(--cad-text-secondary)]" />
                </div>
                <span className="truncate">New Specification</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 max-w-[136px] px-2.5 text-[11px] font-medium text-[var(--cad-accent)] hover:bg-[var(--cad-accent-soft)] transition-colors rounded-[6px] shrink-0 active:scale-[0.98]"
                onClick={onAiEnhance}
                disabled={!newJobText.trim() || isAiEnhancing}
              >
                {isAiEnhancing ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin shrink-0" /> : <Sparkles className="w-3 h-3 mr-1.5 shrink-0" />}
                <span className="truncate">{isAiEnhancing ? 'Synthesizing' : 'AI Enhance'}</span>
              </Button>
            </div>

            {/* Editor Area */}
            <div className="flex-1 min-h-0 flex flex-col relative bg-[var(--cad-surface)]">
              <Textarea
                value={newJobText}
                onChange={e => onNewJobTextChange(e.target.value)}
                placeholder="Describe the geometry, e.g. Hinged electronics enclosure with M3 screw posts..."
                className="flex-1 min-h-0 w-full resize-none bg-transparent border-0 rounded-none px-5 py-5 pb-10 text-[15px] leading-7 text-[var(--cad-text)] placeholder:text-[var(--cad-text-muted)] focus-visible:ring-0 focus-visible:ring-offset-0"
                maxLength={5000}
                autoFocus
              />
              <div className="absolute bottom-4 right-5 text-[11px] font-mono tabular-nums text-[var(--cad-text-muted)] pointer-events-none">
                {newJobText.length}/5000
              </div>
            </div>

            {/* Recent & Memory (Bottom Left) */}
            <div className="shrink-0 px-5 py-4 bg-[var(--app-surface)] border-t border-[color:var(--cad-border)] space-y-4">
              <CaseMemory
                searchQuery={newJobText}
                onSuggestionClick={(job) => {
                  toast.info('Similar job found', { description: job.inputRequest.slice(0, 60) })
                }}
              />
              
              {recentRequests.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-[11px] font-semibold text-[var(--cad-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> Recent Activity
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                    {recentRequests.map((req, i) => (
                      <button
                        key={i}
                        className="shrink-0 max-w-[220px] text-left text-[12px] text-[var(--cad-text-secondary)] hover:text-[var(--cad-text)] px-2.5 py-1.5 rounded-[6px] border border-[color:var(--cad-border)] bg-[var(--cad-surface)] hover:bg-[var(--cad-surface-raised)] transition-all truncate shadow-[0_1px_2px_rgba(0,0,0,0.02)] active:scale-[0.98]"
                        onClick={() => onNewJobTextChange(req)}
                        title={req}
                      >
                        {req}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Properties Sidebar */}
          <div className="min-w-0 min-h-0 bg-[var(--app-surface)] flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--cad-border-strong) transparent' }}>
              
              {/* Engine Dropdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-[var(--cad-text-secondary)] uppercase tracking-wider flex items-center gap-1.5 min-w-0">
                    <Cpu className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Engine</span>
                  </label>
                  <button onClick={onAddProvider} className="text-[11px] text-[var(--cad-text-muted)] hover:text-[var(--cad-text)] transition-colors shrink-0">
                    Manage
                  </button>
                </div>
                <div className="relative">
                  {isLoadingModels ? (
                    <div className="h-9 w-full rounded-[7px] flex items-center px-2.5 border border-[color:var(--cad-border)] bg-[var(--cad-surface)] text-[12px] text-[var(--cad-text-muted)]">
                      <Loader2 className="w-3 h-3 animate-spin mr-2 shrink-0" /> Loading...
                    </div>
                  ) : (
                    <select
                      value={newJobModelId}
                      onChange={(e) => onNewJobModelIdChange(e.target.value)}
                      className="h-9 w-full rounded-[7px] border border-[color:var(--cad-border)] bg-[var(--cad-surface)] hover:bg-[var(--cad-surface-raised)] pl-3 pr-8 text-[12px] text-[var(--cad-text)] focus:border-[color:var(--cad-accent)] focus:ring-1 focus:ring-[var(--cad-accent)] outline-none cursor-pointer appearance-none transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.02)] truncate"
                      style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2375808b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px top 50%', backgroundSize: '8px auto' }}
                    >
                      {generationModels.length === 0 && <option value="">No engines available</option>}
                      {generationModels.map(model => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-[var(--cad-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 shrink-0" /> Labels
                </label>
                <Input
                  value={newJobTags}
                  onChange={e => onNewJobTagsChange(e.target.value)}
                  placeholder="e.g. prototype, abs"
                  className="h-9 text-[12px] bg-[var(--cad-surface)] hover:bg-[var(--cad-surface-raised)] border-[color:var(--cad-border)] placeholder:text-[var(--cad-text-muted)] focus:border-[color:var(--cad-accent)] transition-colors rounded-[7px] shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                />
                {newJobTags.trim() && (
                  <div className="pt-1.5">
                    <TagBadges customerId={buildCustomerId(newJobTags.split(',').map(t => t.trim()).filter(t => t))} maxDisplay={4} />
                  </div>
                )}
              </div>

              {/* Constraints */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-[var(--cad-text-secondary)] uppercase tracking-wider flex items-center gap-1.5 min-w-0">
                    <LockKeyhole className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Quick Modifiers</span>
                  </label>
                </div>
                <div className="space-y-3">
                  {specGroups.map(group => {
                    const Icon = group.icon
                    return (
                      <div key={group.label} className="space-y-1.5">
                        <div className="text-[11px] text-[var(--cad-text-muted)] flex items-center gap-1.5 min-w-0">
                          <Icon className="w-3 h-3 shrink-0" />
                          <span className="truncate">{group.label}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {group.values.map(value => (
                            <button
                              key={value}
                              type="button"
                              className="max-w-full px-2 py-1 text-[11px] leading-4 rounded-[5px] border border-[color:var(--cad-border)] text-[var(--cad-text-secondary)] hover:text-[var(--cad-text)] hover:border-[color:var(--cad-text-muted)] hover:bg-[var(--cad-surface)] bg-[var(--cad-surface-raised)] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] active:scale-[0.98] break-words text-left"
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
              
              <Separator className="bg-[var(--cad-border)]" />

              {/* Templates */}
              <JobTemplateCards onSelect={(template) => onNewJobTextChange(template)} />

            </div>

            {/* Footer Actions */}
            <div className="shrink-0 p-4 bg-[var(--app-surface)] border-t border-[color:var(--cad-border)] flex flex-col gap-3">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
                <Button
                  variant="ghost"
                  className="h-8 px-2.5 text-[12px] font-medium text-[var(--cad-text-secondary)] hover:text-[var(--cad-text)] hover:bg-[var(--cad-border)] rounded-[6px] transition-colors active:scale-[0.98]"
                  onClick={() => onShowComposerChange(false)}
                >
                  <X className="w-3.5 h-3.5 md:hidden" />
                  <span className="hidden md:inline">Cancel</span>
                </Button>
                <Button
                  className="h-8 min-w-0 px-3 bg-[var(--cad-accent)] hover:bg-opacity-90 text-white text-[12px] font-medium rounded-[6px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.1)] transition-all disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
                  onClick={onCreate}
                  disabled={!newJobText.trim() || !newJobModelId || isCreating}
                >
                  {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Play className="w-3.5 h-3.5 shrink-0" />}
                  <span className="truncate">Create Job</span>
                </Button>
              </div>
              <div className="hidden md:flex items-center justify-center gap-1.5 text-[10px] text-[var(--cad-text-muted)]">
                <kbd className="font-sans px-1.5 py-0.5 rounded border border-[color:var(--cad-border)] bg-[var(--cad-surface-raised)]">⌘</kbd>
                <span>+</span>
                <kbd className="font-sans px-1.5 py-0.5 rounded border border-[color:var(--cad-border)] bg-[var(--cad-surface-raised)] flex items-center gap-1">
                  Enter <CornerDownLeft className="w-2.5 h-2.5" />
                </kbd>
                <span className="ml-1">to create</span>
              </div>
            </div>

          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
