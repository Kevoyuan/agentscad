'use client'

import { useState } from 'react'
import { CheckCircle2, FileCode, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

export function ScadViewer({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false)

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">SCAD Source</h3>
        <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300" onClick={handleCopy}>
          {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <pre className="p-4 text-xs font-mono leading-relaxed text-emerald-300/80 whitespace-pre overflow-x-auto">
          <code>{code}</code>
        </pre>
      </ScrollArea>
    </div>
  )
}
