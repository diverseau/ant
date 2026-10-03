import type { AntEvent, ComputerState, CreateRoutineInput, Health, RoutineView, Settings, SkillView, UsageWindows, ChannelStatus, ConnectorsView } from '@ant/shared'
import { api, ApiError, connectEvents, type ColonyPatch, type RoutinePatch } from './api'
import { ants as seedAnts, colonies as seedColonies, threads as seedThreads, uid } from './mock/data'
import { respond, stop as stopEngine } from './mock/engine'
import type { Accessory, Ant, AntColor, ApprovalMessage, DraftMessage, Message, Thread } from './types'

export type Panel = 'computer' | 'details' | null
export type Overlay = 'palette' | 'new-ant' | 'new-colony' | 'connectors' | 'usage' | 'settings' | 'activity' | null
/** `live` talks to antd; `demo` runs the scripted mock when antd isn't reachable; `pair` is a
 * device antd doesn't know yet (opened from a phone or another computer). */
export type Mode = 'connecting' | 'live' | 'demo' | 'pair'

export interface Notice {
  id: string
  level: 'info' | 'warn' | 'error'
  text: string
}

export const app = $state({
  mode: 'connecting' as Mode,
  /** Phone layout: the chat screen is showing (otherwise the ant list). */
  mobileChat: false,
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
  settings: null as Settings | null,
  /** Message to scroll to and highlight (from search). */
  focusMessage: null as string | null,
  /** File open in the viewer. */
  viewer: null as { antId: string; path: string; name: string } | null,
  routines: [] as RoutineView[],
  connectors: null as ConnectorsView | null,
  channels: [] as ChannelStatus[],
  /** Skills of the selected thread's ant (live mode). */
  skills: [] as SkillView[],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
  app.settings = b.settings
  app.routines = b.routines
  app.timezone = b.settings.timezone
  app.typing = {}
  if (!threadById(app.selectedId)) app.selectedId = sortedThreads()[0]?.id ?? ''
}

let stopEvents: (() => void) | null = null

/** Notification taps open /?thread=<id>: show that chat. */
function openFromUrl(href: string) {
  const id = new URL(href).searchParams.get('thread')
  if (!id) return
  history.replaceState(null, '', location.pathname)
  if (threadById(id)) select(id)
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && typeof e.data.url === 'string') openFromUrl(e.data.url)
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('ant:unpaired', () => {
    stopEvents?.()
    stopEvents = null
    app.mode = 'pair'
  })
}

export async function init() {
  try {
    await resync()
    app.mode = 'live'
    openFromUrl(location.href)
    refreshSkills()
    stopEvents?.()
    stopEvents = connectEvents(
      apply,
      () => {
        if (!app.online) resync().catch(fail)
        app.online = true
      },
      () => (app.online = false),
    )
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      app.mode = 'pair'
      return
    }
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

function upsertRoutine(routine: RoutineView) {
  const i = app.routines.findIndex((r) => r.id === routine.id)
  if (i >= 0) app.routines[i] = routine
  else app.routines.push(routine)
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
      const t = threadById(e.threadId)
      if (t?.kind === 'colony') app.colonies = app.colonies.filter((c) => c.id !== t.refId)
      delete app.typing[e.threadId]
      delete app.drafts[e.threadId]
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
      if (threadById(app.selectedId)?.refId === e.colony.id) refreshSkills()
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
    case 'skills.updated':
      refreshSkills()
      break
    case 'connectors.updated':
      app.connectors = e.connectors
      break
    case 'routine.updated':
      upsertRoutine(e.routine)
      break
    case 'routine.deleted':
      app.routines = app.routines.filter((r) => r.id !== e.routineId)
      break
  }
}

/* ---------- actions ---------- */

// Routine callers catch errors to show the server's message beside the action/field.
function requireRoutines() {
  if (!live()) throw new Error('Routines are available when connected to antd.')
}

export async function createRoutine(input: CreateRoutineInput) {
  requireRoutines()
  const result = await api.createRoutine(input)
  upsertRoutine(result.routine)
  return result
}

export async function updateRoutine(id: string, patch: RoutinePatch) {
  requireRoutines()
  const before = app.routines.find((r) => r.id === id)?.enabled
  if (patch.enabled !== undefined) {
    const routine = app.routines.find((r) => r.id === id)
    if (routine) routine.enabled = patch.enabled
  }
  try {
    const routine = await api.updateRoutine(id, patch)
    upsertRoutine(routine)
    return routine
  } catch (err) {
    const routine = app.routines.find((r) => r.id === id)
    if (routine && before !== undefined && patch.enabled !== undefined && routine.enabled === patch.enabled) routine.enabled = before
    throw err
  }
}

