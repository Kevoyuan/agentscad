'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, FileCode, Copy, Edit3, Save, RotateCcw, Code2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Job } from './types'
import { updateScadSource } from './api'
import { highlightScad } from '@/lib/scad-highlight'

// ─── SCAD Editor Component ────────────────────────────────────────────────

interface ScadEditorProps {
  job: Job
  onUpdate: () => void
}

export function ScadEditor({ job, onUpdate }: ScadEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editSource, setEditSource] = useState(job.scadSource || '')
  const [isSaving, setIsSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync edit source when job changes
  useEffect(() => {
    if (!isEditing) {
      setEditSource(job.scadSource || '')
    }
  }, [job.scadSource, isEditing])

  const lineCount = useMemo(() => {
    const source = isEditing ? editSource : (job.scadSource || '')
    return source.split('\n').length
  }, [isEditing, editSource, job.scadSource])

  const charCount = useMemo(() => {
    const source = isEditing ? editSource : (job.scadSource || '')
    return source.length
  }, [isEditing, editSource, job.scadSource])

  const highlightedCode = useMemo(() => {
    if (isEditing) return '' // Don't highlight while editing
    if (!job.scadSource) return ''
    return highlightScad(job.scadSource)
  }, [isEditing, job.scadSource])

  // Diff: compute which lines have changed
  const changedLines = useMemo(() => {
    if (!isEditing || !job.scadSource) return new Set<number>()
    const originalLines = job.scadSource.split('\n')
    const editedLines = editSource.split('\n')
    const changed = new Set<number>()
    const maxLen = Math.max(originalLines.length, editedLines.length)
    for (let i = 0; i < maxLen; i++) {
      if (originalLines[i] !== editedLines[i]) {
        changed.add(i + 1) // 1-indexed
      }
    }
    return changed
  }, [isEditing, editSource, job.scadSource])

  const hasChanges = useMemo(() => {
    return editSource !== (job.scadSource || '')
  }, [editSource, job.scadSource])

  const handleSave = async () => {
    if (!hasChanges) return
    setIsSaving(true)
    try {
      await updateScadSource(job.id, editSource)
      setIsEditing(false)
      onUpdate()
    } catch (err) {
      console.error('Failed to save SCAD:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setEditSource(job.scadSource || '')
  }

  const handleCopy = () => {
    const source = isEditing ? editSource : (job.scadSource || '')
    navigator.clipboard.writeText(source)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = editSource.substring(0, start) + '    ' + editSource.substring(end)
      setEditSource(newValue)
      // Set cursor position after the inserted spaces
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 4
      })
    }

    if (e.key === 'Enter') {
      // Auto-indent: match the indentation of the current line
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return
      const start = textarea.selectionStart
      const currentLine = editSource.substring(0, start).split('\n').pop() || ''
      const indent = currentLine.match(/^(\s*)/)?.[1] || ''
      // Add extra indent if line ends with { or (
      const extraIndent = /[{(]\s*$/.test(currentLine) ? '    ' : ''
      const insertion = '\n' + indent + extraIndent
      const newValue = editSource.substring(0, start) + insertion + editSource.substring(textarea.selectionEnd)
      setEditSource(newValue)
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + insertion.length
      })
    }

    // Ctrl/Cmd + S to save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (hasChanges) handleSave()
    }

    // Escape to exit edit mode
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsEditing(false)
    }
  }, [editSource, hasChanges, handleSave])

  if (!job.scadSource && !isEditing) return (
    <div className="flex flex-col items-center justify-center h-full text-[var(--app-text-dim)] gap-3 p-6">
      <div className="w-12 h-12 rounded-xl bg-[var(--app-empty-bg)] flex items-center justify-center">
        <FileCode className="w-6 h-6 opacity-30" />
      </div>
      <p className="text-sm">No SCAD source</p>
    </div>
  )

  const displayLines = isEditing ? editSource.split('\n') : (job.scadSource || '').split('\n')

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[color:var(--app-border)] shrink-0">
        <h3 className="text-[10px] font-mono tracking-widest text-[var(--app-text-muted)] uppercase flex items-center gap-1.5">
          <Code2 className="w-3 h-3" />
          SCAD Source
          {isEditing && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-amber-400 text-[8px] ml-1"
            >
              EDITING
            </motion.span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] h-4 bg-[var(--app-surface-raised)] text-[var(--app-text-muted)] border-[color:var(--app-border)]">
            {lineCount} lines
          </Badge>
          {!isEditing ? (
            <>
              <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]" onClick={handleCopy}>
                {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[9px] gap-1 text-[var(--app-accent-text)] hover:text-[var(--app-accent-text)]"
                onClick={() => { setIsEditing(true); setEditSource(job.scadSource || '') }}
              >
                <Edit3 className="w-3 h-3" />Edit
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[9px] gap-1 text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
                onClick={handleReset}
                disabled={!hasChanges}
              >
                <RotateCcw className="w-3 h-3" />Reset
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-5 text-[9px] gap-1 ${hasChanges ? 'text-emerald-400 hover:text-emerald-300' : 'text-[var(--app-text-dim)]'}`}
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
              >
                {isSaving ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }} className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full" /> : <Save className="w-3 h-3" />}
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-hidden relative">
        {isEditing ? (
          <div className="flex h-full">
            {/* Line numbers (editing) */}
            <div className="flex flex-col items-end pr-3 pl-4 py-4 select-none border-r border-[color:var(--app-border)] bg-[var(--app-bg)] shrink-0 overflow-hidden">
              {displayLines.map((_, idx) => (
                <span
                  key={idx}
                  className={`text-[10px] font-mono leading-[20px] ${
                    changedLines.has(idx + 1) ? 'text-amber-400/60' : 'text-[var(--app-text-dim)]'
                  }`}
                >
                  {idx + 1}
                </span>
              ))}
            </div>
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={editSource}
              onChange={e => setEditSource(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 p-4 text-xs font-mono leading-[20px] bg-[var(--app-bg)] text-[var(--app-text-primary)] resize-none outline-none border-none whitespace-pre overflow-auto"
              spellCheck={false}
              autoFocus
            />
            {/* Diff indicators overlay on right */}
            <div className="absolute right-0 top-0 py-4 pr-1 flex flex-col pointer-events-none">
              {displayLines.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-1 h-[20px] rounded-l ${
                    changedLines.has(idx + 1) ? 'bg-amber-500/40' : 'bg-transparent'
                  }`}
                />
              ))}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex">
              {/* Line numbers (view mode) */}
              <div className="flex flex-col items-end pr-3 pl-4 py-4 select-none border-r border-[color:var(--app-border)]">
                {displayLines.map((_, idx) => (
                  <span key={idx} className="text-[10px] font-mono leading-[20px] text-[var(--app-text-dim)]">
                    {idx + 1}
                  </span>
                ))}
              </div>
              {/* Code content */}
              <pre className="p-4 text-xs font-mono leading-[20px] whitespace-pre overflow-x-auto flex-1">
                <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
              </pre>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-[color:var(--app-border)] shrink-0 bg-[var(--app-surface)]">
        <div className="flex items-center gap-3 text-[9px] font-mono text-[var(--app-text-dim)]">
          <span>{charCount} chars</span>
          <span>{lineCount} lines</span>
          {isEditing && hasChanges && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-amber-400"
            >
              {changedLines.size} changed
            </motion.span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[9px] font-mono text-[var(--app-text-dim)]">
          {isEditing && (
            <span>Tab: indent · Enter: auto-indent · Esc: cancel · ⌘S: save</span>
          )}
        </div>
      </div>
    </div>
  )
}
