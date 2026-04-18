'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Palette, Type, LayoutGrid, Sparkles, RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

// ─── Theme Config ────────────────────────────────────────────────────────

const ACCENT_COLORS = [
  { name: 'Violet', hue: 263, color: 'bg-violet-500', ring: 'ring-violet-400' },
  { name: 'Cyan', hue: 185, color: 'bg-cyan-500', ring: 'ring-cyan-400' },
  { name: 'Emerald', hue: 155, color: 'bg-emerald-500', ring: 'ring-emerald-400' },
  { name: 'Amber', hue: 38, color: 'bg-amber-500', ring: 'ring-amber-400' },
  { name: 'Rose', hue: 345, color: 'bg-rose-500', ring: 'ring-rose-400' },
  { name: 'Orange', hue: 25, color: 'bg-orange-500', ring: 'ring-orange-400' },
]

const FONT_SIZES = [
  { name: 'Small', value: '11px', label: 'S' },
  { name: 'Medium', value: '13px', label: 'M' },
  { name: 'Large', value: '15px', label: 'L' },
]

const UI_DENSITIES = [
  { name: 'Compact', value: 'compact', gap: '0.25rem', padding: '0.5rem' },
  { name: 'Normal', value: 'normal', gap: '0.5rem', padding: '0.75rem' },
  { name: 'Comfortable', value: 'comfortable', gap: '0.75rem', padding: '1rem' },
]

interface ThemeSettings {
  accentHue: number
  fontSize: string
  density: string
  animationsEnabled: boolean
}

const DEFAULT_SETTINGS: ThemeSettings = {
  accentHue: 263,
  fontSize: '13px',
  density: 'normal',
  animationsEnabled: true,
}

function loadSettings(): ThemeSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const saved = localStorage.getItem('agentscad-theme')
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS
}

function saveSettings(settings: ThemeSettings) {
  try {
    localStorage.setItem('agentscad-theme', JSON.stringify(settings))
  } catch { /* ignore */ }
}

// ─── Apply Theme to DOM ──────────────────────────────────────────────────

function applyThemeToDOM(settings: ThemeSettings) {
  const root = document.documentElement

  // Apply accent hue as CSS custom properties
  root.style.setProperty('--accent-hue', String(settings.accentHue))
  root.style.setProperty('--accent-color', `hsl(${settings.accentHue}, 70%, 60%)`)
  root.style.setProperty('--accent-color-dim', `hsl(${settings.accentHue}, 50%, 30%)`)
  root.style.setProperty('--accent-color-bright', `hsl(${settings.accentHue}, 80%, 70%)`)
  root.style.setProperty('--accent-color-bg', `hsl(${settings.accentHue}, 50%, 12%)`)
  root.style.setProperty('--accent-color-border', `hsl(${settings.accentHue}, 40%, 25%)`)

  // Apply font size
  root.style.setProperty('--base-font-size', settings.fontSize)

  // Apply density
  const densityConfig = UI_DENSITIES.find(d => d.value === settings.density) || UI_DENSITIES[1]
  root.style.setProperty('--ui-gap', densityConfig.gap)
  root.style.setProperty('--ui-padding', densityConfig.padding)

  // Apply animations
  if (!settings.animationsEnabled) {
    root.style.setProperty('--animation-duration', '0s')
    root.classList.add('reduce-motion')
  } else {
    root.style.setProperty('--animation-duration', '')
    root.classList.remove('reduce-motion')
  }
}

// ─── Theme Panel Component ───────────────────────────────────────────────

