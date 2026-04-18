'use client'

import { useState, useMemo } from 'react'
import { CheckCircle2, FileCode, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

// ─── OpenSCAD Syntax Highlighter ────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function highlightScad(code: string): string {
  // Tokenize and highlight OpenSCAD code
  // Order matters: comments and strings first (to avoid highlighting inside them)

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
      // Block comment /* ... */
      if (line[i] === '/' && i + 1 < line.length && line[i + 1] === '*') {
        let end = line.indexOf('*/', i + 2)
        if (end === -1) {
          // Unterminated block comment - rest of line is comment
          result += `<span class="text-zinc-600 italic">${escapeHtml(line.slice(i))}</span>`
          i = line.length
        } else {
          result += `<span class="text-zinc-600 italic">${escapeHtml(line.slice(i, end + 2))}</span>`
          i = end + 2
        }
        continue
      }

      // Line comment //
      if (line[i] === '/' && i + 1 < line.length && line[i + 1] === '/') {
        result += `<span class="text-zinc-600 italic">${escapeHtml(line.slice(i))}</span>`
        i = line.length
        continue
      }

      // String literal "..."
      if (line[i] === '"') {
        let j = i + 1
        while (j < line.length && line[j] !== '"') {
          if (line[j] === '\\') j++ // skip escaped char
          j++
        }
        if (j < line.length) j++ // include closing quote
        result += `<span class="text-emerald-400">${escapeHtml(line.slice(i, j))}</span>`
        i = j
        continue
      }

      // Variable ($fn, $fa, $fs, etc.)
      if (line[i] === '$' && i + 1 < line.length && /[a-zA-Z_]/.test(line[i + 1])) {
        let j = i + 1
        while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++
        result += `<span class="text-rose-400">${escapeHtml(line.slice(i, j))}</span>`
        i = j
        continue
      }

      // Number (including decimal)
      if (/[0-9]/.test(line[i]) || (line[i] === '.' && i + 1 < line.length && /[0-9]/.test(line[i + 1]))) {
        let j = i
        // Integer part
        while (j < line.length && /[0-9]/.test(line[j])) j++
        // Decimal part
        if (j < line.length && line[j] === '.' && j + 1 < line.length && /[0-9]/.test(line[j + 1])) {
          j++ // skip the dot
          while (j < line.length && /[0-9]/.test(line[j])) j++
        }
        // Scientific notation
        if (j < line.length && (line[j] === 'e' || line[j] === 'E')) {
          j++
          if (j < line.length && (line[j] === '+' || line[j] === '-')) j++
          while (j < line.length && /[0-9]/.test(line[j])) j++
        }
        result += `<span class="text-amber-300">${escapeHtml(line.slice(i, j))}</span>`
        i = j
        continue
      }

      // Identifier (keyword, builtin, or special value check)
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

      // Operators
      if ('=+-*/%<>!&|'.includes(line[i])) {
        let op = line[i]
        let j = i + 1
        // Two-character operators
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

      // Default: pass through
      result += escapeHtml(line[i])
      i++
    }

    return result
  })

  return highlighted.join('\n')
}

export function ScadViewer({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false)

  const lineCount = useMemo(() => {
    if (!code) return 0
    return code.split('\n').length
  }, [code])

  const highlightedCode = useMemo(() => {
    if (!code) return ''
    return highlightScad(code)
  }, [code])

  if (!code) return (
    <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3 p-6">
      <div className="w-12 h-12 rounded-xl bg-zinc-800/30 flex items-center justify-center">
        <FileCode className="w-6 h-6 opacity-30" />
      </div>
      <p className="text-sm">No SCAD source</p>
    </div>
  )

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lines = highlightedCode.split('\n')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">SCAD Source</h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] h-4 bg-zinc-800/50 text-zinc-500 border-zinc-700/50">
            {lineCount} lines
          </Badge>
          <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300" onClick={handleCopy}>
            {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex">
          {/* Line numbers */}
          <div className="flex flex-col items-end pr-3 pl-4 py-4 select-none border-r border-zinc-800/30">
            {lines.map((_, idx) => (
              <span key={idx} className="text-[10px] font-mono leading-relaxed text-zinc-700">
                {idx + 1}
              </span>
            ))}
          </div>
          {/* Code content */}
          <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre overflow-x-auto flex-1">
            <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
          </pre>
        </div>
      </ScrollArea>
    </div>
  )
}