export async function deleteRoutine(id: string) {
  requireRoutines()
  await api.deleteRoutine(id)
  app.routines = app.routines.filter((r) => r.id !== id)
}

export async function testRoutine(id: string) {
  requireRoutines()
  await api.testRoutine(id)
}

export async function routineRuns(id: string) {
  requireRoutines()
  return api.routineRuns(id)
}

/** The ant whose skills apply to a thread: the ant itself, or a colony's lead. */
function skillAnt(t: Thread | undefined): string | undefined {
  if (!t) return undefined
  const colony = t.kind === 'colony' ? colonyById(t.refId) : undefined
  return t.kind === 'ant' ? t.refId : colony?.leadAntId ?? colony?.memberIds[0]
}

export async function loadConnectors() {
  if (!live()) return
  try {
    const [c, ch] = await Promise.all([api.connectors(), api.channels()])
    app.connectors = c
    app.channels = ch
  } catch (err) {
    fail(err)
  }
}

/** Run a connectors/secrets/channels mutation; the server answers with the fresh view. */
export async function connectorsDo<T>(fn: () => Promise<T>, apply: (r: T) => void, ok?: string): Promise<boolean> {
  try {
    apply(await fn())
    if (ok) notify(ok)
    return true
  } catch (err) {
    fail(err)
    return false
  }
}

export function refreshSkills() {
  const antId = skillAnt(threadById(app.selectedId))
  if (!live() || !antId) return
  api
    .skills(antId)
    .then((s) => (app.skills = s))
    .catch(() => {})
}

export function select(id: string) {
  const t = threadById(id)
  if (!t) return
  const changedAnt = skillAnt(t) !== skillAnt(threadById(app.selectedId))
  app.selectedId = id
  app.mobileChat = true
  if (changedAnt) refreshSkills()
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

export function updateAnt(id: string, patch: Partial<Pick<Ant, 'name' | 'label' | 'description' | 'color' | 'accessory' | 'model' | 'effort' | 'fast' | 'permissionMode'>>) {
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
    else deleteColony(t.refId).catch(fail)
    return
  }
  if (t.kind === 'colony') {
    void deleteColony(t.refId)
    return
  }
  const i = app.threads.indexOf(t)
  const wasSelected = app.selectedId === id
  app.threads.splice(i, 1)
  if (wasSelected) app.selectedId = sortedThreads()[0]?.id ?? ''
}

function colonyMembers(ids: string[]): string[] {
  const members = [...new Set(ids)]
  if (members.length < 2 || members.length > 6) throw new Error('A colony needs between 2 and 6 ants')
  if (members.some((id) => !antById(id))) throw new Error('Every member must be an existing ant')
  return members
}

export async function createColony(input: { name: string; memberIds: string[]; leadAntId?: string }): Promise<string> {
  const memberIds = colonyMembers(input.memberIds)
  const name = input.name.trim()
  if (!name || name.length > 60) throw new Error('A colony name must be between 1 and 60 characters')
  const leadAntId = input.leadAntId ?? memberIds[0]
  if (!memberIds.includes(leadAntId)) throw new Error('The lead must be a member of the colony')
  // POST defaults the lead to the first member; preserve the chosen lead in that request.
  const ordered = [leadAntId, ...memberIds.filter((id) => id !== leadAntId)]
  if (live()) {
    const colony = await api.createColony(name, ordered)
    const i = app.colonies.findIndex((c) => c.id === colony.id)
    if (i >= 0) app.colonies[i] = colony
    else app.colonies.push(colony)
    let thread = app.threads.find((t) => t.kind === 'colony' && t.refId === colony.id)
    for (let i = 0; i < 20 && !thread; i++) {
      await new Promise((r) => setTimeout(r, 50))
      thread = app.threads.find((t) => t.kind === 'colony' && t.refId === colony.id)
    }
    if (!thread) {
      await resync()
      thread = app.threads.find((t) => t.kind === 'colony' && t.refId === colony.id)
    }
    if (!thread) throw new Error('Created colony, but its chat could not be loaded')
    select(thread.id)
    return colony.id
  }
  const id = uid('colony')
  const threadId = uid('thread')
  app.colonies.push({ id, name, memberIds: ordered, leadAntId })
  app.threads.push({ id: threadId, kind: 'colony', refId: id, unread: 0, pinned: false, updatedAt: Date.now(), messages: [] })
  push(threadId, { id: uid(), kind: 'system', author: 'system', text: `${ordered.map((id) => antById(id)!.name).join(', ')} formed ${name}`, at: Date.now() }, false)
  select(threadId)
  return id
}

