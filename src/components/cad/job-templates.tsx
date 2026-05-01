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
    <div className="space-y-3">
      <label className="block text-[11px] font-semibold uppercase text-[var(--cad-text-secondary)]">
        Templates
      </label>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {JOB_TEMPLATES.map((t) => {
          const Icon = t.icon
          return (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.98 }}
              className="group flex min-w-0 items-center gap-2.5 rounded-[7px] border border-[color:var(--cad-border)] bg-[var(--cad-surface)] p-2 text-left shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all hover:border-[color:var(--cad-accent)] hover:bg-[var(--cad-accent-soft)]"
              onClick={() => onSelect(t.template)}
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border border-[color:var(--cad-border)] bg-[var(--cad-surface-raised)] shadow-[0_1px_2px_rgba(15,23,42,0.03)] group-hover:bg-[var(--cad-surface)]">
                <Icon className={`h-3.5 w-3.5 transition-colors ${t.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium leading-4 text-[var(--cad-text)]">{t.name}</p>
                <p className="mt-0.5 truncate text-[11px] leading-4 text-[var(--cad-text-muted)]">{t.description}</p>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
