'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, CheckCircle2, XCircle, Ban, Settings, Code2,
  CheckCheck, Trash2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

// ─── Notification Types ────────────────────────────────────────────────────

export type NotificationType =
  | 'job_completed'
  | 'job_failed'
  | 'job_cancelled'
  | 'parameter_updated'
  | 'scad_updated'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  description: string
  timestamp: Date
  read: boolean
}

// ─── Notification Icon & Color Mapping ─────────────────────────────────────

const NOTIFICATION_CONFIG: Record<NotificationType, { icon: typeof CheckCircle2; color: string; bgColor: string }> = {
  job_completed: { icon: CheckCircle2, color: 'text-lime-400', bgColor: 'bg-lime-500/10' },
  job_failed: { icon: XCircle, color: 'text-rose-400', bgColor: 'bg-rose-500/10' },
  job_cancelled: { icon: Ban, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10' },
  parameter_updated: { icon: Settings, color: 'text-violet-400', bgColor: 'bg-violet-500/10' },
  scad_updated: { icon: Code2, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
}

// ─── Time ago helper ───────────────────────────────────────────────────────

function notifTimeAgo(date: Date): string {
  const now = Date.now()
  const then = date.getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 0) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ─── Notification Item ─────────────────────────────────────────────────────

function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: Notification
  onMarkRead: (id: string) => void
}) {
  const config = NOTIFICATION_CONFIG[notification.type]
  const Icon = config.icon

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`notification-item flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors hover:bg-white/[0.02] ${
        !notification.read ? 'border-l-2 border-l-violet-500/60' : 'border-l-2 border-l-transparent'
      }`}
      onClick={() => {
        if (!notification.read) onMarkRead(notification.id)
      }}
    >
      <div className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${config.bgColor}`}>
        <Icon className={`w-3 h-3 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[11px] leading-tight ${notification.read ? 'text-zinc-500' : 'text-zinc-300'}`}>
          {notification.title}
        </p>
        <p className="text-[9px] text-zinc-600 mt-0.5 truncate">{notification.description}</p>
        <p className="text-[8px] text-zinc-700 mt-1 font-mono">{notifTimeAgo(notification.timestamp)}</p>
      </div>
      {!notification.read && (
        <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5" />
      )}
    </motion.div>
  )
}

// ─── Notification Center ───────────────────────────────────────────────────

interface NotificationCenterProps {
  notifications: Notification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onClearAll: () => void
}

export function NotificationCenter({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.read).length

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300 relative"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="w-3 h-3" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-rose-500 text-white text-[7px] font-bold flex items-center justify-center px-0.5"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </Button>

      {/* Notification Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-8 w-80 bg-[#0c0a14]/95 backdrop-blur-xl border border-zinc-800/60 rounded-lg shadow-2xl shadow-black/40 z-50 depth-3"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[11px] font-medium text-zinc-300">Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/20">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[8px] gap-0.5 text-violet-400 hover:text-violet-300 px-1"
                    onClick={onMarkAllRead}
                  >
                    <CheckCheck className="w-2.5 h-2.5" />Mark all read
                  </Button>
                )}
                {notifications.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[8px] gap-0.5 text-zinc-500 hover:text-zinc-400 px-1"
                    onClick={onClearAll}
                  >
                    <Trash2 className="w-2.5 h-2.5" />Clear
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[8px] text-zinc-600 hover:text-zinc-400 px-0.5"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Notifications List */}
            <ScrollArea className="max-h-80">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800/20 flex items-center justify-center empty-float">
                    <Bell className="w-5 h-5 text-zinc-700" />
                  </div>
                  <p className="text-[11px] text-zinc-600">No notifications</p>
                  <p className="text-[9px] text-zinc-700">You&apos;re all caught up</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/40">
                  <AnimatePresence>
                    {notifications.map(n => (
                      <NotificationItem
                        key={n.id}
                        notification={n}
                        onMarkRead={onMarkRead}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
