'use client'

import { ChevronRight } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PIPELINE_STEPS } from './types'

export function PipelineVisualization({ state }: { state: string }) {
  const currentIdx = PIPELINE_STEPS.findIndex(s => s.key === state)
  const failedStates = ['GEOMETRY_FAILED', 'RENDER_FAILED', 'VALIDATION_FAILED']
  const isFailed = failedStates.includes(state)

  return (
    <div className="flex items-center gap-0.5 px-2 py-1">
      {PIPELINE_STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx
        const isCurrent = idx === currentIdx
        const Icon = step.icon

        return (
          <div key={step.key} className="flex items-center">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md transition-all duration-300 ${
                    isCompleted ? 'text-lime-400' :
                    isCurrent && !isFailed ? 'text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/20' :
                    isCurrent && isFailed ? 'text-rose-400 bg-rose-500/10 ring-1 ring-rose-500/20' :
                    'text-zinc-600'
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${isCurrent && !isFailed ? 'animate-pulse' : ''}`} />
                    <span className="text-[8px] font-mono tracking-wider">{step.label}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{step.label}: {step.key.replace(/_/g, ' ')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {idx < PIPELINE_STEPS.length - 1 && (
              <ChevronRight className={`w-2.5 h-2.5 mx-0.5 transition-colors duration-300 ${idx < currentIdx ? 'text-lime-500/60' : 'text-zinc-700'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
