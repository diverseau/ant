import type { AntEvent, ComputerState, Health, UsageWindows } from '@ant/shared'
import { api, connectEvents } from './api'
import { ants as seedAnts, colonies as seedColonies, threads as seedThreads, uid } from './mock/data'
import { respond, stop as stopEngine } from './mock/engine'
import type { Accessory, Ant, AntColor, ApprovalMessage, DraftMessage, Message, Thread } from './types'

export type Panel = 'computer' | 'details' | null
export type Overlay = 'palette' | 'new-ant' | 'connectors' | 'usage' | null
/** `live` talks to antd; `demo` runs the scripted mock when antd isn't reachable. */
export type Mode = 'connecting' | 'live' | 'demo'

export interface Notice {
  id: string
  level: 'info' | 'warn' | 'error'
  text: string
}

export const app = $state({
  mode: 'connecting' as Mode,
  online: true,
  user: { name: 'Leon', plan: 'Pro' },
  ants: [] as Ant[],
  colonies: [] as typeof seedColonies,
  threads: [] as Thread[],
  selectedId: '' as string,
  panel: null as Panel,
  overlay: null as Overlay,
  sidebarCollapsed: false,
  /** threadId -> ant id currently "typing" */
  typing: {} as Record<string, string | undefined>,
  /** threadId -> composer draft */
  drafts: {} as Record<string, string>,
  takeover: false,
  usage: null as UsageWindows | null,
  health: null as Health | null,
  notices: [] as Notice[],
  computers: {} as Record<string, ComputerState>,
  /** File open in the viewer. */
  viewer: null as { antId: string; path: string; name: string } | null,
})

const live = () => app.mode === 'live'

/* ---------- lookups ---------- */

export const antById = (id: string): Ant | undefined => app.ants.find((a) => a.id === id)
export const threadById = (id: string): Thread | undefined => app.threads.find((t) => t.id === id)
export const colonyById = (id: string) => app.colonies.find((c) => c.id === id)
export const threadForAnt = (antId: string): Thread | undefined => app.threads.find((t) => t.kind === 'ant' && t.refId === antId)

export function threadTitle(t: Thread): string {
  if (t.kind === 'ant') return antById(t.refId)?.name ?? 'Ant'
  return colonyById(t.refId)?.name ?? 'Colony'
}

export function threadMembers(t: Thread): Ant[] {
  if (t.kind === 'ant') {
    const a = antById(t.refId)
    return a ? [a] : []
  }
  return (colonyById(t.refId)?.memberIds ?? []).map(antById).filter((a): a is Ant => !!a)
}

export function sortedThreads(): Thread[] {
  return [...app.threads].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
}

