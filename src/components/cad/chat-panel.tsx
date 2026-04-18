'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, MessageSquare, Send, Square, Clock, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChatMessage, Job } from './types'
import { sendChatMessageStream } from './api'

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

// Smart suggestions based on partFamily
function getSmartSuggestions(partFamily: string | null): string[] {
  const base = ['Optimize wall thickness', 'Suggest improvements']
  const familySuggestions: Record<string, string[]> = {
    spur_gear: ['Best number of teeth for torque?', 'Calculate module for my gear', 'What pressure angle to use?'],
    electronics_enclosure: ['How thick should walls be?', 'Add mounting holes pattern', 'Best tolerance for lid fit?'],
    bracket: ['Minimize material usage', 'Optimize fillet radius', 'Recommended fastener size?'],
    bolt: ['Standard thread pitch?', 'Hex head vs socket head?', 'Best material for M6 bolt?'],
    device_stand: ['Optimal viewing angle?', 'Cable management holes?', 'Anti-slip features?'],
    phone_case: ['Minimum wall for protection?', 'Add camera cutout', 'Wireless charging compatible?'],
  }
  const key = (partFamily || '').toLowerCase()
  const specific = familySuggestions[key] || ['Explain this design', 'What parameters can I adjust?']
  return [...specific, ...base].slice(0, 4)
}

// Copy button for code blocks
function CodeCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="code-copy-btn text-[9px] font-mono text-zinc-500 hover:text-zinc-300 bg-zinc-800/80 px-1.5 py-0.5 rounded flex items-center gap-1"
    >
      {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function ChatPanel({ job }: { job: Job }) {
  // Messages are scoped per job - using key-based reset via parent component
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<(() => void) | null>(null)

  const suggestions = useMemo(() => getSmartSuggestions(job.partFamily), [job.partFamily])

  // Smooth auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingContent])

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current()
      abortRef.current = null
    }
    // Save whatever was streamed so far as a message
    if (streamingContent) {
      setMessages(prev => [...prev, { role: 'assistant', content: streamingContent, timestamp: new Date() }])
    }
    setStreamingContent('')
    setIsStreaming(false)
  }

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)
    setStreamingContent('')

    const chatHistory = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
    let accumulated = ''

    const abort = sendChatMessageStream(
      chatHistory,
      job.id,
      (token) => {
        accumulated += token
        setStreamingContent(accumulated)
      },
      () => {
        if (accumulated) {
          setMessages(prev => [...prev, { role: 'assistant', content: accumulated, timestamp: new Date() }])
        }
        setStreamingContent('')
        setIsStreaming(false)
        abortRef.current = null
      },
      (err) => {
        const errMsg = err || 'Sorry, I encountered an error. Please try again.'
        setMessages(prev => [...prev, { role: 'assistant', content: errMsg, timestamp: new Date() }])
        setStreamingContent('')
        setIsStreaming(false)
        abortRef.current = null
      }
    )
    abortRef.current = abort
  }

  // Shared markdown components with copy button support
  const markdownComponents = useMemo(() => ({
    code({ className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '')
      const isInline = !match
      const codeStr = String(children).replace(/\n$/, '')
      return isInline ? (
        <code className="bg-zinc-800/60 px-1 py-0.5 rounded text-[10px] text-violet-300" {...props}>
          {children}
        </code>
      ) : (
        <div className="relative">
          <CodeCopyButton text={codeStr} />
          <SyntaxHighlighter
            style={oneDark}
            language={match[1]}
            PreTag="div"
            customStyle={{
              fontSize: '10px',
              borderRadius: '6px',
              margin: '4px 0',
              padding: '8px',
            }}
          >
            {codeStr}
          </SyntaxHighlighter>
        </div>
      )
    },
  }), [])

  const proseClasses = "prose prose-invert prose-xs max-w-none [&_pre]:rounded-md [&_pre]:bg-zinc-900 [&_pre]:border [&_pre]:border-zinc-700/40 [&_pre]:p-2 [&_pre]:text-[10px] [&_pre]:leading-relaxed [&_code]:text-violet-300 [&_code]:before:content-none [&_code]:after:content-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-[11px] [&_strong]:text-zinc-100 [&_a]:text-violet-400"

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-violet-400" />AI Assistant
        </h3>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" className="h-4 text-[8px] text-zinc-600 hover:text-zinc-400" onClick={() => { setMessages([]); setStreamingContent('') }}>
              Clear
            </Button>
          )}
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272a #0c0a14' }}>
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-violet-500/50" />
            </div>
            <div className="text-center">
              <p className="text-xs">Ask about this CAD job</p>
              <p className="text-[10px] text-zinc-700 mt-1">Get help with parameters, design, or manufacturing</p>
            </div>
            <div className="flex flex-wrap gap-1 justify-center mt-1 max-w-[280px]">
              {suggestions.map(q => (
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
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} ${msg.role === 'user' ? 'chat-msg-user' : 'chat-msg-ai'}`}
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
                  <span className="text-[8px] font-mono text-zinc-600 ml-auto flex items-center gap-0.5">
                    <Clock className="w-2 h-2" />{formatTimestamp(msg.timestamp)}
                  </span>
                </div>
              )}
              {msg.role === 'user' && (
                <div className="flex items-center justify-end gap-0.5 mb-1">
                  <span className="text-[8px] font-mono text-violet-400/60 flex items-center gap-0.5">
                    <Clock className="w-2 h-2" />{formatTimestamp(msg.timestamp)}
                  </span>
                </div>
              )}
              {msg.role === 'assistant' ? (
                <div className={proseClasses}>
                  <ReactMarkdown components={markdownComponents}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {/* Streaming message */}
        {isStreaming && streamingContent && (
          <div className="flex justify-start chat-msg-ai">
            <div className="max-w-[85%] rounded-lg px-3 py-2 text-[11px] leading-relaxed bg-zinc-800/50 text-zinc-300 border border-zinc-700/30">
              <div className="flex items-center gap-1 mb-1">
                <Sparkles className="w-2.5 h-2.5 text-violet-400 animate-pulse" />
                <span className="text-[8px] font-mono text-violet-400">AgentSCAD</span>
                <span className="text-[8px] font-mono text-violet-400/60 animate-pulse">generating...</span>
              </div>
              <div className={proseClasses}>
                <ReactMarkdown components={markdownComponents}>
                  {streamingContent}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}
        {/* Typing indicator (before first token) - Wave animation */}
        {isStreaming && !streamingContent && (
          <div className="flex justify-start chat-msg-ai">
            <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 animate-spin text-violet-400" />
                <span className="text-[10px] text-zinc-500">Thinking...</span>
                <div className="flex gap-1 ml-1">
                  <span className="typing-wave-dot" />
                  <span className="typing-wave-dot" />
                  <span className="typing-wave-dot" />
                </div>
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
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button size="sm" className="h-7 w-7 p-0 bg-rose-600 hover:bg-rose-500 shrink-0 stop-btn-pulse" onClick={handleStop}>
              <Square className="w-3 h-3" />
            </Button>
          ) : (
            <Button size="sm" className="h-7 w-7 p-0 bg-violet-600 hover:bg-violet-500 shrink-0 btn-press" onClick={handleSend} disabled={!input.trim()}>
              <Send className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
