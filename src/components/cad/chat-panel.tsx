'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Sparkles, MessageSquare, Send, Square, Clock, Copy, Check, ChevronDown, ImagePlus, X, Eye, Brain, Zap, Code2, Star } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChatMessage, Job } from './types'
import { sendChatMessageStream, fetchModels, ModelInfo } from './api'

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
      className="code-copy-btn text-[9px] font-mono text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] bg-[var(--app-surface-raised)] px-1.5 py-0.5 rounded flex items-center gap-1"
    >
      {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// Category badge colors
const CATEGORY_STYLES: Record<string, { icon: React.ReactNode; color: string }> = {
  flagship: { icon: <Star className="w-2.5 h-2.5" />, color: 'text-amber-400' },
  fast: { icon: <Zap className="w-2.5 h-2.5" />, color: 'text-cyan-400' },
  reasoning: { icon: <Brain className="w-2.5 h-2.5" />, color: 'text-violet-400' },
  vision: { icon: <Eye className="w-2.5 h-2.5" />, color: 'text-emerald-400' },
  code: { icon: <Code2 className="w-2.5 h-2.5" />, color: 'text-orange-400' },
}

// Provider display colors
const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d97706',
  google: '#4285f4',
  deepseek: '#5b6ef7',
  zhipu: '#3b82f6',
  qwen: '#8b5cf6',
  mistral: '#f97316',
}

