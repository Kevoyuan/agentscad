'use client'

import { useState, useEffect, useRef } from 'react'
import { StickyNote, Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Job } from './types'
import { updateNotes } from './api'
import { useToast } from '@/hooks/use-toast'

export function NotesPanel({ job, onUpdate }: { job: Job; onUpdate: () => void }) {
  const [notes, setNotes] = useState(job.notes || '')
  const [isSaving, setIsSaving] = useState(false)
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
      updateNotes(job.id, val).then(() => onUpdate()).catch(() => {})
    }, 1500)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase flex items-center gap-1.5">
          <StickyNote className="w-3 h-3 text-amber-400" />Notes
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] h-4 bg-zinc-800/50 text-zinc-500 border-zinc-700/50">
            {notes.length} chars
          </Badge>
          {isSaving && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
          <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300" onClick={handleSave}>
            <Save className="w-3 h-3" />Save
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3">
          <Textarea
            value={notes}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Add notes about this job...&#10;&#10;Supports free-form text for observations, todo items, or design decisions."
            className="min-h-[200px] bg-[#0c0a14] border-zinc-800/60 text-xs text-zinc-300 placeholder:text-zinc-700 resize-y focus:border-amber-500/40"
          />
          {notes.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-[9px] font-mono tracking-widest text-zinc-600 uppercase">Preview</div>
              <div className="text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap bg-zinc-900/40 rounded-lg p-3 border border-zinc-800/40">
                {notes}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
