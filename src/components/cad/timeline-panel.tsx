'use client'

import { motion } from 'framer-motion'
import { Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Job, ExecutionLog, parseJSON, formatTime } from './types'

export function TimelinePanel({ job }: { job: Job }) {
  const logs = parseJSON<ExecutionLog[]>(job.executionLogs, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Timeline</h3>
        <Badge variant="outline" className="text-[9px] h-4 bg-zinc-800/50 text-zinc-500 border-zinc-700/50">
          {logs.length} events
        </Badge>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {logs.map((log, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-800/40 transition-colors group"
            >
              <span className="text-[8px] font-mono text-zinc-700 mt-0.5 whitespace-nowrap">{formatTime(log.timestamp)}</span>
              <span className={`text-[8px] font-mono px-1 py-0.5 rounded shrink-0 ${
                log.event.includes('FAILED') ? 'bg-rose-500/10 text-rose-400' :
                log.event === 'DELIVERED' ? 'bg-lime-500/10 text-lime-400' :
                log.event === 'SCAD_GENERATED' ? 'bg-amber-500/10 text-amber-400' :
                log.event === 'RENDERED' ? 'bg-cyan-500/10 text-cyan-400' :
                log.event === 'VALIDATED' ? 'bg-emerald-500/10 text-emerald-400' :
                'bg-zinc-800/60 text-zinc-400'
              }`}>{log.event}</span>
              <span className="text-[11px] text-zinc-500 flex-1">{log.message}</span>
            </motion.div>
          ))}
          {logs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-600 gap-2">
              <Clock className="w-6 h-6 opacity-30" />
              <span className="text-xs">No events yet</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