export async function updateColony(id: string, patch: ColonyPatch) {
  const colony = colonyById(id)
  if (!colony) throw new Error('No such colony')
  const memberIds = colonyMembers(patch.memberIds ?? colony.memberIds)
  const name = (patch.name ?? colony.name).trim()
  if (!name || name.length > 60) throw new Error('A colony name must be between 1 and 60 characters')
  const leadAntId = patch.leadAntId ?? (colony.leadAntId && memberIds.includes(colony.leadAntId) ? colony.leadAntId : memberIds[0])
  if (!memberIds.includes(leadAntId)) throw new Error('The lead must be a member of the colony')
  if (live()) {
    const next = await api.updateColony(id, patch)
    const i = app.colonies.findIndex((c) => c.id === id)
    if (i >= 0) app.colonies[i] = next
  } else {
    const changed = memberIds.some((m) => !colony.memberIds.includes(m)) || colony.memberIds.some((m) => !memberIds.includes(m))
    // The scripted demo responder uses the first member as its lead.
    Object.assign(colony, { name, memberIds: [leadAntId, ...memberIds.filter((m) => m !== leadAntId)], leadAntId })
    const thread = app.threads.find((t) => t.kind === 'colony' && t.refId === id)
    if (thread && changed) push(thread.id, { id: uid(), kind: 'system', author: 'system', text: `Members updated: ${memberIds.map((m) => antById(m)!.name).join(', ')}`, at: Date.now() }, false)
  }
  if (threadById(app.selectedId)?.refId === id) refreshSkills()
}

export async function deleteColony(id: string) {
  if (live()) await api.deleteColony(id)
  const threads = app.threads.filter((t) => t.kind === 'colony' && t.refId === id)
  for (const thread of threads) {
    if (!live()) stopEngine(thread.id)
    delete app.typing[thread.id]
    delete app.drafts[thread.id]
  }
  app.colonies = app.colonies.filter((c) => c.id !== id)
  app.threads = app.threads.filter((t) => t.kind !== 'colony' || t.refId !== id)
  if (!threadById(app.selectedId)) app.selectedId = sortedThreads()[0]?.id ?? ''
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

const exhausted = new Set<string>()
let loadingOlder = false

/** Prepend older history when the reader scrolls to the top. Returns how many were added. */
export async function loadOlder(threadId: string): Promise<number> {
  const t = threadById(threadId)
  if (!live() || !t || loadingOlder || exhausted.has(threadId) || !t.messages.length) return 0
  loadingOlder = true
  try {
    const older = await api.older(threadId, t.messages[0].id)
    if (older.length < 50) exhausted.add(threadId)
    const known = new Set(t.messages.map((m) => m.id))
    const fresh = older.filter((m) => !known.has(m.id))
    t.messages.unshift(...fresh)
    return fresh.length
  } catch {
    return 0
  } finally {
    loadingOlder = false
  }
}

export async function saveSettings(patch: Partial<Settings>) {
  if (!live()) return
  try {
    app.settings = await api.settings(patch)
    app.timezone = app.settings.timezone
    if (patch.userName) app.user.name = app.settings.userName
    notify('Saved')
  } catch (err) {
    fail(err)
  }
}

export async function startComputer(antId: string) {
  try {
    app.computers[antId] = await api.startComputer(antId)
  } catch (err) {
    fail(err)
  }
}

export async function teach(antId: string, action: 'start' | 'stop' | 'cancel', title?: string) {
  try {
    app.computers[antId] = await api.teach(antId, action, title)
    if (action === 'stop') app.takeover = false
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

/** Secure secret card: send the value (or a decline) once; the card shows only the outcome. */
export async function answerSecret(messageId: string, value: string | null) {
  if (live()) return api.answerSecret(messageId, value)
  for (const t of app.threads) {
    const m = t.messages.find((x) => x.id === messageId)
    if (m && m.kind === 'secret') m.state = value === null ? 'declined' : 'saved'
  }
}
