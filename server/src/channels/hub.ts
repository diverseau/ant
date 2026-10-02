// Routes chat-app messages to ants and their replies back (plan milestone 0.10).
// Security: only allow-listed platform users are heard; everyone else is ignored silently.
import type { AntEvent } from '@ant/shared'
import * as R from '../db/repos/index.ts'
import type { AntService, Turn } from '../service.ts'
import type { ChannelAdapter, ChannelBinding, ChannelConfig, ChannelKind, InboundMessage } from './types.ts'

export type AdapterFactory = (kind: ChannelKind, token: string) => Promise<ChannelAdapter>

export interface ChannelStatus {
  kind: ChannelKind
  enabled: boolean
  connected: boolean
  botName: string | null
  error: string | null
  allowUsers: string[]
}

const HELP = `Commands:
/ants — list ants and colonies
/use <name> — talk to that ant or colony in this chat
/stop — stop what's running
Anything else goes to the current ant.`

export class ChannelHub {
  private svc: AntService
  private factory: AdapterFactory
  private secret: (name: string) => string | null
  private adapters = new Map<ChannelKind, ChannelAdapter>()
  private status = new Map<ChannelKind, ChannelStatus>()
  /** thread id → chats waiting on replies in that thread */
  private watchers = new Map<string, Set<string>>()

  constructor(svc: AntService, factory: AdapterFactory, secret: (name: string) => string | null) {
    this.svc = svc
    this.factory = factory
    this.secret = secret
    svc.bus.on('turn.finished', (e: { antId: string; turn: Turn; ok: boolean; text: string }) => void this.replied(e))
    svc.bus.on('event', (e: AntEvent) => void this.onEvent(e))
  }

  configs(): ChannelConfig[] {
    return R.getSetting<ChannelConfig[]>(this.svc.db, 'channels', [])
  }

  statuses(): ChannelStatus[] {
    return this.configs().map(
      (c) => this.status.get(c.kind) ?? { kind: c.kind, enabled: c.enabled, connected: false, botName: null, error: null, allowUsers: c.allowUsers },
    )
  }

  async configure(cfg: ChannelConfig) {
    const list = this.configs().filter((c) => c.kind !== cfg.kind)
    list.push(cfg)
    R.setSetting(this.svc.db, 'channels', list)
    await this.stopOne(cfg.kind)
    if (cfg.enabled) await this.startOne(cfg)
  }

  async remove(kind: ChannelKind) {
    R.setSetting(this.svc.db, 'channels', this.configs().filter((c) => c.kind !== kind))
    await this.stopOne(kind)
    this.status.delete(kind)
  }

  async startAll() {
    for (const c of this.configs()) if (c.enabled) await this.startOne(c)
  }

  private async startOne(cfg: ChannelConfig) {
    const token = this.secret(cfg.tokenSecret)
    const base: ChannelStatus = { kind: cfg.kind, enabled: cfg.enabled, connected: false, botName: null, error: null, allowUsers: cfg.allowUsers }
    if (!token) {
      this.status.set(cfg.kind, { ...base, error: `Secret ${cfg.tokenSecret} not found` })
      return
    }
    try {
      const adapter = await this.factory(cfg.kind, token)
      const { botName } = await adapter.start({ onMessage: (m) => void this.inbound(m), log: (msg) => console.log(`[${cfg.kind}] ${msg}`) })
      this.adapters.set(cfg.kind, adapter)
      this.status.set(cfg.kind, { ...base, connected: true, botName })
    } catch (err) {
      this.status.set(cfg.kind, { ...base, error: err instanceof Error ? err.message : String(err) })
    }
  }

  private async stopOne(kind: ChannelKind) {
    const a = this.adapters.get(kind)
    this.adapters.delete(kind)
    await a?.stop().catch(() => {})
  }

  async shutdown() {
    for (const kind of [...this.adapters.keys()]) await this.stopOne(kind)
  }

  /* ---------- routing ---------- */

  bindings(): ChannelBinding[] {
    return R.getSetting<ChannelBinding[]>(this.svc.db, 'channels.bindings', [])
  }

  private bind(b: ChannelBinding) {
    R.setSetting(this.svc.db, 'channels.bindings', [...this.bindings().filter((x) => !(x.channel === b.channel && x.chatId === b.chatId)), b])
  }

  /** The thread a chat talks to: its binding, else the default ant (first pinned or first). */
  private threadFor(m: InboundMessage) {
    const b = this.bindings().find((x) => x.channel === m.channel && x.chatId === m.chatId)
    if (b) {
      const t = R.getThreadByRef(this.svc.db, b.target.kind, b.target.id)
      if (t) return t
    }
    const threads = R.listThreads(this.svc.db).filter((t) => t.kind === 'ant')
    return threads.find((t) => t.pinned) ?? threads[0] ?? null
  }