export function preview(t: Thread): string {
  const typingAnt = app.typing[t.id]
  if (typingAnt) {
    const a = antById(typingAnt)
    return a?.activity ? `${a.name}: ${a.activity}` : `${a?.name ?? 'Ant'} is working…`
  }
  for (let i = t.messages.length - 1; i >= 0; i--) {
    const m = t.messages[i]
    const who = t.kind === 'colony' && m.author !== 'user' && m.author !== 'system' ? `${antById(m.author)?.name}: ` : ''
    const you = m.author === 'user' ? 'You: ' : ''
    switch (m.kind) {
      case 'text':
        if (!m.text) continue
        return you + who + m.text.replace(/[*`#\n-]+/g, ' ').replace(/\s+/g, ' ').trim()
      case 'checklist':
        return who + '✓ ' + m.items.map((i) => `${i.service} → ${i.result}`).join(' · ')
      case 'computer':
        return who + m.text
      case 'approval':
        return m.decision ? who + m.action : 'Needs your approval: ' + m.action
      case 'draft':
        return who + `Draft: ${m.subject ?? m.body.slice(0, 40)}`
      case 'routine':
        return `Ran ${m.name}`
      case 'tool':
        return who + m.title
      case 'file':
        return who + `Shared ${m.name}`
      case 'error':
        return who + m.text
      case 'system':
        continue
    }
  }
  return 'Say hi 👋'
}

export function needsAttention(t: Thread): boolean {
  return t.messages.some((m) => m.kind === 'approval' && !m.decision)
}

/* ---------- notices ---------- */

export function notify(text: string, level: Notice['level'] = 'info') {
  const n = { id: uid('n'), level, text }
  app.notices.push(n)
  setTimeout(() => dismiss(n.id), level === 'info' ? 4000 : 8000)
}

export function dismiss(id: string) {
  const i = app.notices.findIndex((n) => n.id === id)
  if (i >= 0) app.notices.splice(i, 1)
}

const fail = (err: unknown) => notify(err instanceof Error ? err.message : String(err), 'error')

/* ---------- startup ---------- */

let readTimer: ReturnType<typeof setTimeout> | null = null

async function resync() {
  const b = await api.bootstrap()
  app.user = b.user
  app.ants = b.ants
  app.colonies = b.colonies
  app.threads = b.threads
  app.usage = b.usage
  app.health = b.health
  app.typing = {}
  if (!threadById(app.selectedId)) app.selectedId = sortedThreads()[0]?.id ?? ''
}

export async function init() {
  try {
    await resync()
    app.mode = 'live'
    connectEvents(
      apply,
      () => {
        if (!app.online) resync().catch(fail)
        app.online = true
      },
      () => (app.online = false),
    )
  } catch {
    // antd isn't running: keep the app usable with the scripted demo.
    app.mode = 'demo'
    app.ants = seedAnts
    app.colonies = seedColonies
    app.threads = seedThreads
    app.selectedId = 'chief'
  }
}

function upsertThread(summary: Omit<Thread, 'messages'>) {
  const t = threadById(summary.id)
  if (t) Object.assign(t, summary)
  else app.threads.push({ ...summary, messages: [] })
  if (summary.id === app.selectedId && summary.unread > 0) scheduleRead(summary.id)
}

function scheduleRead(threadId: string) {
  if (readTimer) clearTimeout(readTimer)
  readTimer = setTimeout(() => {
    if (app.selectedId === threadId && !document.hidden) api.read(threadId).catch(() => {})
  }, 400)
}

function apply(e: AntEvent) {
  switch (e.type) {
    case 'message.created': {
      const t = threadById(e.threadId)
      if (t && !t.messages.some((m) => m.id === e.message.id)) t.messages.push(e.message)
      break
    }
    case 'message.updated': {
      const t = threadById(e.threadId)
      const i = t?.messages.findIndex((m) => m.id === e.message.id) ?? -1
      if (t && i >= 0) t.messages[i] = e.message
      break
    }
    case 'message.delta': {
      const m = threadById(e.threadId)?.messages.find((x) => x.id === e.messageId)
      if (m?.kind === 'text') m.text += e.text
      break
    }
    case 'thread.updated':
      upsertThread(e.thread)
      break
    case 'thread.deleted': {
      const i = app.threads.findIndex((t) => t.id === e.threadId)
      if (i >= 0) app.threads.splice(i, 1)
      if (app.selectedId === e.threadId) app.selectedId = sortedThreads()[0]?.id ?? ''
      break
    }
    case 'ant.updated': {
      const i = app.ants.findIndex((a) => a.id === e.ant.id)
      if (i >= 0) app.ants[i] = e.ant
      else app.ants.push(e.ant)
      break
    }
    case 'colony.updated': {
      const i = app.colonies.findIndex((c) => c.id === e.colony.id)
      if (i >= 0) app.colonies[i] = e.colony
      else app.colonies.push(e.colony)
      break
    }
    case 'typing':
      app.typing[e.threadId] = e.antId ?? undefined
      break
    case 'usage':
      app.usage = e.usage
      break
    case 'notice':
      notify(e.text, e.level)
      break
    case 'computer':
      app.computers[e.state.antId] = e.state
      break
  }
}

/* ---------- actions ---------- */

export function select(id: string) {
  const t = threadById(id)
  if (!t) return
  app.selectedId = id
  app.takeover = false
  if (t.unread) {
    t.unread = 0
    if (live()) api.read(id).catch(() => {})
  }
}

export function selectAnt(antId: string) {
  const t = threadForAnt(antId) ?? threadById(antId)
  if (t) select(t.id)
}

export function selectRelative(delta: number) {
  const list = sortedThreads()
  const i = list.findIndex((t) => t.id === app.selectedId)
  const next = list[(i + delta + list.length) % list.length]
  if (next) select(next.id)
}

export function push(threadId: string, m: Message, bumpUnread = true) {
  const t = threadById(threadId)
  if (!t) return
  t.messages.push(m)
  t.updatedAt = Date.now()
  if (bumpUnread && m.author !== 'user' && threadId !== app.selectedId) t.unread += 1
}

export function send(text: string) {
  const t = threadById(app.selectedId)
  const body = text.trim()
  if (!t || !body) return
  app.drafts[t.id] = ''
  if (live()) {
    api.send(t.id, body).catch((err) => {
      app.drafts[t.id] = body
      fail(err)
    })
    return
  }
  if (/^stop now$/i.test(body)) {
    stop(t.id)
    return
  }
  push(t.id, { id: uid(), kind: 'text', author: 'user', text: body, at: Date.now() })
  respond(t, body)
}

export function stop(threadId: string) {
  if (live()) api.stop(threadId).catch(fail)
  else stopEngine(threadId)
}

export function decideApproval(threadId: string, msgId: string, decision: ApprovalMessage['decision']) {
  const m = threadById(threadId)?.messages.find((x) => x.id === msgId)
  if (m?.kind !== 'approval' || m.decision || !decision || decision === 'expired') return
  if (live()) {
    if (!m.approvalId) return
    m.decision = decision // optimistic; the server confirms with message.updated
    api.decide(m.approvalId, decision).catch((err) => {
      m.decision = undefined
      fail(err)
    })
    return
  }
  m.decision = decision
  const ant = antById(m.author)
  if (ant && ant.status === 'attention') ant.status = 'idle'
  if (decision === 'deny') return
  for (const d of threadById(threadId)!.messages) if (d.kind === 'draft' && !d.state) d.state = 'sent'
  setTimeout(() => {
    push(threadId, {
      id: uid(),
      kind: 'text',
      author: m.author,
      text: decision === 'always' ? `Sent. I'll send ${m.connector} messages like this without asking next time.` : 'Sent ✓',
      at: Date.now(),
    })
  }, 650)
}

