import { Job } from './types'

// ─── API Functions ────────────────────────────────────────────────────────────

export async function fetchJobs(state?: string): Promise<{ jobs: Job[]; pagination: { total: number } }> {
  const url = state ? `/api/jobs?state=${state}&limit=50` : '/api/jobs?limit=50'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch jobs')
  return res.json()
}

export async function createJob(inputRequest: string, customerId?: string, priority?: number): Promise<{ job: Job }> {
  const res = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputRequest, customerId, priority }),
  })
  if (!res.ok) throw new Error('Failed to create job')
  return res.json()
}

export async function deleteJob(id: string): Promise<void> {
  const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete job')
}

export async function processJob(id: string, onEvent: (data: Record<string, unknown>) => void): Promise<void> {
  const res = await fetch(`/api/jobs/${id}/process`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to start processing')
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          onEvent(data)
        } catch { /* skip malformed */ }
      }
    }
  }
}

export async function updateParameters(id: string, parameterValues: Record<string, unknown>): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}/parameters`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parameterValues }),
  })
  if (!res.ok) throw new Error('Failed to update parameters')
  const data = await res.json()
  return data.job
}

/**
 * Send a chat message and receive a streaming response via SSE.
 * Calls onToken for each token received, onDone when complete, and onError on failure.
 * Returns an abort function to cancel the stream.
 */
export function sendChatMessageStream(
  messages: Array<{ role: string; content: string }>,
  jobId: string | undefined,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  model?: string,
  images?: string[]
): () => void {
  const controller = new AbortController()

  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, jobId, model, images }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        onError('Chat request failed')
        return
      }
      const reader = res.body?.getReader()
      if (!reader) {
        onError('No response body')
        return
      }
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'token' && data.content) {
                onToken(data.content)
              } else if (data.type === 'done') {
                onDone()
              } else if (data.type === 'error') {
                onError(data.message || 'Stream error')
              }
            } catch { /* skip malformed */ }
          }
        }
      }
      // Ensure done is called if stream ends without explicit done event
      onDone()
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError(err instanceof Error ? err.message : 'Unknown error')
      }
    })

  return () => controller.abort()
}

/** Legacy non-streaming chat (kept for backwards compatibility) */
export async function sendChatMessage(messages: Array<{ role: string; content: string }>, jobId?: string, model?: string): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, jobId, model }),
  })
  if (!res.ok) throw new Error('Chat request failed')
  // Handle SSE response - collect all tokens
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'token' && data.content) {
            fullContent += data.content
          }
        } catch { /* skip */ }
      }
    }
  }
  return fullContent || 'No response'
}

export async function cancelJob(id: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}/cancel`, { method: 'PATCH' })
  if (!res.ok) throw new Error('Failed to cancel job')
  const data = await res.json()
  return data.job
}

export async function updateNotes(id: string, notes: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}/notes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  })
  if (!res.ok) throw new Error('Failed to update notes')
  const data = await res.json()
  return data.job
}

export async function updatePriority(id: string, priority: number): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}/priority`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priority }),
  })
  if (!res.ok) throw new Error('Failed to update priority')
  const data = await res.json()
  return data.job
}

export async function linkJob(id: string, parentId: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}/link`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId }),
  })
  if (!res.ok) throw new Error('Failed to link job')
  const data = await res.json()
  return data.job
}

export async function unlinkJob(id: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}/link`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId: null }),
  })
  if (!res.ok) throw new Error('Failed to unlink job')
  const data = await res.json()
  return data.job
}

export async function updateScadSource(id: string, scadSource: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}/scad`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scadSource }),
  })
  if (!res.ok) throw new Error('Failed to update SCAD source')
  const data = await res.json()
  return data.job
}

export async function batchOperation(action: 'delete' | 'cancel' | 'reprocess', jobIds: string[]): Promise<{ results: { success: string[]; failed: string[] } }> {
  const res = await fetch('/api/jobs/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, jobIds }),
  })
  if (!res.ok) throw new Error('Batch operation failed')
  return res.json()
}

export interface JobVersion {
  id: string
  jobId: string
  field: string
  oldValue: string | null
  newValue: string | null
  changedBy: string
  createdAt: string
}

export async function fetchJobVersions(id: string): Promise<{ versions: JobVersion[] }> {
  const res = await fetch(`/api/jobs/${id}/versions`)
  if (!res.ok) throw new Error('Failed to fetch versions')
  return res.json()
}

export async function batchUpdateParameters(jobIds: string[], parameterValues: Record<string, number>): Promise<{ results: { success: string[]; failed: string[] } }> {
  const res = await fetch('/api/jobs/batch-params', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobIds, parameterValues }),
  })
  if (!res.ok) throw new Error('Batch parameter update failed')
  return res.json()
}

// ─── Model Selection ──────────────────────────────────────────────────────────

export interface ModelInfo {
  id: string
  name: string
  description: string
  provider: string
  providerName: string
  multimodal: boolean
  reasoning: boolean
  category: "flagship" | "fast" | "reasoning" | "vision" | "code"
}

export async function fetchModels(): Promise<{ models: ModelInfo[] }> {
  const res = await fetch('/api/models')
  if (!res.ok) throw new Error('Failed to fetch models')
  return res.json()
}