  private allowed(m: InboundMessage): boolean {
    const cfg = this.configs().find((c) => c.kind === m.channel)
    return !!cfg && cfg.allowUsers.includes(m.userId)
  }

  private async inbound(m: InboundMessage) {
    if (!this.allowed(m)) return
    if (!m.direct && !m.addressed) return
    const adapter = this.adapters.get(m.channel)
    if (!adapter) return
    const reply = (text: string) => adapter.send(m.chatId, text).catch(() => {})
    const text = m.text.trim()

    if (/^\/(start|help)\b/i.test(text)) return reply(HELP)
    if (/^\/ants\b/i.test(text)) {
      const ants = R.listAnts(this.svc.db).map((a) => `• ${a.name}${a.label ? ` — ${a.label}` : ''}`)
      const colonies = R.listColonies(this.svc.db).map((c) => `• ${c.name} (colony)`)
      const current = this.threadFor(m)
      return reply([...ants, ...colonies].join('\n') + (current ? `\n\nTalking to: ${this.titleOf(current)}` : ''))
    }
    const use = text.match(/^\/use\s+(.+)$/i)
    if (use) {
      const name = use[1].trim().toLowerCase()
      const ant = R.listAnts(this.svc.db).find((a) => a.name.toLowerCase() === name)
      const colony = R.listColonies(this.svc.db).find((c) => c.name.toLowerCase() === name)
      if (!ant && !colony) return reply(`No ant or colony called ${use[1].trim()}. Try /ants.`)
      this.bind({ channel: m.channel, chatId: m.chatId, target: ant ? { kind: 'ant', id: ant.id } : { kind: 'colony', id: colony!.id } })
      return reply(`Now talking to ${ant?.name ?? colony!.name}.`)
    }
    const thread = this.threadFor(m)
    if (!thread) return reply('No ants yet. Hatch one in the Ant app first.')
    if (/^\/stop\b/i.test(text)) {
      this.svc.stopThread(thread.id)
      return reply('Stopped.')
    }
    const key = `${m.channel}:${m.chatId}`
    const set = this.watchers.get(thread.id) ?? new Set()
    set.add(key)
    this.watchers.set(thread.id, set)
    void adapter.typing?.(m.chatId)
    this.svc.sendFromUser(thread.id, `${text}\n\n(sent from ${m.channel})`)
  }

  private titleOf(t: R.Thread): string {
    return t.kind === 'ant' ? (R.getAnt(this.svc.db, t.refId)?.name ?? 'an ant') : (R.getColony(this.svc.db, t.refId)?.name ?? 'a colony')
  }

  /** Send each finished turn's answer to the chats waiting on that thread. */
  private async replied(e: { antId: string; turn: Turn; ok: boolean; text: string }) {
    const chats = this.watchers.get(e.turn.threadId)
    if (!chats?.size || e.turn.source !== 'user') return
    const ant = R.getAnt(this.svc.db, e.antId)
    const thread = R.getThread(this.svc.db, e.turn.threadId)
    const prefix = thread?.kind === 'colony' ? `${ant?.name ?? 'Ant'}: ` : ''
    const text = e.text.trim() || (e.ok ? 'Done.' : 'Something went wrong. Check the Ant app.')
    for (const key of chats) {
      const [kind, chatId] = splitKey(key)
      await this.adapters.get(kind)?.send(chatId, prefix + text).catch(() => {})
    }
  }

  /** Approvals and hand-offs need the app; tell the chat so the user isn't left waiting. */
  private async onEvent(e: AntEvent) {
    if (e.type !== 'message.created' || e.message.kind !== 'approval') return
    const chats = this.watchers.get(e.threadId)
    if (!chats?.size) return
    const ant = R.getAnt(this.svc.db, e.message.author)
    const what = e.message.behaviour === 'handoff' ? 'needs you on its computer' : 'needs your approval'
    for (const key of chats) {
      const [kind, chatId] = splitKey(key)
      await this.adapters.get(kind)?.send(chatId, `${ant?.name ?? 'An ant'} ${what}: ${e.message.action}\nOpen Ant to decide.`).catch(() => {})
    }
  }
}

function splitKey(key: string): [ChannelKind, string] {
  const i = key.indexOf(':')
  return [key.slice(0, i) as ChannelKind, key.slice(i + 1)]
}
