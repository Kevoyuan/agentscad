'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, MessageSquare, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChatMessage, Job } from './types'
import { sendChatMessage } from './api'

export function ChatPanel({ job }: { job: Job }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const chatHistory = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const response = await sendChatMessage(chatHistory, job.id)
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date() }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', timestamp: new Date() }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-violet-400" />AI Assistant
        </h3>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" className="h-4 text-[8px] text-zinc-600 hover:text-zinc-400" onClick={() => setMessages([])}>
            Clear
          </Button>
        )}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272a #0c0a14' }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-violet-500/50" />
            </div>
            <div className="text-center">
              <p className="text-xs">Ask about this CAD job</p>
              <p className="text-[10px] text-zinc-700 mt-1">Get help with parameters, design, or manufacturing</p>
            </div>
            <div className="flex flex-wrap gap-1 justify-center mt-1">
              {['Optimize wall thickness', 'Explain this design', 'Suggest improvements'].map(q => (
                <button
                  key={q}
                  className="text-[9px] font-mono text-zinc-600 bg-zinc-800/40 px-2 py-1 rounded-md hover:text-zinc-400 hover:bg-zinc-800/60 transition-colors"
                  onClick={() => setInput(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-violet-600/20 text-violet-200 border border-violet-500/20'
                : 'bg-zinc-800/50 text-zinc-300 border border-zinc-700/30'
            }`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-1 mb-1">
                  <Sparkles className="w-2.5 h-2.5 text-violet-400" />
                  <span className="text-[8px] font-mono text-violet-400">AgentSCAD</span>
                </div>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                <span className="text-[10px] text-zinc-500">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="p-2 border-t border-zinc-800/60">
        <div className="flex items-center gap-1.5">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Ask about this design..."
            className="h-7 text-[11px] bg-[#0c0a14] border-zinc-800/60 placeholder:text-zinc-700 focus:border-violet-500/40"
          />
          <Button size="sm" className="h-7 w-7 p-0 bg-violet-600 hover:bg-violet-500 shrink-0" onClick={handleSend} disabled={!input.trim() || isLoading}>
            <Send className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}
