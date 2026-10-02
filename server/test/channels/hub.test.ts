import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelHub } from '../../src/channels/hub.ts'
import type { ChannelAdapter, ChannelContext, InboundMessage } from '../../src/channels/types.ts'
import * as R from '../../src/db/repos/index.ts'
import { createHarness, waitFor, type Harness } from '../integration/helpers.ts'

class MemoryAdapter implements ChannelAdapter {
  readonly kind = 'telegram'
  context?: ChannelContext
  sent: Array<{ chatId: string; text: string }> = []
  typing = vi.fn(async (_chatId: string) => {})
  stop = vi.fn(async () => { this.context = undefined })
  async start(context: ChannelContext) { this.context = context; return { botName: 'test_bot' } }
  async send(chatId: string, text: string) { this.sent.push({ chatId, text }) }
  emit(text: string, overrides: Partial<InboundMessage> = {}) {
    this.context?.onMessage({ channel: this.kind, chatId: 'chat:123', userId: 'allowed', userName: 'Ada', text, direct: true, addressed: false, ...overrides })
  }
}

let h: Harness
let hub: ChannelHub
let adapter: MemoryAdapter
let cleanup: (() => Promise<void>) | undefined
beforeEach(async () => {
  cleanup = undefined
  h = await createHarness()
  cleanup = h.close
  adapter = new MemoryAdapter()
  hub = new ChannelHub(h.svc, async (kind, token) => {
    expect(kind).toBe('telegram')
    expect(token).toBe('test-token')
    return adapter
  }, name => name === 'telegram-token' ? 'test-token' : null)
  await hub.configure({ kind: 'telegram', enabled: true, tokenSecret: 'telegram-token', allowUsers: ['allowed'] })
})
afterEach(async () => {
  try { await hub?.shutdown() } finally { await cleanup?.() }
})

