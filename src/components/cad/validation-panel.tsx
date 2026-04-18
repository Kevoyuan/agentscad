'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, AlertTriangle, Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Job, ValidationResult, parseJSON } from './types'
import { fadeInUp, fadeInUpTransition, staggerContainer, staggerChild, staggerTransition } from './motion-presets'

export function ValidationPanel({ job }: { job: Job }) {
  const results = parseJSON<ValidationResult[]>(job.validationResults, [])
  if (results.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3 p-6">
      <div className="w-12 h-12 rounded-xl bg-zinc-800/30 flex items-center justify-center">
        <Shield className="w-6 h-6 opacity-30" />
      </div>
      <p className="text-sm">No validation results</p>
    </div>
  )

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const score = Math.round((passed / results.length) * 100)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Validation</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-8 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${score === 100 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${score}%` }} />
            </div>
            <span className="text-[9px] font-mono text-zinc-500">{score}%</span>
          </div>
          <Badge variant="outline" className="text-[9px] h-4 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">{passed}✓</Badge>
          {failed > 0 && <Badge variant="outline" className="text-[9px] h-4 bg-rose-500/10 text-rose-400 border-rose-500/20">{failed}✗</Badge>}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <motion.div
          className="p-2 space-y-1"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {results.map((r, i) => (
            <motion.div
              key={i}
              variants={staggerChild}
              transition={staggerTransition}
              className={`flex items-start gap-2 p-2.5 rounded-lg transition-colors ${
                r.passed
                  ? 'bg-zinc-900/40 hover:bg-zinc-900/60'
                  : 'bg-rose-500/5 border border-rose-500/10 hover:bg-rose-500/10'
              }`}
            >
              {r.passed
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                : <XCircle className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono text-zinc-600 bg-zinc-800/50 px-1 rounded">{r.rule_id}</span>
                  <span className="text-xs text-zinc-300">{r.rule_name}</span>
                  {r.is_critical && (
                    <span className="flex items-center gap-0.5 text-[8px] text-amber-500">
                      <AlertTriangle className="w-2.5 h-2.5" />CRITICAL
                    </span>
                  )}
                  <Badge variant="outline" className="text-[8px] h-3 px-1 border-zinc-700/50 text-zinc-500">{r.level}</Badge>
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">{r.message}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </ScrollArea>
    </div>
  )
}
