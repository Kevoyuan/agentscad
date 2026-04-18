'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, FileCode, Copy, Edit3, Save, RotateCcw, Code2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Job } from './types'
import { updateScadSource } from './api'

// ─── OpenSCAD Syntax Highlighter ────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function highlightScad(code: string): string {
  const keywords = ['module', 'function', 'if', 'else', 'for', 'each', 'let', 'assign']
  const builtins = [
    'cube', 'cylinder', 'sphere', 'translate', 'rotate', 'difference', 'union',
    'intersection', 'linear_extrude', 'rotate_extrude', 'hull', 'minkowski',
    'offset', 'color', 'echo', 'scale', 'resize', 'mirror', 'multmatrix',
    'projection', 'render', 'children', 'search', 'concat', 'lookup',
    'min', 'max', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
    'abs', 'ceil', 'floor', 'round', 'pow', 'sqrt', 'exp', 'log', 'ln',
    'len', 'str', 'chr', 'ord', 'norm', 'cross', 'rands', 'vector',
  ]
  const specialValues = ['true', 'false', 'undef']
  const keywordPattern = new RegExp(`\\b(${keywords.join('|')})\\b`)
  const builtinPattern = new RegExp(`\\b(${builtins.join('|')})\\b`)
  const specialValuePattern = new RegExp(`\\b(${specialValues.join('|')})\\b`)

  const lines = code.split('\n')
  const highlighted = lines.map(line => {
    let result = ''
    let i = 0

    while (i < line.length) {
      if (line[i] === '/' && i + 1 < line.length && line[i + 1] === '*') {
        let end = line.indexOf('*/', i + 2)
        if (end === -1) {
          result += `<span class="text-zinc-600 italic">${escapeHtml(line.slice(i))}</span>`
          i = line.length
        } else {
          result += `<span class="text-zinc-600 italic">${escapeHtml(line.slice(i, end + 2))}</span>`
          i = end + 2
        }
        continue
      }

      if (line[i] === '/' && i + 1 < line.length && line[i + 1] === '/') {
        result += `<span class="text-zinc-600 italic">${escapeHtml(line.slice(i))}</span>`
        i = line.length
        continue
      }

      if (line[i] === '"') {
        let j = i + 1
        while (j < line.length && line[j] !== '"') {
          if (line[j] === '\\') j++
          j++
        }
        if (j < line.length) j++
        result += `<span class="text-emerald-400">${escapeHtml(line.slice(i, j))}</span>`
        i = j
        continue
      }

      if (line[i] === '$' && i + 1 < line.length && /[a-zA-Z_]/.test(line[i + 1])) {
        let j = i + 1
        while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++
        result += `<span class="text-rose-400">${escapeHtml(line.slice(i, j))}</span>`
        i = j
        continue
      }

      if (/[0-9]/.test(line[i]) || (line[i] === '.' && i + 1 < line.length && /[0-9]/.test(line[i + 1]))) {
        let j = i
        while (j < line.length && /[0-9]/.test(line[j])) j++
        if (j < line.length && line[j] === '.' && j + 1 < line.length && /[0-9]/.test(line[j + 1])) {
          j++
          while (j < line.length && /[0-9]/.test(line[j])) j++
        }
        if (j < line.length && (line[j] === 'e' || line[j] === 'E')) {
          j++
          if (j < line.length && (line[j] === '+' || line[j] === '-')) j++
          while (j < line.length && /[0-9]/.test(line[j])) j++
        }
        result += `<span class="text-amber-300">${escapeHtml(line.slice(i, j))}</span>`
        i = j
        continue
      }

      if (/[a-zA-Z_]/.test(line[i])) {
        let j = i
        while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++
        const word = line.slice(i, j)
        if (keywordPattern.test(word)) {
          result += `<span class="text-violet-400">${word}</span>`
        } else if (builtinPattern.test(word)) {
          result += `<span class="text-cyan-400">${word}</span>`
        } else if (specialValuePattern.test(word)) {
          result += `<span class="text-orange-400">${word}</span>`
        } else {
          result += escapeHtml(word)
        }
        i = j
        continue
      }

      if ('=+-*/%<>!&|'.includes(line[i])) {
        let op = line[i]
        let j = i + 1
        if (j < line.length) {
          const twoChar = line.slice(i, j + 1)
          if (['==', '!=', '<=', '>=', '&&', '||'].includes(twoChar)) {
            op = twoChar
            j = i + 2
          }
        }
        result += `<span class="text-zinc-500">${escapeHtml(op)}</span>`
        i = j
        continue
      }

      result += escapeHtml(line[i])
      i++
    }

    return result
  })

  return highlighted.join('\n')
}

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
    <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3 p-6">
      <div className="w-12 h-12 rounded-xl bg-zinc-800/30 flex items-center justify-center">
        <FileCode className="w-6 h-6 opacity-30" />
      </div>
      <p className="text-sm">No SCAD source</p>
    </div>
  )

  const originalLines = (job.scadSource || '').split('\n')
  const displayLines = isEditing ? editSource.split('\n') : originalLines

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 shrink-0">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase flex items-center gap-1.5">
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
          <Badge variant="outline" className="text-[9px] h-4 bg-zinc-800/50 text-zinc-500 border-zinc-700/50">
            {lineCount} lines
          </Badge>
          {!isEditing ? (
            <>
              <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300" onClick={handleCopy}>
                {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[9px] gap-1 text-violet-400 hover:text-violet-300"
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
                className="h-5 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300"
                onClick={handleReset}
                disabled={!hasChanges}
              >
                <RotateCcw className="w-3 h-3" />Reset
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-5 text-[9px] gap-1 ${hasChanges ? 'text-emerald-400 hover:text-emerald-300' : 'text-zinc-600'}`}
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
            <div className="flex flex-col items-end pr-3 pl-4 py-4 select-none border-r border-zinc-800/30 bg-[#080810] shrink-0 overflow-hidden">
              {displayLines.map((_, idx) => (
                <span
                  key={idx}
                  className={`text-[10px] font-mono leading-[20px] ${
                    changedLines.has(idx + 1) ? 'text-amber-400/60' : 'text-zinc-700'
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
              className="flex-1 p-4 text-xs font-mono leading-[20px] bg-[#080810] text-zinc-200 resize-none outline-none border-none whitespace-pre overflow-auto"
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
              <div className="flex flex-col items-end pr-3 pl-4 py-4 select-none border-r border-zinc-800/30">
                {displayLines.map((_, idx) => (
                  <span key={idx} className="text-[10px] font-mono leading-[20px] text-zinc-700">
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
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-zinc-800/60 shrink-0 bg-[#0a0818]/50">
        <div className="flex items-center gap-3 text-[9px] font-mono text-zinc-600">
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
        <div className="flex items-center gap-2 text-[9px] font-mono text-zinc-700">
          {isEditing && (
            <span>Tab: indent · Enter: auto-indent · Esc: cancel · ⌘S: save</span>
          )}
        </div>
      </div>
    </div>
  )
}
