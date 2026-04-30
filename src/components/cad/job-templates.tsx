'use client'

import { motion } from 'framer-motion'
import {
  Box, Cog, Smartphone, CircuitBoard, Triangle, Wrench, Cylinder,
} from 'lucide-react'

export interface JobTemplate {
  id: string
  name: string
  description: string
  template: string
  icon: React.ElementType
  color: string
}

export const JOB_TEMPLATES: JobTemplate[] = [
  {
    id: 'electronics-enclosure',
    name: 'Electronics Enclosure',
    description: 'Parametric box for PCBs and electronics',
    template: 'A {width}×{depth}×{height}mm electronics enclosure with {wall}mm walls, snap-fit lid, and mounting holes',
    icon: CircuitBoard,
    color: 'text-[var(--cad-text-secondary)] group-hover:text-[var(--cad-text)]',
  },
  {
    id: 'spur-gear',
    name: 'Spur Gear',
    description: 'Standard involute gear profile',
    template: 'A spur gear with {teeth} teeth, {bore}mm bore diameter, and {faceWidth}mm face width',
    icon: Cog,
    color: 'text-[var(--cad-text-secondary)] group-hover:text-[var(--cad-text)]',
  },
  {
    id: 'phone-stand',
    name: 'Phone Stand',
    description: 'Adjustable desk stand for devices',
    template: 'A phone stand with {width}mm device width, {height}mm height, and {angle}° viewing angle',
    icon: Smartphone,
    color: 'text-[var(--cad-text-secondary)] group-hover:text-[var(--cad-text)]',
  },
  {
    id: 'l-bracket',
    name: 'L-Bracket',
    description: 'Structural right-angle bracket',
    template: 'A parametric L-bracket with {arm}mm arm length, {wall}mm wall thickness, and counterbore holes',
    icon: Triangle,
    color: 'text-[var(--cad-text-secondary)] group-hover:text-[var(--cad-text)]',
  },
  {
    id: 'hex-bolt',
    name: 'Hex Bolt',
    description: 'Standard hexagonal bolt fastener',
    template: 'A hexagonal bolt with {head}mm head diameter and {shaft}mm shaft length, M{thread} thread',
    icon: Wrench,
    color: 'text-[var(--cad-text-secondary)] group-hover:text-[var(--cad-text)]',
  },
  {
    id: 'custom-pipe',
    name: 'Custom Pipe',
    description: 'Hollow cylindrical pipe section',
    template: 'A {length}mm pipe with {outerDiam}mm outer diameter and {innerDiam}mm inner diameter',
    icon: Cylinder,
    color: 'text-[var(--cad-text-secondary)] group-hover:text-[var(--cad-text)]',
  },
]

export function JobTemplateCards({
  onSelect,
}: {
  onSelect: (template: string) => void
}) {
  return (
    <div className="space-y-2.5">
      <label className="text-[11px] font-semibold text-[var(--cad-text-secondary)] uppercase tracking-wider block">
        Templates
      </label>
      <div className="flex flex-col gap-1.5">
        {JOB_TEMPLATES.map((t) => {
          const Icon = t.icon
          return (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.98 }}
              className="group flex items-center gap-3 p-2 rounded-md border border-transparent hover:bg-[var(--cad-surface-raised)] hover:border-[color:var(--cad-border)] text-left transition-all"
              onClick={() => onSelect(t.template)}
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-sm bg-[var(--cad-surface-raised)] group-hover:bg-[var(--cad-surface)] border border-[color:var(--cad-border)] shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <Icon className={`w-3.5 h-3.5 transition-colors ${t.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium leading-none text-[var(--cad-text)] truncate">{t.name}</p>
                <p className="text-[11px] text-[var(--cad-text-muted)] mt-0.5 leading-none truncate">{t.description}</p>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
