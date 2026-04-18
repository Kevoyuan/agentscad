'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  CheckCircle2,
  Clock,
  Layers,
  TrendingUp,
  Zap,
} from 'lucide-react'
import {
  fadeInUp,
  fadeInUpTransition,
  staggerContainer,
  staggerChild,
  staggerTransition,
  pulseGlow,
  pulseGlowTransition,
  successPop,
  successPopTransition,
} from './motion-presets'
import { Job, STATE_COLORS, parseJSON } from './types'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StatsData {
  totalJobs: number
  jobsByState: Record<string, number>
  avgProcessingTimeMs: number
  successRate: number
  jobsCreatedToday: number
  mostCommonPartFamily: string
  recentActivity: Array<{ hour: number; count: number }>
}

interface StatsDashboardProps {
  jobs: Job[]
  onClose?: () => void
}

// ─── Animated Counter ───────────────────────────────────────────────────────

function AnimatedCounter({
  value,
  duration = 1.2,
  className = '',
  decimals = 0,
  prefix = '',
  suffix = '',
}: {
  value: number
  duration?: number
  className?: string
  decimals?: number
  prefix?: string
  suffix?: string
}) {
  const [display, setDisplay] = useState(0)
  const prevValueRef = useRef(0)

  useEffect(() => {
    const startTime = Date.now()
    const startVal = prevValueRef.current
    const diff = value - startVal
    prevValueRef.current = value

    if (Math.abs(diff) < 0.01) return

    const step = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / (duration * 1000), 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(startVal + diff * eased)
      if (progress < 1) {
        requestAnimationFrame(step)
      }
    }

    const frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [value, duration])

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {decimals > 0 ? display.toFixed(decimals) : Math.round(display)}
      {suffix}
    </span>
  )
}

// ─── Progress Ring ──────────────────────────────────────────────────────────

function ProgressRing({
  value,
  size = 80,
  strokeWidth = 5,
  color = '#8b5cf6',
  label,
  sublabel,
}: {
  value: number // 0-100
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
  sublabel?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(63, 63, 70, 0.3)"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
        {/* Glow effect */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + 4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          opacity={0.15}
          filter="blur(3px)"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold text-zinc-200 tabular-nums">
          <AnimatedCounter value={value} decimals={0} />
          <span className="text-xs text-zinc-500">%</span>
        </span>
        {label && (
          <span className="text-[9px] font-mono text-zinc-500 tracking-wider uppercase mt-0.5">
            {label}
          </span>
        )}
      </div>
      {sublabel && (
        <span className="absolute -bottom-4 text-[9px] font-mono text-zinc-600 tracking-wider">
          {sublabel}
        </span>
      )}
    </div>
  )
}

// ─── Sparkline ──────────────────────────────────────────────────────────────

function Sparkline({
  data,
  width = 200,
  height = 40,
  color = '#8b5cf6',
}: {
  data: Array<{ hour: number; count: number }>
  width?: number
  height?: number
  color?: string
}) {
  if (data.length === 0) return null

  const max = Math.max(...data.map((d) => d.count), 1)
  const padding = 2
  const chartW = width - padding * 2
  const chartH = height - padding * 2

  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * chartW
    const y = padding + chartH - (d.count / max) * chartH
    return { x, y }
  })

  const pathD = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ')

  const areaD =
    pathD +
    ` L ${points[points.length - 1].x} ${height - padding}` +
    ` L ${points[0].x} ${height - padding} Z`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <motion.path
        d={areaD}
        fill="url(#sparkGrad)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      />
      <motion.path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
      {/* Current value dot */}
      {points.length > 0 && (
        <motion.circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r={2.5}
          fill={color}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3, delay: 1 }}
        />
      )}
    </svg>
  )
}

// ─── State Distribution Bar ─────────────────────────────────────────────────

