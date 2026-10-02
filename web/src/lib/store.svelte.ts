import { ants as seedAnts, colonies as seedColonies, threads as seedThreads, uid } from './mock/data'
import { respond, stop as stopEngine } from './mock/engine'
import type { Accessory, Ant, AntColor, ApprovalMessage, DraftMessage, Message, Thread } from './types'

export type Panel = 'computer' | 'details' | null
export type Overlay = 'palette' | 'new-ant' | 'connectors' | null

export const app = $state({
  user: { name: 'Leon', plan: 'Pro' },
  ants: seedAnts,
  colonies: seedColonies,
  threads: seedThreads,
  selectedId: 'chief' as string,
  panel: null as Panel,
  overlay: null as Overlay,
  sidebarCollapsed: false,
  /** threadId -> ant id currently "typing" */
  typing: {} as Record<string, string | undefined>,
  /** threadId -> composer draft */
  drafts: {} as Record<string, string>,
  takeover: false,
})

/* ---------- lookups ---------- */

export const antById = (id: string): Ant | undefined => app.ants.find((a) => a.id === id)
export const threadById = (id: string): Thread | undefined => app.threads.find((t) => t.id === id)
export const colonyById = (id: string) => app.colonies.find((c) => c.id === id)

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
  if (typingAnt) return `${antById(typingAnt)?.name ?? 'Ant'} is working…`
  for (let i = t.messages.length - 1; i >= 0; i--) {
    const m = t.messages[i]
    const who = t.kind === 'colony' && m.author !== 'user' && m.author !== 'system' ? `${antById(m.author)?.name}: ` : ''
    const you = m.author === 'user' ? 'You: ' : ''
    switch (m.kind) {
      case 'text':
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
      case 'system':
        continue
    }
  }
  return 'Say hi 👋'
}

export function needsAttention(t: Thread): boolean {
  return t.messages.some((m) => m.kind === 'approval' && !m.decision)
}

/* ---------- actions ---------- */

export function select(id: string) {
  const t = threadById(id)
  if (!t) return
  app.selectedId = id
  t.unread = 0
  app.takeover = false
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
  if (/^stop now$/i.test(body)) {
    stop(t.id)
    return
  }
  push(t.id, { id: uid(), kind: 'text', author: 'user', text: body, at: Date.now() })
  app.drafts[t.id] = ''
  respond(t, body)
}

export function stop(threadId: string) {
  stopEngine(threadId)
}

export function decideApproval(threadId: string, msgId: string, decision: ApprovalMessage['decision']) {
  const m = threadById(threadId)?.messages.find((x) => x.id === msgId)
  if (m?.kind !== 'approval' || m.decision) return
  m.decision = decision
  const ant = antById(m.author)
  if (ant && ant.status === 'attention') ant.status = 'idle'
  if (decision === 'deny') return
  // Any drafts in this thread go out with the approval.
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
}

export function togglePanel(p: Exclude<Panel, null>) {
  app.panel = app.panel === p ? null : p
}

export function togglePin(id: string) {
  const t = threadById(id)
  if (t) t.pinned = !t.pinned
}

export function renameAnt(id: string, name: string) {
  const a = antById(id)
  const n = name.trim()
  if (!a || !n || n === a.name) return
  a.name = n
  push(id, { id: uid(), kind: 'system', author: 'system', text: `Renamed to ${n}`, at: Date.now() }, false)
}

export function deleteThread(id: string) {
  const i = app.threads.findIndex((t) => t.id === id)
  if (i < 0) return
  const wasSelected = app.selectedId === id
  app.threads.splice(i, 1)
  if (wasSelected) app.selectedId = sortedThreads()[0]?.id ?? ''
}

export function createAnt(input: { name: string; label?: string; description: string; color: AntColor; accessory: Accessory }) {
  const id = uid('ant')
  app.ants.push({ id, status: 'idle', ...input })
  app.threads.push({
    id,
    kind: 'ant',
    refId: id,
    unread: 0,
    pinned: false,
    updatedAt: Date.now(),
    messages: [],
  })
  select(id)
  return id
}

export function setStatus(antId: string, status: Ant['status']) {
  const a = antById(antId)
  if (a) a.status = status
}
