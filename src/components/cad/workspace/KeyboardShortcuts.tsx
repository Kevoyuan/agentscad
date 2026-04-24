'use client'

import { useEffect } from 'react'
import { updatePriority } from '@/components/cad/api'
import { Job } from '@/components/cad/types'
import { NotificationType } from '@/components/cad/notification-center'

export function KeyboardShortcuts({
  selectedJob,
  showComposer,
  onShowComposer,
  onShowCommandPalette,
  onShowShortcuts,
  onShowStats,
  onShowCompare,
  onShowSettings,
  onCloseAll,
  onSetActiveTab,
  onDelete,
  onProcess,
  onAddNotification,
  onLoadJobs,
}: {
  selectedJob: Job | null
  showComposer: boolean
  onShowComposer: (show: boolean) => void
  onShowCommandPalette: (show: boolean) => void
  onShowShortcuts: (show: boolean) => void
  onShowStats: (show: boolean) => void
  onShowCompare: (show: boolean) => void
  onShowSettings: (show: boolean) => void
  onCloseAll: () => void
  onSetActiveTab: (tab: string) => void
  onDelete: (id: string) => void
  onProcess: (job: Job) => void
  onAddNotification: (type: NotificationType, title: string, description: string) => void
  onLoadJobs: () => void
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      // Ctrl+Shift+N: New job with focus on textarea
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        onShowComposer(true)
        setTimeout(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>('[data-composer-textarea]')
          if (textarea) textarea.focus()
        }, 100)
        return
      }

      // Cmd+K / Ctrl+K: Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onShowCommandPalette(true)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        onShowComposer(true)
        return
      }
      if (e.key === 'Escape') {
        onCloseAll()
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !isInputFocused) {
        onShowShortcuts(true)
      }
      if (e.key === 'Delete' && selectedJob && !showComposer && !isInputFocused) {
        onDelete(selectedJob.id)
      }
      // Space: Process selected job
      if (e.key === ' ' && selectedJob && !showComposer && !isInputFocused) {
        e.preventDefault()
        if (selectedJob.state === 'NEW') onProcess(selectedJob)
      }
      // E: Edit SCAD code
      if (e.key === 'e' && !e.metaKey && !e.ctrlKey && !isInputFocused && !showComposer) {
        onSetActiveTab('SCAD')
      }
      // D: Show dependencies
      if (e.key === 'd' && !e.metaKey && !e.ctrlKey && !isInputFocused && !showComposer) {
        onSetActiveTab('DEPS')
      }
      // H: Show history (LOG tab)
      if (e.key === 'h' && !e.metaKey && !e.ctrlKey && !isInputFocused && !showComposer) {
        onSetActiveTab('LOG')
      }
      // T: Open theme settings
      if (e.key === 't' && !e.metaKey && !e.ctrlKey && !isInputFocused && !showComposer) {
        onShowSettings(true)
      }
      // 1-7: Switch inspector tabs
      const tabMap: Record<string, string> = { '1': 'PARAMS', '2': 'RESEARCH', '3': 'VALIDATE', '4': 'SCAD', '5': 'LOG', '6': 'NOTES', '7': 'DEPS', '8': 'HISTORY', '9': 'AI' }
      if (tabMap[e.key] && !e.metaKey && !e.ctrlKey && !isInputFocused && !showComposer) {
        onSetActiveTab(tabMap[e.key])
      }
      // Shift+Up/Down: Move job priority
      if (e.shiftKey && e.key === 'ArrowUp' && selectedJob && !isInputFocused) {
        e.preventDefault()
        const newPriority = Math.min(10, selectedJob.priority + 1)
        updatePriority(selectedJob.id, newPriority).then(() => {
          onAddNotification('parameter_updated', 'Priority increased', `Job ${selectedJob.id.slice(0, 8)} → P${newPriority}`)
          onLoadJobs()
        })
      }
      if (e.shiftKey && e.key === 'ArrowDown' && selectedJob && !isInputFocused) {
        e.preventDefault()
        const newPriority = Math.max(1, selectedJob.priority - 1)
        updatePriority(selectedJob.id, newPriority).then(() => {
          onAddNotification('parameter_updated', 'Priority decreased', `Job ${selectedJob.id.slice(0, 8)} → P${newPriority}`)
          onLoadJobs()
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedJob, showComposer, onShowComposer, onShowCommandPalette, onShowShortcuts, onShowStats, onShowCompare, onShowSettings, onCloseAll, onSetActiveTab, onDelete, onProcess, onAddNotification, onLoadJobs])

  // This component renders nothing
  return null
}
