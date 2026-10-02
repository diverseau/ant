// antd's core: owns ants, their `claude` processes, turns, and the event stream to the UI.
import { randomBytes, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { Ant, AntEvent, Bootstrap, CreateAntInput, Message, UsageWindows } from '@ant/shared'
import { LoopGuard } from './colony/loop-guard.ts'
import type { Config } from './config.ts'
import type { Db } from './db/index.ts'
import * as R from './db/repos/index.ts'
import { toAnt, toColony, toMessage, toThread, toThreadSummary } from './mappers.ts'
import { antPaths, provisionAnt, readIfExists, slugify, type AntPaths } from './provision/ant.ts'
import { describeTool, isQuietTool } from './rules/describe.ts'
import { AntProcess } from './runner/process.ts'
import type { StreamEvent } from './runner/stream.ts'
import type { IpcServer } from './ipc.ts'

export type TurnSource = 'user' | 'ant' | 'routine' | 'system'

export interface Turn {
  threadId: string
  text: string
  source: TurnSource
  /** For ant-to-ant: deliver this turn's final text back to this ant. */
  replyTo?: { antId: string; threadId: string }
  fromAntId?: string
  depth: number
  enqueuedAt: number
}

interface Live {
  proc: AntProcess
  sessionId: string
  token: string
  paths: AntPaths
  current: Turn | null
  runId: string | null
  /** Cumulative session cost at the start of the current turn (result cost is cumulative). */
  costBase: number
  /** Streaming text blocks: stream key → message. */
  texts: Map<string, { id: string; threadId: string; text: string }>
  tools: Map<string, { messageId: string; threadId: string; startedAt: number; dbId: string }>
  lastText: string
}

const PRIORITY: Record<TurnSource, number> = { user: 0, system: 1, ant: 2, routine: 3 }

export class AntService {
  readonly bus = new EventEmitter()
  private live = new Map<string, Live>()
  private queues = new Map<string, Turn[]>()
  private loopGuard = new LoopGuard()
  private activity = new Map<string, string>()
  private reaper: NodeJS.Timeout
  readonly db: Db
  readonly cfg: Config
  readonly ipc: IpcServer
  userName = 'Leon'

  constructor(db: Db, cfg: Config, ipc: IpcServer) {
    this.db = db
    this.cfg = cfg
    this.ipc = ipc
    this.userName = R.getSetting(db, 'user.name', process.env.ANT_USER_NAME ?? 'Leon')
    this.reaper = setInterval(() => this.reapIdle(), 30_000)
    // Anything left "working" from a previous antd run is no longer working.
    for (const a of R.listAnts(db)) if (a.status === 'working') R.updateAnt(db, a.id, { status: 'idle' })
  }

  emit(e: AntEvent) {
    this.bus.emit('event', e)
  }

  /* ---------------- reads ---------------- */

  bootstrap(health: Bootstrap['health']): Bootstrap {
    const threads = R.listThreads(this.db).map((t) => toThread(t, R.listMessages(this.db, t.id, { limit: 80 })))
    return {
      user: { name: this.userName, plan: R.getSetting(this.db, 'user.plan', 'Max') },
      ants: R.listAnts(this.db).map((a) => this.view(a)),
      colonies: R.listColonies(this.db).map(toColony),
      threads,
      usage: R.getSetting<UsageWindows | null>(this.db, 'usage.windows', null),
      health,
    }
  }

  antRow(id: string) {
    const a = R.getAnt(this.db, id)
    if (!a || a.archived) throw new HttpError(404, 'No such ant')
    return a
  }

  pathsFor(antId: string): AntPaths {
    const a = this.antRow(antId)
    return antPaths(this.cfg, { id: a.id, slug: a.slug })
  }

  findAntByName(name: string) {
    const n = name.trim().replace(/^@/, '').toLowerCase()
    return R.listAnts(this.db).find((a) => a.name.toLowerCase() === n)
  }

  antThread(antId: string) {
    const t = R.getThreadByRef(this.db, 'ant', antId)
    if (!t) throw new HttpError(404, 'Ant has no thread')
    return t
  }

  /* ---------------- ants ---------------- */

  createAnt(input: CreateAntInput): Ant {
    const name = input.name.trim()
    if (!name) throw new HttpError(400, 'Name is required')
    if (this.findAntByName(name)) throw new HttpError(409, `There is already an ant called ${name}`)
    let slug = slugify(name)
    for (let i = 2; R.getAntBySlug(this.db, slug); i++) slug = `${slugify(name)}-${i}`
    const row = R.createAnt(this.db, {
      slug,
      name,
      label: input.label?.trim() ?? '',
      description: input.description.trim() || 'A helpful ant.',
      color: input.color,
      accessory: input.accessory,
      model: input.model ?? this.cfg.defaultModel,
      effort: '',
    })
    const thread = R.createThread(this.db, { kind: 'ant', refId: row.id })
    // Create the folder now so it's visible on disk straight away.
    this.provision(row.id, randomBytes(24).toString('hex'))
    const ant = toAnt(row)
    this.emit({ type: 'ant.updated', ant })
    this.emit({ type: 'thread.updated', thread: toThreadSummary(thread) })
    return ant
  }

  updateAnt(id: string, patch: Partial<Pick<Ant, 'name' | 'label' | 'description' | 'color' | 'accessory' | 'status' | 'model'>>): Ant {
    const row = this.antRow(id)
    if (patch.name && patch.name.trim() !== row.name) {
      const clash = this.findAntByName(patch.name)
      if (clash && clash.id !== id) throw new HttpError(409, `There is already an ant called ${patch.name}`)
      this.system(this.antThread(id).id, `Renamed to ${patch.name.trim()}`)
    }
    const next = R.updateAnt(this.db, id, {
      ...(patch.name !== undefined && { name: patch.name.trim() }),
      ...(patch.label !== undefined && { label: patch.label ?? '' }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.color !== undefined && { color: patch.color }),
      ...(patch.accessory !== undefined && { accessory: patch.accessory }),
      ...(patch.model !== undefined && { model: patch.model }),
      ...(patch.status !== undefined && { status: patch.status }),
    })!
    if (patch.status === 'paused') this.stopAnt(id)
    // Identity changes reach the ant on its next session; restart an idle one now.
    const l = this.live.get(id)
    if (l && !l.current && (patch.name || patch.description || patch.label)) this.stopAnt(id)
    const ant = toAnt(next)
    this.emit({ type: 'ant.updated', ant })
    return ant
  }

  deleteAnt(id: string) {
    this.antRow(id)
    this.stopAnt(id)
    const t = R.getThreadByRef(this.db, 'ant', id)
    if (t) {
      R.deleteThread(this.db, t.id)
      this.emit({ type: 'thread.deleted', threadId: t.id })
    }
    for (const c of R.listColonies(this.db)) {
      if (c.memberIds.includes(id)) {
        const next = R.setMembers(this.db, c.id, c.memberIds.filter((m) => m !== id))
        if (next) this.emit({ type: 'colony.updated', colony: toColony(next) })
      }
    }
    R.archiveAnt(this.db, id)
  }

  createColony(name: string, memberIds: string[]) {
    if (memberIds.length < 2) throw new HttpError(400, 'A colony needs at least two ants')
    const c = R.createColony(this.db, { name: name.trim() || 'New colony', memberIds, leadAntId: memberIds[0] })
    const t = R.createThread(this.db, { kind: 'colony', refId: c.id })
    this.emit({ type: 'colony.updated', colony: toColony(c) })
    this.emit({ type: 'thread.updated', thread: toThreadSummary(t) })
    this.system(t.id, `${memberIds.map((m) => R.getAnt(this.db, m)?.name).join(', ')} formed ${c.name}`)
    return toColony(c)
  }

  /* ---------------- messages ---------------- */

  insert(threadId: string, author: string, kind: string, payload: Record<string, unknown>, text = '', runId?: string | null): Message {
    const row = R.insertMessage(this.db, { threadId, author, kind, payload, text, runId: runId ?? null })
    if (author !== 'user' && author !== 'system') R.incrementUnread(this.db, threadId)
    const message = toMessage(row)
    this.emit({ type: 'message.created', threadId, message })
    const t = R.getThread(this.db, threadId)
    if (t) this.emit({ type: 'thread.updated', thread: toThreadSummary(t) })
    return message
  }

  patch(messageId: string, payload: Record<string, unknown>, text?: string) {
    const prev = R.getMessage(this.db, messageId)
    if (!prev) return
    const row = R.updateMessage(this.db, messageId, { payload: { ...(prev.payload as object), ...payload }, ...(text !== undefined && { text }) })
    if (row) this.emit({ type: 'message.updated', threadId: row.threadId, message: toMessage(row) })
  }

  system(threadId: string, text: string) {
    return this.insert(threadId, 'system', 'system', {}, text)
  }

  markRead(threadId: string) {
    const t = R.markRead(this.db, threadId)
    if (t) {
      R.updateThread(this.db, threadId, { unread: 0 })
      this.emit({ type: 'thread.updated', thread: toThreadSummary({ ...t, unread: 0 }) })
    }
  }

  /** A message from the user into a thread: routes to the right ant(s). */
  sendFromUser(threadId: string, text: string) {
    const body = text.trim()
    if (!body) throw new HttpError(400, 'Empty message')
    const thread = R.getThread(this.db, threadId)
    if (!thread) throw new HttpError(404, 'No such thread')
    if (/^stop( now)?[.!]?$/i.test(body)) {
      this.insert(threadId, 'user', 'text', {}, body)
      this.stopThread(threadId)
      return
    }
    this.insert(threadId, 'user', 'text', {}, body)
    if (thread.kind === 'ant') {
      const ant = this.antRow(thread.refId)
      if (ant.status === 'paused') {
        this.system(threadId, `${ant.name} is paused. Resume it to continue.`)
        return
      }
      this.enqueue(ant.id, { threadId, text: `[${this.userName}] ${body}`, source: 'user', depth: 0, enqueuedAt: Date.now() })
      return
    }
    const colony = R.getColony(this.db, thread.refId)
    if (!colony) throw new HttpError(404, 'No such colony')
    const members = colony.memberIds.map((id) => R.getAnt(this.db, id)).filter((a): a is R.Ant => !!a && !a.archived)
    const mentioned = members.filter((a) => new RegExp(`@${escapeRe(a.name)}\\b`, 'i').test(body))
    const targets = mentioned.length ? mentioned : members.filter((a) => a.id === (colony.leadAntId ?? members[0]?.id))
    for (const a of targets) {
      this.enqueue(a.id, { threadId, text: `[Colony: ${colony.name} · ${this.userName}] ${body}`, source: 'user', depth: 0, enqueuedAt: Date.now() })
    }
  }

  /* ---------------- turns ---------------- */

  enqueue(antId: string, turn: Turn) {
    const q = this.queues.get(antId) ?? []
    q.push(turn)
    q.sort((a, b) => PRIORITY[a.source] - PRIORITY[b.source] || a.enqueuedAt - b.enqueuedAt)
    this.queues.set(antId, q)
    const l = this.live.get(antId)
    if (l?.current && turn.source === 'user' && l.current.threadId === turn.threadId) {
      // Spike 1: messages sent mid-turn queue in the CLI anyway. Show it's waiting.
      this.emit({ type: 'notice', level: 'info', text: 'Queued. It will read this when it finishes the current step.' })
    }
    this.pump()
  }

  private busyCount() {
    let n = 0
    for (const l of this.live.values()) if (l.current) n++
    return n
  }

  /** Start the next queued turn for every ant that can take one, respecting the busy cap. */
  pump() {
    for (const [antId, q] of this.queues) {
      if (!q.length) continue
      const l = this.live.get(antId)
      if (l?.current) continue
      if (this.busyCount() >= this.cfg.maxBusy) return
      const turn = q.shift()!
      this.startTurn(antId, turn)
    }
  }

  private provision(antId: string, token: string): AntPaths {
    const row = this.antRow(antId)
    const all = R.listAnts(this.db)
    const paths0 = antPaths(this.cfg, { id: row.id, slug: row.slug })
    const grants = R.listRules(this.db, { antId })
      .filter((r) => r.behaviour === 'allow' && r.source === 'user' && /^[\w*]+(\(.*\))?$/.test(r.pattern) && !r.note?.startsWith('input:'))
      .map((r) => r.pattern)
    return provisionAnt(
      this.cfg,
      { ...toAnt(row), slug: row.slug },
      {
        userName: this.userName,
        roster: all.map((a) => ({ name: a.name, label: a.label, description: a.description, self: a.id === antId })),
        colonies: R.listColonies(this.db)
          .filter((c) => c.memberIds.includes(antId))
          .map((c) => ({ name: c.name, members: c.memberIds.map((m) => R.getAnt(this.db, m)?.name ?? '?') })),
        memoryBlock: renderEntries(readIfExists(paths0.memory)),
        userBlock: renderEntries(readIfExists(`${this.cfg.antHome}/USER.md`)),
        grants,
        network: R.getSetting(this.db, `ant.${antId}.network`, 'open') as 'open' | 'allowlist',
        allowedDomains: R.getSetting<string[]>(this.db, `ant.${antId}.domains`, []),
      },
      token,
      all.filter((a) => a.id !== antId).map((a) => antPaths(this.cfg, { id: a.id, slug: a.slug }).folder),
    )
  }

  private ensureProcess(antId: string): Live {
    const existing = this.live.get(antId)
    if (existing && existing.proc.state !== 'exited') return existing
    const row = this.antRow(antId)
    const token = randomBytes(24).toString('hex')
    this.ipc.issueToken(antId, token)
    const paths = this.provision(antId, token)
    const known = R.getSetting<string | null>(this.db, `ant.${antId}.session`, null)
    const sessionId = known ?? randomUUID()
    if (!known) R.setSetting(this.db, `ant.${antId}.session`, sessionId)
    const live: Live = {
      sessionId,
      token,
      paths,
      current: null,
      runId: null,
      costBase: 0,
      texts: new Map(),
      tools: new Map(),
      lastText: '',
      proc: null as unknown as AntProcess,
    }
    live.proc = new AntProcess(
      {
        bin: this.cfg.claudeBin,
        cwd: paths.folder,
        sessionId,
        resume: !!known,
        settingsPath: paths.settings,
        mcpConfigPath: paths.mcpConfig,
        model: row.model || this.cfg.defaultModel,
        effort: row.effort || undefined,
        env: { ANT_SOCKET: this.cfg.socketPath, ANT_TOKEN: token, ANT_ID: antId },
      },
      {
        onEvent: (e) => this.onEvent(antId, e),
        onExit: (info) => this.onExit(antId, live, info),
      },
    )
    this.live.set(antId, live)
    return live
  }

  private startTurn(antId: string, turn: Turn) {
    let l: Live
    try {
      l = this.ensureProcess(antId)
    } catch (err) {
      this.insert(turn.threadId, antId, 'error', { detail: String(err) }, 'Could not start this ant.')
      return
    }
    l.current = turn
    l.lastText = ''
    const run = R.createRun(this.db, {
      antId,
      threadId: turn.threadId,
      sessionId: l.sessionId,
      trigger: turn.source === 'system' ? 'user' : turn.source,
      status: 'running',
      startedAt: Date.now(),
    })
    l.runId = run.id
    this.setStatus(antId, 'working')
    this.emit({ type: 'typing', threadId: turn.threadId, antId })
    try {
      l.proc.send(turn.text)
    } catch (err) {
      this.finishTurn(antId, l, false, String(err))
    }
  }

  private onEvent(antId: string, e: StreamEvent) {
    const l = this.live.get(antId)
    if (!l) return
    const threadId = l.current?.threadId ?? this.antThread(antId).id
    switch (e.t) {
      case 'init':
        if (e.sessionId && e.sessionId !== l.sessionId) {
          l.sessionId = e.sessionId
          R.setSetting(this.db, `ant.${antId}.session`, e.sessionId)
        }
        break
      case 'text.start':
        // Created lazily on the first delta: many blocks are empty preambles to tool calls.
        l.texts.set(e.key, { id: '', threadId, text: '' })
        break
      case 'text.delta': {
        const t = l.texts.get(e.key)
        if (!t) break
        if (!t.id) {
          t.id = this.insert(t.threadId, antId, 'text', { streaming: true }, '', l.runId).id
        }
        t.text += e.text
        this.emit({ type: 'message.delta', threadId: t.threadId, messageId: t.id, text: e.text })
        break
      }
      case 'text.end': {
        const t = l.texts.get(e.key) ?? { id: '', threadId, text: '' }
        l.texts.delete(e.key)
        if (!e.text.trim()) break
        l.lastText = e.text
        if (t.id) this.patch(t.id, { streaming: false }, e.text)
        else this.insert(t.threadId, antId, 'text', {}, e.text, l.runId)
        break
      }
      case 'tool.start': {
        if (e.parentToolUseId || isQuietTool(e.name)) break
        const d = describeTool(e.name, e.input, l.paths.folder)
        const m = this.insert(threadId, antId, 'tool', { toolUseId: e.toolUseId, name: e.name, title: d.title, detail: d.detail, state: 'running' }, '', l.runId)
        const ev = l.runId ? R.addToolEvent(this.db, { runId: l.runId, toolUseId: e.toolUseId, name: e.name, input: e.input, status: 'running' }) : null
        l.tools.set(e.toolUseId, { messageId: m.id, threadId, startedAt: Date.now(), dbId: ev?.id ?? '' })
        break
      }
      case 'tool.result': {
        const t = l.tools.get(e.toolUseId)
        if (!t) break
        l.tools.delete(e.toolUseId)
        const denied = e.isError && /denied|blocked|not allowed|permission/i.test(e.summary)
        const state = denied ? 'denied' : e.isError ? 'error' : 'ok'
        const durationMs = Date.now() - t.startedAt
        this.patch(t.messageId, { state, durationMs, ...(e.isError && { detail: e.summary }) })
        if (t.dbId) R.updateToolEvent(this.db, t.dbId, { status: state, durationMs, outputSummary: e.summary })
        break
      }
      case 'rate_limit': {
        const usage: UsageWindows = { status: e.status, fiveHour: e.fiveHour, sevenDay: e.sevenDay, updatedAt: Date.now() }
        R.setSetting(this.db, 'usage.windows', usage)
        this.emit({ type: 'usage', usage })
        if (e.status !== 'allowed') this.emit({ type: 'notice', level: 'warn', text: 'Usage limit reached. Ants will pause until it resets.' })
        break
      }
      case 'result': {
        const cost = Math.max(0, e.totalCostUsd - l.costBase)
        l.costBase = e.totalCostUsd
        if (l.runId) {
          R.updateRun(this.db, l.runId, {
            status: e.ok ? 'succeeded' : e.subtype === 'error_during_execution' ? 'stopped' : 'failed',
            endedAt: Date.now(),
            costUsd: cost,
            tokensIn: e.usage.input + e.usage.cacheRead + e.usage.cacheWrite,
            tokensOut: e.usage.output,
            turns: e.turns,
            error: e.ok ? null : e.errors.join('; ') || e.subtype,
          })
        }
        R.addUsage(this.db, { date: new Date().toISOString().slice(0, 10), antId, costUsd: cost, tokens: e.usage.input + e.usage.output })
        if (!e.ok && e.subtype !== 'error_during_execution') {
          const text = e.errors.join('\n') || e.text || e.subtype
          this.insert(threadId, antId, 'error', { detail: text }, limitText(text) ?? 'Something went wrong on that turn.', l.runId)
        }
        this.finishTurn(antId, l, e.ok)
        break
      }
      default:
        break
    }
  }

  private finishTurn(antId: string, l: Live, ok: boolean, error?: string) {
    const turn = l.current
    // Close anything left open (interrupts leave tools and text dangling).
    for (const t of l.tools.values()) this.patch(t.messageId, { state: 'error', detail: 'Stopped' })
    l.tools.clear()
    for (const t of l.texts.values()) if (t.id) this.patch(t.id, { streaming: false }, t.text)
    l.texts.clear()
    l.current = null
    this.activity.delete(antId)
    if (error && turn) this.insert(turn.threadId, antId, 'error', { detail: error }, 'This ant stopped unexpectedly.')
    if (turn) this.emit({ type: 'typing', threadId: turn.threadId, antId: null })
    const pending = R.listApprovals(this.db, { status: 'pending', antId }).length
    const row = R.getAnt(this.db, antId)
    if (row && row.status !== 'paused') this.setStatus(antId, pending ? 'attention' : 'idle')
    // Ant-to-ant: hand the answer back to whoever asked.
    if (turn?.replyTo && ok) {
      const name = row?.name ?? 'An ant'
      const answer = l.lastText.trim() || '(no reply)'
      this.system(turn.replyTo.threadId, `${name} replied`)
      this.enqueue(turn.replyTo.antId, {
        threadId: turn.replyTo.threadId,
        text: `[Reply from ${name}] ${answer}`,
        source: 'ant',
        fromAntId: antId,
        depth: turn.depth + 1,
        enqueuedAt: Date.now(),
      })
    }
    this.pump()
  }

  private onExit(antId: string, l: Live, info: { code: number | null; signal: string | null; stderr: string }) {
    if (this.live.get(antId) === l) this.live.delete(antId)
    if (l.current) {
      const detail = info.stderr.trim().split('\n').slice(-12).join('\n') || `exit ${info.code ?? info.signal}`
      // A missing/expired session can't be resumed; start fresh next time.
      if (/No conversation found|session.*not found/i.test(info.stderr)) R.setSetting(this.db, `ant.${antId}.session`, null)
      if (l.runId) R.updateRun(this.db, l.runId, { status: 'failed', endedAt: Date.now(), error: detail })
      const turn = l.current
      this.finishTurn(antId, l, false)
      this.insert(turn.threadId, antId, 'error', { detail }, limitText(detail) ?? 'This ant stopped unexpectedly. Send another message to restart it.')
    }
  }

  setStatus(antId: string, status: Ant['status']) {
    const row = R.updateAnt(this.db, antId, { status })
    if (row) this.emit({ type: 'ant.updated', ant: this.view(row) })
  }

  setActivity(antId: string, text: string | null) {
    if (text) this.activity.set(antId, text)
    else this.activity.delete(antId)
    const row = R.getAnt(this.db, antId)
    if (row) this.emit({ type: 'ant.updated', ant: this.view(row) })
  }

  view(row: R.Ant): Ant {
    const activity = this.activity.get(row.id)
    return { ...toAnt(row), ...(activity && { activity }) }
  }

  /** Interrupt whatever is running in this thread. */
  stopThread(threadId: string) {
    let stopped = false
    for (const [antId, l] of this.live) {
      if (l.current?.threadId !== threadId) continue
      try {
        l.proc.interrupt()
        stopped = true
      } catch {
        this.stopAnt(antId)
      }
    }
    for (const [antId, q] of this.queues) this.queues.set(antId, q.filter((t) => t.threadId !== threadId))
    this.system(threadId, stopped ? 'Stopped. Completed actions were not undone.' : 'Nothing was running.')
  }

  stopAnt(antId: string) {
    const l = this.live.get(antId)
    if (!l) return
    this.live.delete(antId)
    l.proc.stop()
  }

  liveProcess(antId: string) {
    return this.live.get(antId)
  }

  currentTurn(antId: string): Turn | null {
    return this.live.get(antId)?.current ?? null
  }

  /** The thread an ant's tool output belongs in right now. */
  threadForAnt(antId: string): string {
    return this.currentTurn(antId)?.threadId ?? this.antThread(antId).id
  }

  /* ---------------- ant to ant ---------------- */

  messageAnt(fromId: string, toName: string, text: string): string {
    const from = this.antRow(fromId)
    const to = this.findAntByName(toName)
    if (!to || to.archived) return `There's no ant called ${toName}. Use list_ants to see who's here.`
    if (to.id === fromId) return "You can't message yourself."
    if (to.status === 'paused') return `${to.name} is paused right now.`
    const turn = this.currentTurn(fromId)
    const depth = (turn?.depth ?? 0) + 1
    const verdict = this.loopGuard.admit({ from: fromId, to: to.id }, depth)
    if (!verdict.ok) {
      const t = this.threadForAnt(fromId)
      this.system(t, `Paused the back-and-forth between ${from.name} and ${to.name}`)
      return verdict.reason === 'depth'
        ? 'Not sent: this request has been passed between ants too many times. Answer with what you have.'
        : `Not sent: you and ${to.name} have exchanged a lot of messages quickly. Wait and summarise for ${this.userName} instead.`
    }
    const toThread = this.antThread(to.id)
    const replyThread = this.threadForAnt(fromId)
    this.insert(toThread.id, fromId, 'text', {}, text)
    this.enqueue(to.id, {
      threadId: toThread.id,
      text: `[From ${from.name}] ${text}`,
      source: 'ant',
      fromAntId: fromId,
      replyTo: { antId: fromId, threadId: replyThread },
      depth,
      enqueuedAt: Date.now(),
    })
    this.system(replyThread, `${from.name} asked ${to.name} for help`)
    return `Sent to ${to.name}. Their reply will arrive as a new message starting with [Reply from ${to.name}]. Don't wait idle; carry on or finish your turn.`
  }

  postToColony(antId: string, colonyName: string, text: string): string {
    const colony = R.listColonies(this.db).find((c) => c.name.toLowerCase() === colonyName.trim().toLowerCase() && c.memberIds.includes(antId))
    if (!colony) return `You're not in a colony called ${colonyName}.`
    const thread = R.getThreadByRef(this.db, 'colony', colony.id)
    if (!thread) return 'That colony has no chat yet.'
    this.insert(thread.id, antId, 'text', {}, text)
    const sender = this.antRow(antId)
    const depth = (this.currentTurn(antId)?.depth ?? 0) + 1
    for (const id of colony.memberIds) {
      const a = R.getAnt(this.db, id)
      if (!a || id === antId || !new RegExp(`@${escapeRe(a.name)}\\b`, 'i').test(text)) continue
      if (!this.loopGuard.admit({ from: antId, to: id }, depth).ok) continue
      this.enqueue(id, { threadId: thread.id, text: `[Colony: ${colony.name} · ${sender.name}] ${text}`, source: 'ant', fromAntId: antId, depth, enqueuedAt: Date.now() })
    }
    return 'Posted.'
  }

  /* ---------------- lifecycle ---------------- */

  private reapIdle() {
    const now = Date.now()
    for (const [antId, l] of this.live) {
      if (!l.current && now - l.proc.lastActive > this.cfg.idleMs) this.stopAnt(antId)
    }
  }

  shutdown() {
    clearInterval(this.reaper)
    for (const id of [...this.live.keys()]) this.stopAnt(id)
  }
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Render a §-delimited memory file as a bullet list for CLAUDE.md. */
export function renderEntries(raw: string): string {
  const entries = raw
    .split(/\n§\n/)
    .map((e) => e.trim())
    .filter(Boolean)
  return entries.map((e) => `- ${e.replace(/\n/g, '\n  ')}`).join('\n')
}

function limitText(text: string): string | null {
  if (/usage limit|rate limit|limit reached|too many requests|429/i.test(text)) return 'Usage limit reached. This ant will continue when it resets.'
  if (/login|authenticat|unauthori[sz]ed|\/login/i.test(text)) return 'Claude Code needs you to sign in again. Run `claude` in a terminal and use /login.'
  return null
}
