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
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  {
    id: 'spur-gear',
    name: 'Spur Gear',
    description: 'Standard involute gear profile',
    template: 'A spur gear with {teeth} teeth, {bore}mm bore diameter, and {faceWidth}mm face width',
    icon: Cog,
    color: 'text-[var(--cad-accent)] bg-[var(--cad-accent-soft)] border-[color:var(--cad-border)]',
  },
  {
    id: 'phone-stand',
    name: 'Phone Stand',
    description: 'Adjustable desk stand for devices',
    template: 'A phone stand with {width}mm device width, {height}mm height, and {angle}° viewing angle',
    icon: Smartphone,
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  },
  {
    id: 'l-bracket',
    name: 'L-Bracket',
    description: 'Structural right-angle bracket',
    template: 'A parametric L-bracket with {arm}mm arm length, {wall}mm wall thickness, and counterbore holes',
    icon: Triangle,
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  },
  {
    id: 'hex-bolt',
    name: 'Hex Bolt',
    description: 'Standard hexagonal bolt fastener',
    template: 'A hexagonal bolt with {head}mm head diameter and {shaft}mm shaft length, M{thread} thread',
    icon: Wrench,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    id: 'custom-pipe',
    name: 'Custom Pipe',
    description: 'Hollow cylindrical pipe section',
    template: 'A {length}mm pipe with {outerDiam}mm outer diameter and {innerDiam}mm inner diameter',
    icon: Cylinder,
    color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  },
]

export function JobTemplateCards({
  onSelect,
}: {
  onSelect: (template: string) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-[13px] font-mono tracking-widest text-[var(--app-text-secondary)] uppercase block">
        Templates
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        {JOB_TEMPLATES.map((t) => {
          const Icon = t.icon
          return (
            <motion.button
              key={t.id}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left linear-transition ${t.color} hover:brightness-125`}
              onClick={() => onSelect(t.template)}
            >
              <Icon className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-tight">{t.name}</p>
                <p className="text-xs opacity-70 mt-0.5 leading-tight line-clamp-2">{t.description}</p>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