export function ThemePanel() {
  const [settings, setSettings] = useState<ThemeSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS
    return loadSettings()
  })
  const [isLoaded, setIsLoaded] = useState(() => {
    if (typeof window === 'undefined') return false
    return true
  })

  // Apply theme on mount
  useEffect(() => {
    applyThemeToDOM(settings)
  }, [settings])

  const updateSettings = useCallback((partial: Partial<ThemeSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial }
      saveSettings(next)
      applyThemeToDOM(next)
      return next
    })
  }, [])

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
    saveSettings(DEFAULT_SETTINGS)
    applyThemeToDOM(DEFAULT_SETTINGS)
  }, [])

  if (!isLoaded) return null

  return (
    <div className="space-y-5 p-1">
      {/* Accent Color */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Accent Color</span>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {ACCENT_COLORS.map(accent => (
            <button
              key={accent.name}
              className={`relative flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all duration-200 ${
                settings.accentHue === accent.hue
                  ? 'border-zinc-500/50 bg-zinc-800/40'
                  : 'border-zinc-800/30 hover:border-zinc-700/50 hover:bg-zinc-800/20'
              }`}
              onClick={() => updateSettings({ accentHue: accent.hue })}
            >
              <div className={`w-5 h-5 rounded-full ${accent.color} ${
                settings.accentHue === accent.hue ? 'ring-2 ring-offset-1 ring-offset-[#0c0a14] ' + accent.ring : ''
              }`} />
              <span className="text-[8px] font-mono text-zinc-600">{accent.name}</span>
              {settings.accentHue === accent.hue && (
                <motion.div
                  layoutId="accent-check"
                  className="absolute -top-0.5 -right-0.5"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                >
                  <Check className="w-2.5 h-2.5 text-zinc-300" />
                </motion.div>
              )}
            </button>
          ))}
        </div>
      </div>

      <Separator className="bg-zinc-800/40" />

      {/* Font Size */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Type className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Font Size</span>
        </div>
        <div className="flex items-center gap-2">
          {FONT_SIZES.map(fs => (
            <button
              key={fs.value}
              className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border transition-all duration-200 ${
                settings.fontSize === fs.value
                  ? 'border-zinc-500/50 bg-zinc-800/40'
                  : 'border-zinc-800/30 hover:border-zinc-700/50 hover:bg-zinc-800/20'
              }`}
              onClick={() => updateSettings({ fontSize: fs.value })}
            >
              <span className={`font-mono ${settings.fontSize === fs.value ? 'text-zinc-200' : 'text-zinc-500'}`}
                style={{ fontSize: fs.value }}>
                Aa
              </span>
              <span className="text-[8px] font-mono text-zinc-600">{fs.name}</span>
            </button>
          ))}
        </div>
      </div>

      <Separator className="bg-zinc-800/40" />

      {/* UI Density */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <LayoutGrid className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">UI Density</span>
        </div>
        <div className="flex items-center gap-2">
          {UI_DENSITIES.map(d => (
            <button
              key={d.value}
              className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border transition-all duration-200 ${
                settings.density === d.value
                  ? 'border-zinc-500/50 bg-zinc-800/40'
                  : 'border-zinc-800/30 hover:border-zinc-700/50 hover:bg-zinc-800/20'
              }`}
              onClick={() => updateSettings({ density: d.value })}
            >
              <div className={`flex flex-col ${settings.density === d.value ? 'text-zinc-300' : 'text-zinc-600'}`}
                style={{ gap: d.gap }}>
                <div className="w-4 h-1 rounded bg-current/30" />
                <div className="w-4 h-1 rounded bg-current/30" />
                <div className="w-4 h-1 rounded bg-current/30" />
              </div>
              <span className="text-[8px] font-mono text-zinc-600">{d.name}</span>
            </button>
          ))}
        </div>
      </div>

      <Separator className="bg-zinc-800/40" />

      {/* Animations Toggle */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Animations</span>
          </div>
          <button
            className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
              settings.animationsEnabled ? 'bg-emerald-600' : 'bg-zinc-700'
            }`}
            onClick={() => updateSettings({ animationsEnabled: !settings.animationsEnabled })}
          >
            <motion.div
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
              animate={{ left: settings.animationsEnabled ? '18px' : '2px' }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            />
          </button>
        </div>
        <p className="text-[9px] text-zinc-700 mt-1 ml-5">
          {settings.animationsEnabled ? 'Animations enabled' : 'Reduced motion (respects prefers-reduced-motion)'}
        </p>
      </div>

      <Separator className="bg-zinc-800/40" />

      {/* Reset to Defaults */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full h-7 text-[10px] gap-1.5 text-zinc-500 hover:text-zinc-300 border border-zinc-800/40"
        onClick={resetToDefaults}
      >
        <RotateCcw className="w-3 h-3" />Reset to Defaults
      </Button>
    </div>
  )
}
