// Client for antd: REST calls and the live event stream.
import type { AntEvent, ApprovalDecision, Bootstrap, ComputerState, CreateAntInput, CreateRoutineInput, Message, RoutineRunView, RoutineView, RuleView, SearchHit, Settings, SkillView } from '@ant/shared'

export type RoutinePatch = Partial<Pick<RoutineView, 'name' | 'instruction' | 'when' | 'tz' | 'enabled'>>

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
  older: (threadId: string, before: string) => req<Message[]>('GET', `/api/threads/${threadId}/messages?before=${encodeURIComponent(before)}`),
  rules: (antId: string) => req<RuleView[]>('GET', `/api/ants/${antId}/rules`),
  deleteRule: (id: string) => req('DELETE', `/api/rules/${id}`),
  skills: (antId: string) => req<SkillView[]>('GET', `/api/ants/${antId}/skills`),
  search: (q: string) => req<SearchHit[]>('GET', `/api/search?q=${encodeURIComponent(q)}`),
  settings: (patch: Partial<Settings>) => req<Settings>('PATCH', '/api/settings', patch),
  computer: (antId: string) => req<ComputerState>('GET', `/api/ants/${antId}/computer`),
  startComputer: (antId: string) => req<ComputerState>('POST', `/api/ants/${antId}/computer/start`),
  teach: (antId: string, action: 'start' | 'stop' | 'cancel', title?: string) => req<ComputerState>('POST', `/api/ants/${antId}/computer/teach`, { action, title }),
  lease: (antId: string, holder: 'ant' | 'user') => req<ComputerState>('POST', `/api/ants/${antId}/computer/lease`, { holder }),
  routines: (antId: string) => req<RoutineView[]>('GET', `/api/routines?antId=${encodeURIComponent(antId)}`),
  createRoutine: (input: CreateRoutineInput) => req<{ routine: RoutineView; key?: string }>('POST', '/api/routines', input),
  updateRoutine: (id: string, patch: RoutinePatch) => req<RoutineView>('PATCH', `/api/routines/${encodeURIComponent(id)}`, patch),
  deleteRoutine: (id: string) => req<void>('DELETE', `/api/routines/${encodeURIComponent(id)}`),
  testRoutine: (id: string) => req<void>('POST', `/api/routines/${encodeURIComponent(id)}/test`),
  routineRuns: (id: string) => req<RoutineRunView[]>('GET', `/api/routines/${encodeURIComponent(id)}/runs`),
  timezone: (timezone: string) => req<void>('PUT', '/api/settings/timezone', { timezone }),
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