export function ChatPanel({ job }: { job: Job }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [selectedModel, setSelectedModel] = useState('gpt-4o')
  const [models, setModels] = useState<ModelInfo[]>([])
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [providerFilter, setProviderFilter] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const modelPickerRef = useRef<HTMLDivElement>(null)

  // Load available models
  useEffect(() => {
    fetchModels().then(data => setModels(data.models)).catch(() => {
      setModels([
        { id: 'gpt-4o', name: 'GPT-4o', description: 'OpenAI旗舰多模态模型', provider: 'openai', providerName: 'OpenAI', multimodal: true, reasoning: false, category: 'flagship' },
        { id: 'glm-4', name: 'GLM-4', description: '智谱GLM-4高性能文本模型', provider: 'zhipu', providerName: '智谱AI', multimodal: false, reasoning: false, category: 'flagship' },
        { id: 'glm-4v', name: 'GLM-4V', description: '智谱GLM-4V多模态模型', provider: 'zhipu', providerName: '智谱AI', multimodal: true, reasoning: false, category: 'vision' },
      ])
    })
  }, [])

  // Close model picker on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false)
      }
    }
    if (showModelPicker) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showModelPicker])

  // Handle image upload
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result as string
        setPendingImages(prev => [...prev, base64])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }, [])

  const removeImage = useCallback((index: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index))
  }, [])

  const currentModel = models.find(m => m.id === selectedModel)
  const isMultimodal = currentModel?.multimodal || false

  const suggestions = useMemo(() => getSmartSuggestions(job.partFamily), [job.partFamily])

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, { provider: string; providerName: string; models: ModelInfo[] }> = {}
    for (const model of models) {
      if (providerFilter && model.provider !== providerFilter) continue
      if (!groups[model.provider]) {
        groups[model.provider] = { provider: model.provider, providerName: model.providerName, models: [] }
      }
      groups[model.provider].models.push(model)
    }
    return Object.values(groups)
  }, [models, providerFilter])

  // Unique providers for filter
  const providers = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of models) {
      if (!seen.has(m.provider)) seen.set(m.provider, m.providerName)
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
  }, [models])

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
        setPendingImages([])
        abortRef.current = null
      },
      selectedModel !== 'gpt-4o' ? selectedModel : undefined,
      pendingImages.length > 0 ? pendingImages : undefined,
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
        <code className="bg-[var(--app-surface-raised)] px-1 py-0.5 rounded text-[10px] text-[var(--app-accent-text)]" {...props}>
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

  const proseClasses = "prose prose-invert prose-xs max-w-none [&_pre]:rounded-md [&_pre]:bg-[var(--app-bg)] [&_pre]:border [&_pre]:border-[color:var(--app-border)] [&_pre]:p-2 [&_pre]:text-[10px] [&_pre]:leading-relaxed [&_code]:text-[var(--app-accent-text)] [&_code]:before:content-none [&_code]:after:content-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-[11px] [&_strong]:text-[var(--app-text-primary)] [&_a]:text-[var(--app-accent-text)]"

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[color:var(--app-border)]">
        <h3 className="text-[10px] font-mono tracking-widest text-[var(--app-text-muted)] uppercase flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-[var(--app-accent-text)]" />AI Assistant
        </h3>
        <div className="flex items-center gap-1">
          {/* Model Picker */}
          <div className="relative" ref={modelPickerRef}>
            <button
              className="flex items-center gap-1 text-[9px] font-mono text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] px-1.5 py-0.5 rounded transition-colors linear-surface-hover"
              onClick={() => setShowModelPicker(!showModelPicker)}
            >
              {currentModel?.name || 'GPT-4o'}
              {isMultimodal && <Eye className="w-2.5 h-2.5 text-[var(--app-accent-text)]" />}
              {currentModel?.reasoning && <Brain className="w-2.5 h-2.5 text-[var(--app-accent-text)]" />}
              <ChevronDown className="w-2.5 h-2.5" />
            </button>
            {showModelPicker && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-[#1a1a1a] border border-white/[0.08] rounded-lg shadow-xl z-50 py-1 max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272a #1a1a1a' }}>
                {/* Provider filter tabs */}
                <div className="flex gap-0.5 px-2 py-1.5 border-b border-white/[0.06] overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                  <button
                    className={`text-[8px] font-mono px-1.5 py-0.5 rounded shrink-0 transition-colors ${!providerFilter ? 'bg-[var(--app-accent-bg)] text-[var(--app-accent-text)]' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]'}`}
                    onClick={() => setProviderFilter(null)}
                  >
                    All
                  </button>
                  {providers.map(p => (
                    <button
                      key={p.id}
                      className={`text-[8px] font-mono px-1.5 py-0.5 rounded shrink-0 transition-colors ${providerFilter === p.id ? 'bg-[var(--app-accent-bg)] text-[var(--app-accent-text)]' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]'}`}
                      onClick={() => setProviderFilter(p.id === providerFilter ? null : p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                {/* Model groups by provider */}
                {groupedModels.map(group => (
                  <div key={group.provider}>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 text-[8px] font-mono text-[var(--app-text-dim)] uppercase tracking-wider">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PROVIDER_COLORS[group.provider] || '#71717a' }} />
                      {group.providerName}
                    </div>
                    {group.models.map(model => {
                      const catStyle = CATEGORY_STYLES[model.category] || CATEGORY_STYLES.flagship
                      return (
                        <button
                          key={model.id}
                          className={`w-full text-left px-3 py-1.5 text-[10px] flex items-center gap-2 transition-colors ${
                            selectedModel === model.id ? 'bg-[var(--app-accent-bg)] text-[var(--app-accent-text)]' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text-primary)] hover:bg-white/[0.04]'
                          }`}
                          onClick={() => { setSelectedModel(model.id); setShowModelPicker(false) }}
                        >
                          <span className={`flex items-center gap-0.5 ${catStyle.color}`}>
                            {catStyle.icon}
                          </span>
                          <span className="font-mono font-medium">{model.name}</span>
                          {model.multimodal && <Eye className="w-2 h-2 text-emerald-400" />}
                          {model.reasoning && <Brain className="w-2 h-2 text-[var(--app-accent-text)]" />}
                          <span className="text-[8px] text-[var(--app-text-dim)] ml-auto truncate max-w-[80px]">{model.description.slice(0, 20)}...</span>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" className="h-4 text-[8px] text-[var(--app-text-dim)] hover:text-[var(--app-text-muted)]" onClick={() => { setMessages([]); setStreamingContent('') }}>
              Clear
            </Button>
          )}
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272a #09090b' }}>
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-[var(--app-text-dim)] gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--app-accent-bg)] flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-[var(--app-accent)]" />
            </div>
            <div className="text-center">
              <p className="text-xs">Ask about this CAD job</p>
              <p className="text-[10px] text-[var(--app-text-dim)] mt-1">Using {currentModel?.name || 'GPT-4o'} by {currentModel?.providerName || 'OpenAI'}</p>
            </div>
            <div className="flex flex-wrap gap-1 justify-center mt-1 max-w-[280px]">
              {suggestions.map(q => (
                <button
                  key={q}
                  className="text-[9px] font-mono text-[var(--app-text-dim)] bg-[var(--app-surface-hover)] px-2 py-1 rounded-md hover:text-[var(--app-text-muted)] hover:bg-[var(--app-surface-raised)] transition-colors"
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
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[var(--app-accent-bg)] text-[var(--app-accent-text)] border border-[color:var(--app-accent-border)]'
                : 'bg-[var(--app-surface-raised)] text-[var(--app-text-secondary)] border border-[color:var(--app-border)]'
            }`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-1 mb-1">
                  <Sparkles className="w-2.5 h-2.5 text-[var(--app-accent-text)]" />
                  <span className="text-[8px] font-mono text-[var(--app-accent-text)]">AgentSCAD</span>
                  <span className="text-[8px] font-mono text-[var(--app-text-dim)] ml-auto flex items-center gap-0.5">
                    <Clock className="w-2 h-2" />{formatTimestamp(msg.timestamp)}
                  </span>
                </div>
              )}
              {msg.role === 'user' && (
                <div className="flex items-center justify-end gap-0.5 mb-1">
                  <span className="text-[8px] font-mono text-[var(--app-accent-text)] flex items-center gap-0.5">
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
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-3 py-2 text-[11px] leading-relaxed bg-[var(--app-surface-raised)] text-[var(--app-text-secondary)] border border-[color:var(--app-border)]">
              <div className="flex items-center gap-1 mb-1">
                <Sparkles className="w-2.5 h-2.5 text-[var(--app-accent-text)] animate-pulse" />
                <span className="text-[8px] font-mono text-[var(--app-accent-text)]">AgentSCAD</span>
                <span className="text-[8px] font-mono text-[var(--app-accent-text)] animate-pulse">generating...</span>
              </div>
              <div className={proseClasses}>
                <ReactMarkdown components={markdownComponents}>
                  {streamingContent}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}
        {/* Typing indicator (before first token) */}
        {isStreaming && !streamingContent && (
          <div className="flex justify-start">
            <div className="bg-[var(--app-surface-raised)] border border-[color:var(--app-border)] rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 animate-spin text-[var(--app-accent-text)]" />
                <span className="text-[10px] text-[var(--app-text-muted)]">Thinking...</span>
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
      <div className="p-2 border-t border-[color:var(--app-border)]">
        {/* Pending images preview */}
        {pendingImages.length > 0 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {pendingImages.map((img, i) => (
              <div key={i} className="relative group">
                <img src={img} alt={`Upload ${i + 1}`} className="w-10 h-10 rounded object-cover border border-white/[0.08]" />
                <button
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeImage(i)}
                >
                  <X className="w-2 h-2" />
                </button>
              </div>
            ))}
            <span className="text-[8px] font-mono text-[var(--app-text-dim)] self-center">{pendingImages.length} image{pendingImages.length > 1 ? 's' : ''}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {/* Image upload button (for multimodal models) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageUpload}
          />
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 shrink-0 ${isMultimodal ? 'text-[var(--app-accent-text)] hover:text-[var(--app-accent-text)]' : 'text-[var(--app-text-dim)] cursor-not-allowed'}`}
            onClick={() => isMultimodal && fileInputRef.current?.click()}
            disabled={!isMultimodal || isStreaming}
            title={isMultimodal ? 'Attach image' : 'Switch to a multimodal model for image support'}
          >
            <ImagePlus className="w-3.5 h-3.5" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={isMultimodal ? 'Describe with images...' : 'Ask about this design...'}
            className="h-7 text-[11px] bg-[var(--app-bg)] border-[color:var(--app-border)] placeholder:text-[var(--app-text-dim)]"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button size="sm" className="h-7 w-7 p-0 bg-rose-600 hover:bg-rose-500 shrink-0 stop-btn-pulse" onClick={handleStop}>
              <Square className="w-3 h-3" />
            </Button>
          ) : (
            <Button size="sm" className="h-7 w-7 p-0 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] shrink-0" onClick={handleSend} disabled={!input.trim()}>
              <Send className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
