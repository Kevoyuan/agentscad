'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { StickyNote, Save, Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Job } from './types'
import { updateNotes } from './api'
import { useToast } from '@/hooks/use-toast'

const MAX_CHARS = 2000

export function NotesPanel({ job, onUpdate }: { job: Job; onUpdate: () => void }) {
  const [notes, setNotes] = useState(job.notes || '')
  const [isSaving, setIsSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    setNotes(job.notes || '')
  }, [job.notes])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateNotes(job.id, notes)
      onUpdate()
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
      toast({ title: 'Notes saved', duration: 1500 })
    } catch {
      toast({ title: 'Failed to save notes', variant: 'destructive', duration: 2000 })
    } finally {
      setIsSaving(false)
    }
  }

  const handleChange = (val: string) => {
    setNotes(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateNotes(job.id, val).then(() => {
        onUpdate()
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 2000)
      }).catch(() => {})
    }, 1500)
  }

  // Character count color: green → amber → red
  const charRatio = notes.length / MAX_CHARS
  const charColor = charRatio > 0.9 ? 'text-rose-400' : charRatio > 0.7 ? 'text-amber-400' : 'text-emerald-400'

  // Simple markdown-like preview
  const renderPreview = (text: string) => {
    return text
      .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-zinc-300 mt-2 mb-1">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold text-zinc-200 mt-3 mb-1">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-base font-bold text-zinc-100 mt-3 mb-1">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-zinc-200">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em class="text-zinc-300">$1</em>')
      .replace(/^- (.+)$/gm, '<li class="ml-3 text-zinc-400">• $1</li>')
      .replace(/`(.+?)`/g, '<code class="bg-zinc-800/60 px-1 rounded text-violet-400 text-[10px]">$1</code>')
      .replace(/\n/g, '<br />')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase flex items-center gap-1.5">
          <StickyNote className="w-3 h-3 text-amber-400" />Notes
        </h3>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-mono tabular-nums ${charColor}`}>
            {notes.length}/{MAX_CHARS}
          </span>
          {/* Auto-save indicator dot */}
          <AnimatePresence>
            {justSaved && (
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                title="Auto-saved"
              />
            )}
          </AnimatePresence>
          {isSaving && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[9px] gap-1 text-zinc-500 hover:text-violet-300"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showPreview ? 'Edit' : 'Preview'}
          </Button>
          <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300" onClick={handleSave}>
            <Save className="w-3 h-3" />Save
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3">
          <AnimatePresence mode="wait">
            {showPreview ? (
              <motion.div
                key="preview"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap bg-[var(--app-surface)] rounded-lg p-3 border border-[color:var(--app-border)] min-h-[200px]"
                dangerouslySetInnerHTML={{ __html: notes ? renderPreview(notes) : '<span class="text-zinc-700 italic">No notes yet...</span>' }}
              />
            ) : (
              <motion.div
                key="editor"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                <Textarea
                  value={notes}
                  onChange={(e) => handleChange(e.target.value.slice(0, MAX_CHARS))}
                  placeholder="Add notes about this job...&#10;&#10;Supports **bold**, *italic*, `code`, and # headers."
                  className="min-h-[200px] bg-[var(--app-bg)] border-[color:var(--app-border)] text-xs text-zinc-300 placeholder:text-[var(--app-text-dim)] resize-y focus:border-amber-500/40"
                />
              </motion.div>
            )}
          </AnimatePresence>
          {!showPreview && notes.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-[9px] font-mono tracking-widest text-zinc-600 uppercase flex items-center justify-between">
                <span>Preview</span>
                <span className="text-[8px] text-zinc-700">Supports **bold**, *italic*, `code`</span>
              </div>
              <div
                className="text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap bg-[var(--app-surface)] rounded-lg p-3 border border-[color:var(--app-border)] max-h-40 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: renderPreview(notes) }}
              />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
