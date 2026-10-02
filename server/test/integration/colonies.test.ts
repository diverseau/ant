import type { Colony, Health } from '@ant/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startHttp } from '../../src/api/http.ts'
import { ChannelHub } from '../../src/channels/hub.ts'
import * as R from '../../src/db/repos/index.ts'
import { HttpError } from '../../src/service.ts'
import { createHarness, waitFor, type Harness } from './helpers.ts'

let h: Harness
let server: ReturnType<typeof startHttp> | undefined
let base: string
const health: Health = { claude: { found: true, loggedIn: true }, sandbox: { ok: true, missing: [] }, computer: { chromium: false }, antHome: '/tmp', version: 'test' }

beforeEach(async () => {
  server = undefined
  h = await createHarness()
})

afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close((err) => err ? reject(err) : resolve()))
  await h?.close()
})

async function http() {
  const channels = new ChannelHub(h.svc, async () => { throw new Error('No channel adapters in this test') }, () => null)
  server = startHttp(h.svc, h.broker, h.scheduler, channels, () => health)
  const port = await waitFor(() => {
    const address = server!.address()
    return address && typeof address !== 'string' ? address.port : undefined
  }, 'HTTP listener')
  base = `http://127.0.0.1:${port}`
}

function request(method: string, path: string, body?: unknown) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('colonies', () => {
  it('creates, edits and deletes a colony over HTTP while preserving its ants', async () => {
    const a = h.ant('Atlas')
    const b = h.ant('Basil')
    const c = h.ant('Clover')
    await http()
    const created = await request('POST', '/colonies', { name: 'Crew', memberIds: [a.id, b.id] })
    expect(created.status).toBe(201)
    const colony = await created.json() as Colony
    expect(colony).toMatchObject({ name: 'Crew', memberIds: [a.id, b.id], leadAntId: a.id })
    const thread = R.getThreadByRef(h.db, 'colony', colony.id)!
    expect(h.events).toContainEqual({ type: 'colony.updated', colony })

    const edited = await request('PATCH', `/colonies/${colony.id}`, { name: '  Planning crew  ', memberIds: [b.id, c.id], leadAntId: c.id })
    expect(edited.status).toBe(200)
    expect(await edited.json()).toEqual({ ...colony, name: 'Planning crew', memberIds: [b.id, c.id], leadAntId: c.id })
    expect(h.messages(thread.id).map((m) => m.text)).toEqual(['Atlas, Basil formed Crew', 'Members updated: Basil, Clover'])
    const snapshot = await request('GET', '/bootstrap')
    expect((await snapshot.json()).colonies).toContainEqual({ ...colony, name: 'Planning crew', memberIds: [b.id, c.id], leadAntId: c.id })

    expect((await request('DELETE', `/colonies/${colony.id}`)).status).toBe(204)
    expect(R.getColony(h.db, colony.id)).toBeNull()
    expect(R.getThread(h.db, thread.id)).toBeNull()
    expect(h.messages(thread.id)).toEqual([])
    expect(h.events).toContainEqual({ type: 'thread.deleted', threadId: thread.id })
    expect(R.listAnts(h.db).map((a) => a.id)).toEqual(expect.arrayContaining([a.id, b.id, c.id]))
    expect(R.getThread(h.db, a.threadId)).not.toBeNull()
    expect((await request('DELETE', `/colonies/${colony.id}`)).status).toBe(404)
    expect((await request('PATCH', `/colonies/${colony.id}`, { name: 'Missing' })).status).toBe(404)
  })

  it('preserves the lead on edits and replaces it when removed', () => {
    const [a, b, c] = ['A', 'B', 'C'].map((name) => h.ant(name))
    const colony = h.svc.createColony('Crew', [a.id, b.id, c.id])
    const thread = R.getThreadByRef(h.db, 'colony', colony.id)!
    expect(h.svc.updateColony(colony.id, { leadAntId: b.id }).leadAntId).toBe(b.id)
    expect(h.svc.updateColony(colony.id, { name: 'Renamed' }).leadAntId).toBe(b.id)
    expect(h.svc.updateColony(colony.id, { memberIds: [c.id, b.id] }).leadAntId).toBe(b.id)
    expect(h.svc.updateColony(colony.id, { memberIds: [c.id, a.id] }).leadAntId).toBe(c.id)
    expect(h.messages(thread.id).filter((m) => m.text.startsWith('Members updated:'))).toHaveLength(2)
  })

  it('accepts two to six distinct members and deduplicates like createColony', () => {
    const ants = Array.from({ length: 6 }, (_, i) => h.ant(`Ant ${i}`))
    const ids = ants.map((a) => a.id)
    const colony = h.svc.createColony('Crew', ids.slice(0, 2))
    expect(h.svc.updateColony(colony.id, { memberIds: ids }).memberIds).toEqual(ids)
    expect(h.svc.updateColony(colony.id, { memberIds: [ids[0], ids[0], ids[1]] }).memberIds).toEqual(ids.slice(0, 2))
  })

  it('rejects invalid edits without partial writes, events or system messages', async () => {
    const ants = Array.from({ length: 8 }, (_, i) => h.ant(`Ant ${i}`))
    const ids = ants.map((a) => a.id)
    const colony = h.svc.createColony('Crew', ids.slice(0, 2))
    R.archiveAnt(h.db, ids[7])
    const before = R.getColony(h.db, colony.id)
    const thread = R.getThreadByRef(h.db, 'colony', colony.id)!
    const messages = h.messages(thread.id)
    const count = h.events.length
    await http()
    for (const patch of [
      { memberIds: [] }, { memberIds: [ids[0]] }, { memberIds: [ids[0], ids[0]] },
      { memberIds: ids.slice(0, 7) }, { memberIds: [ids[0], 'missing'] }, { memberIds: [ids[0], ids[7]] },
      { leadAntId: ids[2] }, { leadAntId: null },
      { name: 'Changed', memberIds: [ids[1], ids[2]], leadAntId: ids[0] },
      { name: '' }, { name: '   ' }, { name: 'x'.repeat(61) }, { memberIds: 'invalid' },
    ]) {
      expect((await request('PATCH', `/colonies/${colony.id}`, patch)).status).toBe(400)
      expect(R.getColony(h.db, colony.id)).toEqual(before)
      expect(h.messages(thread.id)).toEqual(messages)
      expect(h.events).toHaveLength(count)
    }
    expect(() => h.svc.updateColony('missing', {})).toThrow(HttpError)
    expect(() => h.svc.deleteColony('missing')).toThrow(HttpError)
  })

  it('routes unmentioned messages to the edited lead', async () => {
    const a = h.ant('A')
    const b = h.ant('B')
    const colony = h.svc.createColony('Crew', [a.id, b.id])
    const thread = R.getThreadByRef(h.db, 'colony', colony.id)!
    h.svc.updateColony(colony.id, { leadAntId: b.id })
    h.svc.sendFromUser(thread.id, 'say:Lead replied')
    await h.finished(b.id)
    expect(h.runs(a.id)).toEqual([])
    expect(h.messages(thread.id).filter((m) => m.kind === 'text' && m.author === b.id).map((m) => m.text)).toEqual(['Lead replied'])
  })

  it('stops active work and discards queued turns before deleting the chat', async () => {
    const a = h.ant('A')
    const b = h.ant('B')
    const colony = h.svc.createColony('Crew', [a.id, b.id])
    const thread = R.getThreadByRef(h.db, 'colony', colony.id)!
    h.svc.sendFromUser(thread.id, 'slow:2000')
    await waitFor(() => h.events.some((e) => e.type === 'message.delta' && e.threadId === thread.id), 'first slow delta')
    const proc = h.svc.liveProcess(a.id)!.proc
    h.svc.sendFromUser(thread.id, 'say:Should never run')
    h.svc.deleteColony(colony.id)
    await waitFor(() => proc.state === 'exited', 'deleted colony process exit')
    expect(h.svc.currentTurn(a.id)).toBeNull()
    expect(h.runs(a.id).map((r) => r.status)).toEqual(['stopped'])
    expect(R.getThread(h.db, thread.id)).toBeNull()
    h.svc.sendFromUser(a.threadId, 'say:Still here')
    await h.finished(a.id, 2)
    expect(h.runs(a.id).map((r) => r.status)).toEqual(['stopped', 'succeeded'])
  })
})
