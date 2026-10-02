// Client for antd: REST calls and the live event stream.
import type { AntEvent, ApprovalDecision, Bootstrap, CreateAntInput } from '@ant/shared'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, err.error ?? `${res.status} ${res.statusText}`)
  }
  return (res.status === 204 || res.status === 202 ? undefined : await res.json()) as T
}

export const api = {
  bootstrap: () => req<Bootstrap>('GET', '/api/bootstrap'),
  createAnt: (input: CreateAntInput) => req<Bootstrap['ants'][number]>('POST', '/api/ants', input),
  updateAnt: (id: string, patch: Record<string, unknown>) => req('PATCH', `/api/ants/${id}`, patch),
  deleteAnt: (id: string) => req('DELETE', `/api/ants/${id}`),
  createColony: (name: string, memberIds: string[]) => req('POST', '/api/colonies', { name, memberIds }),
  send: (threadId: string, text: string) => req('POST', `/api/threads/${threadId}/messages`, { text }),
  stop: (threadId: string) => req('POST', `/api/threads/${threadId}/stop`),
  read: (threadId: string) => req('POST', `/api/threads/${threadId}/read`),
  pin: (threadId: string, pinned: boolean) => req('PATCH', `/api/threads/${threadId}`, { pinned }),
  decide: (approvalId: string, decision: ApprovalDecision) => req('POST', `/api/approvals/${approvalId}`, { decision }),
  draft: (messageId: string, action: 'send' | 'discard', body?: string) => req('POST', `/api/messages/${messageId}/draft`, { action, body }),
}

/** Reconnecting event stream. Calls `onOpen` after every (re)connect so callers can resync. */
export function connectEvents(onEvent: (e: AntEvent) => void, onOpen: () => void, onDown: () => void): () => void {
  let ws: WebSocket | null = null
  let closed = false
  let delay = 500
  const open = () => {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
    ws = new WebSocket(url)
    ws.onopen = () => {
      delay = 500
      onOpen()
    }
    ws.onmessage = (m) => {
      try {
        onEvent(JSON.parse(m.data))
      } catch {
        // ignore malformed frames
      }
    }
    ws.onclose = () => {
      if (closed) return
      onDown()
      setTimeout(open, delay)
      delay = Math.min(delay * 2, 8000)
    }
  }
  open()
  return () => {
    closed = true
    ws?.close()
  }
}
