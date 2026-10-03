// Client for antd: REST calls and the live event stream.
import type { ChannelStatus, ConnectorsView } from '@ant/shared'
import type { AntEvent, ApprovalDecision, Bootstrap, Colony, ComputerState, CreateAntInput, CreateRoutineInput, Message, RoutineRunView, RoutineView, RuleView, SearchHit, Settings, SkillView } from '@ant/shared'

export type RoutinePatch = Partial<Pick<RoutineView, 'name' | 'instruction' | 'when' | 'tz' | 'enabled'>>
export type ColonyPatch = { name?: string; memberIds?: string[]; leadAntId?: string }

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
    const err = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
    // This device isn't (or is no longer) paired: the store switches to the pairing screen.
    if (res.status === 401 && err.code === 'auth') window.dispatchEvent(new Event('ant:unpaired'))
    throw new ApiError(res.status, err.error ?? `${res.status} ${res.statusText}`)
  }
  return (res.status === 204 || res.status === 202 ? undefined : await res.json()) as T
}

export interface DeviceView {
  id: string
  name: string
  userAgent: string
  createdAt: number
  lastSeenAt: number
  current: boolean
}

export interface RemoteView {
  hosts: string[]
  urls: string[]
  devices: number
  tailscale: { installed: boolean; running: boolean; dnsName?: string; serving: boolean; url?: string }
}

export const api = {
  authStatus: () => req<{ trusted: boolean; authenticated: boolean; device: { id: string; name: string } | null }>('GET', '/api/auth/status'),
  pair: (code: string, name: string) => req<{ device: { id: string; name: string } }>('POST', '/api/auth/pair', { code, name }),
  logout: () => req<void>('POST', '/api/auth/logout'),
  pairingCode: () => req<{ code: string; expiresAt: number; urls: string[] }>('POST', '/api/auth/pairing-code'),
  devices: () => req<DeviceView[]>('GET', '/api/auth/devices'),
  removeDevice: (id: string) => req<void>('DELETE', `/api/auth/devices/${id}`),
  remote: () => req<RemoteView>('GET', '/api/remote'),
  setTailscale: (enabled: boolean) => req<RemoteView>('POST', '/api/remote/tailscale', { enabled }),
  bootstrap: () => req<Bootstrap>('GET', '/api/bootstrap'),
  createAnt: (input: CreateAntInput) => req<Bootstrap['ants'][number]>('POST', '/api/ants', input),
  updateAnt: (id: string, patch: Record<string, unknown>) => req('PATCH', `/api/ants/${id}`, patch),
  deleteAnt: (id: string) => req('DELETE', `/api/ants/${id}`),
  createColony: (name: string, memberIds: string[]) => req<Colony>('POST', '/api/colonies', { name, memberIds }),
  updateColony: (id: string, patch: ColonyPatch) => req<Colony>('PATCH', `/api/colonies/${id}`, patch),
  deleteColony: (id: string) => req<void>('DELETE', `/api/colonies/${id}`),
  send: (threadId: string, text: string) => req('POST', `/api/threads/${threadId}/messages`, { text }),
  stop: (threadId: string) => req('POST', `/api/threads/${threadId}/stop`),
  read: (threadId: string) => req('POST', `/api/threads/${threadId}/read`),
  pin: (threadId: string, pinned: boolean) => req('PATCH', `/api/threads/${threadId}`, { pinned }),
  decide: (approvalId: string, decision: ApprovalDecision) => req('POST', `/api/approvals/${approvalId}`, { decision }),
  draft: (messageId: string, action: 'send' | 'discard', body?: string) => req('POST', `/api/messages/${messageId}/draft`, { action, body }),
  older: (threadId: string, before: string) => req<Message[]>('GET', `/api/threads/${threadId}/messages?before=${encodeURIComponent(before)}`),
  rules: (antId: string) => req<RuleView[]>('GET', `/api/ants/${antId}/rules`),
  deleteRule: (id: string) => req('DELETE', `/api/rules/${id}`),
  connectors: () => req<ConnectorsView>('GET', '/api/connectors'),
  setClaudeAi: (key: string, disabledFor: string[]) => req<ConnectorsView>('PATCH', '/api/connectors/claudeai', { key, disabledFor }),
  addConnector: (input: Record<string, unknown>) => req<ConnectorsView>('POST', '/api/connectors', input),
  scopeConnector: (id: string, allAnts: boolean, antIds: string[]) => req<ConnectorsView>('PATCH', `/api/connectors/${id}`, { allAnts, antIds }),
  deleteConnector: (id: string) => req<ConnectorsView>('DELETE', `/api/connectors/${id}`),
  addSecret: (input: { name: string; description: string; value: string; allAnts?: boolean; antIds?: string[] }) => req<ConnectorsView>('POST', '/api/secrets', input),
  updateSecret: (id: string, patch: { description?: string; value?: string; allAnts?: boolean; antIds?: string[] }) => req<ConnectorsView>('PATCH', `/api/secrets/${id}`, patch),
  deleteSecret: (id: string) => req<ConnectorsView>('DELETE', `/api/secrets/${id}`),
  channels: () => req<ChannelStatus[]>('GET', '/api/channels'),
  setChannel: (kind: string, cfg: { enabled: boolean; tokenSecret: string; allowUsers: string[] }) => req<ChannelStatus[]>('PUT', `/api/channels/${kind}`, cfg),
  deleteChannel: (kind: string) => req<ChannelStatus[]>('DELETE', `/api/channels/${kind}`),
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
    ws.onclose = (e) => {
      if (closed) return
      // 4001: this device was removed. Don't reconnect; show the pairing screen.
      if (e.code === 4001) return void window.dispatchEvent(new Event('ant:unpaired'))
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