export function draftAction(threadId: string, msgId: string, action: 'sent' | 'discarded', body?: string) {
  const m = threadById(threadId)?.messages.find((x) => x.id === msgId) as DraftMessage | undefined
  if (!m || m.state) return
  if (body !== undefined) m.body = body
  m.state = action
  if (live()) api.draft(msgId, action === 'sent' ? 'send' : 'discard', body).catch(fail)
}

export function togglePanel(p: Exclude<Panel, null>) {
  app.panel = app.panel === p ? null : p
}

export function togglePin(id: string) {
  const t = threadById(id)
  if (!t) return
  t.pinned = !t.pinned
  if (live()) api.pin(id, t.pinned).catch(fail)
}

export function renameAnt(id: string, name: string) {
  const a = antById(id)
  const n = name.trim()
  if (!a || !n || n === a.name) return
  if (live()) {
    api.updateAnt(id, { name: n }).catch(fail)
    return
  }
  a.name = n
  push(id, { id: uid(), kind: 'system', author: 'system', text: `Renamed to ${n}`, at: Date.now() }, false)
}

export function updateAnt(id: string, patch: Partial<Pick<Ant, 'name' | 'label' | 'description' | 'color' | 'accessory'>>) {
  const a = antById(id)
  if (!a) return
  Object.assign(a, patch)
  if (live()) api.updateAnt(id, patch).catch(fail)
}

export function deleteThread(id: string) {
  const t = threadById(id)
  if (!t) return
  if (live()) {
    if (t.kind === 'ant') api.deleteAnt(t.refId).catch(fail)
    else notify('Deleting colonies is coming soon.')
    return
  }
  const i = app.threads.indexOf(t)
  const wasSelected = app.selectedId === id
  app.threads.splice(i, 1)
  if (wasSelected) app.selectedId = sortedThreads()[0]?.id ?? ''
}

export async function createAnt(input: { name: string; label?: string; description: string; color: AntColor; accessory: Accessory }) {
  if (live()) {
    try {
      const ant = await api.createAnt(input)
      // The thread arrives over the event stream; wait briefly for it.
      for (let i = 0; i < 20 && !threadForAnt(ant.id); i++) await new Promise((r) => setTimeout(r, 50))
      selectAnt(ant.id)
      return ant.id
    } catch (err) {
      fail(err)
      return null
    }
  }
  const id = uid('ant')
  app.ants.push({ id, status: 'idle', ...input })
  app.threads.push({ id, kind: 'ant', refId: id, unread: 0, pinned: false, updatedAt: Date.now(), messages: [] })
  select(id)
  return id
}

export async function startComputer(antId: string) {
  try {
    app.computers[antId] = await api.startComputer(antId)
  } catch (err) {
    fail(err)
  }
}

export async function setLease(antId: string, holder: 'ant' | 'user') {
  try {
    app.computers[antId] = await api.lease(antId, holder)
    app.takeover = holder === 'user'
  } catch (err) {
    fail(err)
  }
}

export function setStatus(antId: string, status: Ant['status']) {
  const a = antById(antId)
  if (!a) return
  a.status = status
  if (live() && (status === 'paused' || status === 'idle')) api.updateAnt(antId, { status }).catch(fail)
}
