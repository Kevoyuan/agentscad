'use client'

import { motion } from 'framer-motion'
import { Beaker, Lightbulb, Globe, Target, Cpu, Layers, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Job, parseJSON } from './types'
import { SchemaInfoPanel } from './parameter-panel'
import { fadeInUp, fadeInUpTransition, staggerContainer, staggerChild, staggerTransition, scaleIn, scaleInTransition } from './motion-presets'

export function ResearchPanel({ job }: { job: Job }) {
  const research = parseJSON<Record<string, unknown> | null>(job.researchResult, null)
  const intent = parseJSON<Record<string, unknown> | null>(job.intentResult, null)
  const design = parseJSON<Record<string, unknown> | null>(job.designResult, null)

  const hasData = research || intent || design

  if (!hasData) return (
    <div className="flex flex-col items-center justify-center h-full text-[var(--app-text-dim)] gap-3 p-6">
      <div className="w-12 h-12 rounded-xl bg-[var(--app-empty-bg)] flex items-center justify-center">
        <Beaker className="w-6 h-6 opacity-30" />
      </div>
      <div className="text-center">
        <p className="text-sm">No research data yet</p>
        <p className="text-[10px] text-[var(--app-text-dim)] mt-1">Process a job to generate research</p>
      </div>
    </div>
  )

  const sections = [
    { data: research, icon: Globe, label: 'Research', color: 'text-sky-400' },
    { data: intent, icon: Lightbulb, label: 'Intent', color: 'text-amber-400' },
    { data: design, icon: Beaker, label: 'Design', color: 'text-[var(--app-accent-text)]' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[color:var(--app-border)]">
        <h3 className="text-[10px] font-mono tracking-widest text-[var(--app-text-muted)] uppercase">Research & Intent</h3>
      </div>
      <ScrollArea className="flex-1">
        <motion.div
          className="p-3 space-y-3"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {/* Part Family & Builder Tags */}
          <div className="flex items-center gap-2 flex-wrap">
            {job.partFamily && (
              <motion.div
                variants={scaleIn}
                transition={scaleInTransition}
              >
                <Badge variant="outline" className="text-[9px] h-5 bg-violet-500/10 text-violet-400 border-violet-500/20 gap-1">
                  <Target className="w-2.5 h-2.5" />{job.partFamily.replace(/_/g, ' ')}
                </Badge>
              </motion.div>
            )}
            {job.builderName && (
              <motion.div
                variants={scaleIn}
                transition={scaleInTransition}
              >
                <Badge variant="outline" className="text-[9px] h-5 bg-cyan-500/10 text-cyan-400 border-cyan-500/20 gap-1">
                  <Cpu className="w-2.5 h-2.5" />{job.builderName}
                </Badge>
              </motion.div>
            )}
            {job.generationPath && (
              <motion.div
                variants={scaleIn}
                transition={scaleInTransition}
              >
                <Badge variant="outline" className="text-[9px] h-5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1">
                  <Layers className="w-2.5 h-2.5" />{job.generationPath.replace(/_/g, ' ')}
                </Badge>
              </motion.div>
            )}
          </div>

          {/* Data Sections */}
          {sections.map(({ data, icon: Icon, label, color }) => data && (
            <motion.div
              key={label}
              variants={fadeInUp}
              transition={fadeInUpTransition}
              className="rounded-lg linear-surface linear-border overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--app-empty-bg)] border-b border-[color:var(--app-border)]">
                <Icon className={`w-3 h-3 ${color}`} />
                <span className={`text-[9px] font-mono tracking-wider ${color} uppercase`}>{label}</span>
              </div>
              <div className="p-2.5 space-y-1.5">
                {Object.entries(data).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2">
                    <span className="text-[9px] font-mono text-[var(--app-text-dim)] min-w-[90px] shrink-0">{key}</span>
                    <span className="text-[10px] text-[var(--app-text-muted)] flex-1">
                      {Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value, null, 0) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}

          {/* Parameter Schema Summary */}
          {job.parameterSchema && (
            <motion.div
              variants={fadeInUp}
              transition={fadeInUpTransition}
              className="rounded-lg linear-surface linear-border overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--app-empty-bg)] border-b border-[color:var(--app-border)]">
                <Info className="w-3 h-3 text-emerald-400" />
                <span className="text-[9px] font-mono tracking-wider text-emerald-400 uppercase">Schema Info</span>
              </div>
              <div className="p-2.5">
                <SchemaInfoPanel schemaStr={job.parameterSchema} />
              </div>
            </motion.div>
          )}
        </motion.div>
      </ScrollArea>
    </div>
  )
}