describe('channel hub through fake claude', () => {
  it('silently ignores non-allow-listed users, including commands', async () => {
    const a = h.ant()
    adapter.emit('say:Ignore me', { userId: 'stranger' })
    adapter.emit('/ants', { userId: 'stranger' })
    adapter.emit('/use A', { userId: 'stranger' })
    await Promise.resolve()
    expect(h.messages(a.threadId)).toEqual([])
    expect(h.runs()).toEqual([])
    expect(adapter.sent).toEqual([])
    expect(adapter.typing).not.toHaveBeenCalled()
    expect(hub.bindings()).toEqual([])
  })

  it('ignores unaddressed group messages but routes addressed group messages', async () => {
    const a = h.ant()
    adapter.emit('say:Ambient chatter', { direct: false })
    adapter.emit('/ants', { direct: false })
    expect(h.messages(a.threadId)).toEqual([])
    expect(adapter.sent).toEqual([])
    adapter.emit('say:Addressed', { direct: false, addressed: true })
    await h.finished(a.id)
    await waitFor(() => adapter.sent[0], 'group reply')
    expect(adapter.sent).toEqual([{ chatId: 'chat:123', text: 'Addressed\n\n(sent from telegram)' }])
  })

  it('routes a DM to the pinned default ant and returns its answer to the same chat', async () => {
    const a = h.ant('Default')
    const b = h.ant('Other')
    R.updateThread(h.db, a.threadId, { pinned: true })
    adapter.emit('say:Hello from the ant')
    await h.finished(a.id)
    await waitFor(() => adapter.sent[0], 'DM reply')
    expect(h.runs(b.id)).toEqual([])
    expect(h.messages(a.threadId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ author: 'user', text: 'say:Hello from the ant\n\n(sent from telegram)' }),
      expect.objectContaining({ author: a.id, text: 'Hello from the ant\n\n(sent from telegram)' }),
    ]))
    expect(adapter.sent).toEqual([{ chatId: 'chat:123', text: 'Hello from the ant\n\n(sent from telegram)' }])
    expect(adapter.typing).toHaveBeenCalledExactlyOnceWith('chat:123')
    expect(hub.statuses()).toEqual([expect.objectContaining({ connected: true, botName: 'test_bot', error: null })])
  })

  it('binds /use case-insensitively by chat and persists the target', async () => {
    const a = h.ant('Default')
    const b = h.ant('Other Ant')
    R.updateThread(h.db, a.threadId, { pinned: true })
    adapter.emit('/use other ant')
    expect(hub.bindings()).toEqual([{ channel: 'telegram', chatId: 'chat:123', target: { kind: 'ant', id: b.id } }])
    expect(adapter.sent[0]).toEqual({ chatId: 'chat:123', text: 'Now talking to Other Ant.' })
    adapter.emit('say:Bound answer')
    await h.finished(b.id)
    await waitFor(() => adapter.sent.find(m => m.text === 'Bound answer\n\n(sent from telegram)'), 'bound reply')
    adapter.emit('say:Default answer', { chatId: 'other-chat' })
    await h.finished(a.id)
    await waitFor(() => adapter.sent.find(m => m.chatId === 'other-chat'), 'other chat reply')
    expect(adapter.sent).toContainEqual({ chatId: 'other-chat', text: 'Default answer\n\n(sent from telegram)' })
    adapter.emit('/use Missing')
    expect(adapter.sent.at(-1)?.text).toBe('No ant or colony called Missing. Try /ants.')
    expect(hub.bindings()[0].target.id).toBe(b.id)
  })

  it('lists ants, colonies and the current target with /ants', () => {
    const a = h.ant('A')
    const b = h.ant('B')
    h.svc.createColony('Crew', [a.id, b.id])
    adapter.emit('/use Crew')
    adapter.emit('/ants')
    expect(adapter.sent.at(-1)).toEqual({ chatId: 'chat:123', text: '• A\n• B\n• Crew (colony)\n\nTalking to: Crew' })
    expect(h.runs()).toEqual([])
  })

  it('interrupts the selected thread with /stop and sends confirmation', async () => {
    const a = h.ant()
    adapter.emit('say:Ready')
    await h.finished(a.id)
    // The fake runner's slow command is exact; start it through the service so
    // the channel provenance suffix does not turn it into a plain-text scenario.
    const eventCount = h.events.length
    h.svc.sendFromUser(a.threadId, 'slow:2000')
    await waitFor(() => h.events.slice(eventCount).some(e => e.type === 'message.delta' && e.threadId === a.threadId), 'slow turn')
    adapter.emit('/stop')
    expect(adapter.sent).toContainEqual({ chatId: 'chat:123', text: 'Stopped.' })
    const runs = await h.finished(a.id, 2)
    expect(runs[1].status).toBe('stopped')
    expect(h.messages(a.threadId).some(m => m.text === 'Stopped. Completed actions were not undone.')).toBe(true)
  })

  it('notifies the watching chat about a real broker approval card', async () => {
    const a = h.ant()
    adapter.emit('say:Ready')
    await h.finished(a.id)
    const decision = h.broker.requestApproval(a.id, { action: 'Publish report', detail: 'Please review' })
    const approval = await waitFor(() => R.listApprovals(h.db, { status: 'pending' })[0], 'approval card')
    await waitFor(() => adapter.sent.find(m => m.text.includes('needs your approval')), 'chat approval notification')
    expect(h.messages(a.threadId).some(m => m.kind === 'approval')).toBe(true)
    expect(adapter.sent).toContainEqual({ chatId: 'chat:123', text: 'A needs your approval: Publish report\nOpen Ant to decide.' })
    h.broker.decide(approval.id, 'deny')
    await decision
  })

  it('prefixes colony replies with the responding ant name, including member mentions', async () => {
    const a = h.ant('A')
    const b = h.ant('B')
    const colony = h.svc.createColony('Crew', [a.id, b.id])
    adapter.emit('/use Crew')
    expect(hub.bindings()[0].target).toEqual({ kind: 'colony', id: colony.id })
    adapter.emit('say:Lead answer')
    await h.finished(a.id)
    await waitFor(() => adapter.sent.find(m => m.text.startsWith('A: ')), 'lead colony reply')
    adapter.emit('@B say:Member answer')
    await h.finished(b.id)
    await waitFor(() => adapter.sent.find(m => m.text.startsWith('B: ')), 'member colony reply')
    expect(adapter.sent).toEqual([
      { chatId: 'chat:123', text: 'Now talking to Crew.' },
      { chatId: 'chat:123', text: 'A: Lead answer\n\n(sent from telegram)' },
      { chatId: 'chat:123', text: 'B: Member answer\n\n(sent from telegram)' },
    ])
    expect(h.runs().map(r => r.threadId)).toEqual([R.getThreadByRef(h.db, 'colony', colony.id)!.id, R.getThreadByRef(h.db, 'colony', colony.id)!.id])
  })

  it('disconnects the adapter on shutdown', async () => {
    await hub.shutdown()
    expect(adapter.stop).toHaveBeenCalledOnce()
    expect(adapter.context).toBeUndefined()
    await hub.shutdown()
    expect(adapter.stop).toHaveBeenCalledOnce()
  })
})