function StateDistributionBar({ jobsByState }: { jobsByState: Record<string, number> }) {
  const total = Object.values(jobsByState).reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const stateOrder = [
    'NEW',
    'SCAD_GENERATED',
    'RENDERED',
    'VALIDATED',
    'DELIVERED',
    'VALIDATION_FAILED',
    'GEOMETRY_FAILED',
    'RENDER_FAILED',
    'CANCELLED',
  ]

  const segments = stateOrder
    .filter((s) => (jobsByState[s] || 0) > 0)
    .map((state) => ({
      state,
      count: jobsByState[state] || 0,
      pct: ((jobsByState[state] || 0) / total) * 100,
      color: STATE_COLORS[state]?.dot || 'bg-zinc-500',
    }))

  return (
    <div className="space-y-2">
      <div className="h-2 rounded-full overflow-hidden flex bg-zinc-800/40">
        {segments.map((seg) => {
          const colorClass = seg.color.replace('bg-', '')
          const colorMap: Record<string, string> = {
            'slate-400': '#94a3b8',
            'amber-400': '#fbbf24',
            'cyan-400': '#22d3ee',
            'emerald-400': '#34d399',
            'lime-400': '#a3e635',
            'orange-400': '#fb923c',
            'rose-400': '#fb7185',
            'red-400': '#f87171',
            'yellow-400': '#facc15',
            'zinc-500': '#71717a',
          }
          const hex = colorMap[colorClass] || '#71717a'
          return (
            <motion.div
              key={seg.state}
              className="h-full"
              style={{ backgroundColor: hex }}
              initial={{ width: 0 }}
              animate={{ width: `${seg.pct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              title={`${seg.state}: ${seg.count} (${seg.pct.toFixed(1)}%)`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((seg) => {
          const colorClass = seg.color.replace('bg-', '')
          const colorMap: Record<string, string> = {
            'slate-400': '#94a3b8',
            'amber-400': '#fbbf24',
            'cyan-400': '#22d3ee',
            'emerald-400': '#34d399',
            'lime-400': '#a3e635',
            'orange-400': '#fb923c',
            'rose-400': '#fb7185',
            'red-400': '#f87171',
            'yellow-400': '#facc15',
            'zinc-500': '#71717a',
          }
          const hex = colorMap[colorClass] || '#71717a'
          return (
            <div key={seg.state} className="flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: hex }}
              />
              <span className="text-[9px] font-mono text-zinc-500 tracking-wider uppercase">
                {seg.state.replace(/_/g, ' ')}
              </span>
              <span className="text-[10px] text-zinc-400 tabular-nums">{seg.count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  children,
  glow,
}: {
  icon: React.ElementType
  label: string
  children: React.ReactNode
  glow?: string
}) {
  return (
    <motion.div
      variants={staggerChild}
      className="relative rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3 overflow-hidden"
    >
      {glow && (
        <div
          className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-10 blur-2xl"
          style={{ backgroundColor: glow }}
        />
      )}
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3 h-3 text-zinc-600" />
        <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase">
          {label}
        </span>
      </div>
      {children}
    </motion.div>
  )
}

// ─── Main Stats Dashboard ───────────────────────────────────────────────────

export function StatsDashboard({ jobs, onClose }: StatsDashboardProps) {
  const stats = useMemo<StatsData>(() => {
    const totalJobs = jobs.length

    // Jobs by state
    const jobsByState: Record<string, number> = {}
    for (const job of jobs) {
      jobsByState[job.state] = (jobsByState[job.state] || 0) + 1
    }

    // Average processing time (from createdAt to completedAt for delivered jobs)
    const completedJobs = jobs.filter(
      (j) => j.completedAt && j.state === 'DELIVERED'
    )
    let avgProcessingTimeMs = 0
    if (completedJobs.length > 0) {
      const totalTime = completedJobs.reduce((acc, j) => {
        return acc + (new Date(j.completedAt!).getTime() - new Date(j.createdAt).getTime())
      }, 0)
      avgProcessingTimeMs = totalTime / completedJobs.length
    }

    // Success rate (DELIVERED vs failed states)
    const failedStates = ['VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED']
    const terminalJobs = jobs.filter(
      (j) => j.state === 'DELIVERED' || failedStates.includes(j.state)
    )
    const successRate =
      terminalJobs.length > 0
        ? ((jobsByState['DELIVERED'] || 0) / terminalJobs.length) * 100
        : 0

    // Jobs created today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const jobsCreatedToday = jobs.filter(
      (j) => new Date(j.createdAt) >= today
    ).length

    // Most common part family
    const familyCounts: Record<string, number> = {}
    for (const job of jobs) {
      if (job.partFamily) {
        familyCounts[job.partFamily] = (familyCounts[job.partFamily] || 0) + 1
      }
    }
    const mostCommonPartFamily =
      Object.entries(familyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'

    // Recent activity (last 24h, bucketed by hour)
    const now = Date.now()
    const hourBuckets: Array<{ hour: number; count: number }> = []
    for (let i = 23; i >= 0; i--) {
      const hourStart = now - i * 3600000
      const hourEnd = hourStart + 3600000
      const h = new Date(hourStart).getHours()
      const count = jobs.filter((j) => {
        const t = new Date(j.createdAt).getTime()
        return t >= hourStart && t < hourEnd
      }).length
      hourBuckets.push({ hour: h, count })
    }

    return {
      totalJobs,
      jobsByState,
      avgProcessingTimeMs,
      successRate,
      jobsCreatedToday,
      mostCommonPartFamily,
      recentActivity: hourBuckets,
    }
  }, [jobs])

  const formatDuration = (ms: number) => {
    if (ms === 0) return 'N/A'
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const rs = s % 60
    if (m < 60) return `${m}m ${rs}s`
    const h = Math.floor(m / 60)
    const rm = m % 60
    return `${h}h ${rm}m`
  }

  return (
    <motion.div
      className="w-full max-w-2xl mx-auto"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={staggerTransition}
    >
      {/* Header */}
      <motion.div variants={staggerChild} className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-zinc-200 tracking-wide">
            System Analytics
          </h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            ESC
          </button>
        )}
      </motion.div>

      {/* Top row: Key metrics */}
      <motion.div variants={staggerContainer} className="grid grid-cols-4 gap-2 mb-3">
        <StatCard icon={Layers} label="Total Jobs" glow="#8b5cf6">
          <div className="text-2xl font-bold text-zinc-200">
            <AnimatedCounter value={stats.totalJobs} />
          </div>
          <div className="text-[10px] text-zinc-600 mt-0.5">
            <AnimatedCounter value={stats.jobsCreatedToday} /> today
          </div>
        </StatCard>

        <StatCard icon={Clock} label="Avg Time" glow="#22d3ee">
          <div className="text-lg font-semibold text-cyan-400 tabular-nums">
            {formatDuration(stats.avgProcessingTimeMs)}
          </div>
          <div className="text-[10px] text-zinc-600 mt-0.5">
            processing time
          </div>
        </StatCard>

        <StatCard icon={CheckCircle2} label="Success" glow="#34d399">
          <div className="flex justify-center py-1">
            <ProgressRing
              value={stats.successRate}
              size={56}
              strokeWidth={4}
              color="#34d399"
            />
          </div>
        </StatCard>

        <StatCard icon={Zap} label="Top Family" glow="#8b5cf6">
          <div className="text-sm font-semibold text-violet-400 truncate">
            {stats.mostCommonPartFamily.replace(/_/g, ' ')}
          </div>
          <div className="text-[10px] text-zinc-600 mt-0.5">most common</div>
        </StatCard>
      </motion.div>

      {/* State distribution */}
      <motion.div
        variants={staggerChild}
        className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3 mb-3"
      >
        <div className="flex items-center gap-1.5 mb-3">
          <TrendingUp className="w-3 h-3 text-zinc-600" />
          <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase">
            Jobs by State
          </span>
        </div>
        <StateDistributionBar jobsByState={stats.jobsByState} />
      </motion.div>

      {/* Sparkline: Recent activity */}
      <motion.div
        variants={staggerChild}
        className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-zinc-600" />
            <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase">
              Activity (24h)
            </span>
          </div>
          <span className="text-[10px] text-zinc-500 tabular-nums">
            {stats.recentActivity.reduce((a, b) => a + b.count, 0)} jobs
          </span>
        </div>
        <Sparkline data={stats.recentActivity} width={400} height={50} />
      </motion.div>
    </motion.div>
  )
}
