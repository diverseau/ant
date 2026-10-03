import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PushHub, type PushPayload } from '../../src/push/push.ts'
import { createHarness, toolCommand, waitFor, type Harness } from './helpers.ts'

let h: Harness
let sent: PushPayload[]
beforeEach(async () => {
  h = await createHarness()
  sent = []
  const hub = new PushHub(h.db, () => 'mailto:ant@localhost')
  hub.subscribe(null, { endpoint: 'https://push.example/abc', keys: { p256dh: 'x', auth: 'y' } })
  hub.sender = async (_s, body) => void sent.push(JSON.parse(body))
  h.svc.push = hub
})
afterEach(async () => {
  await h.close()
})

describe('phone alerts', () => {
  it('pushes replies only when no Ant window is visible', async () => {
    h.svc.bus.on('turn.finished', (e: { antId: string; turn: { threadId: string }; text: string }) => h.svc.alert({ title: 'A', body: e.text, url: `/?thread=${e.turn.threadId}` }))
    const a = h.ant()
    h.svc.visibleClients = 1
    h.svc.sendFromUser(a.threadId, 'say:seen on screen')
    await h.finished(a.id)
    h.svc.visibleClients = 0
    h.svc.sendFromUser(a.threadId, 'say:nobody looking')
    await h.finished(a.id, 2)
    await waitFor(() => sent.length === 1 || undefined, 'push')
    expect(sent).toEqual([{ title: 'A', body: 'nobody looking', url: `/?thread=${a.threadId}` }])
  })

  it('always pushes an approval for an unattended run', async () => {
    const a = h.ant()
    h.svc.visibleClients = 1
    h.svc.enqueue(a.id, { threadId: a.threadId, text: toolCommand('Write', { file_path: '/etc/x', content: 'x' }), source: 'routine', depth: 0, enqueuedAt: Date.now() })
    await waitFor(() => sent.find((p) => p.body.startsWith('Needs your approval')), 'approval push')
    expect(sent[0]).toMatchObject({ title: 'A', url: `/?thread=${a.threadId}` })
  })
})
