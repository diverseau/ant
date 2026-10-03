import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as R from '../../src/db/repos/index.ts'
import { PushHub, type PushPayload } from '../../src/push/push.ts'
import { exportAnt, importAnt } from '../../src/templates.ts'
import { createHarness, type Harness } from './helpers.ts'

let h: Harness
beforeEach(async () => {
  h = await createHarness()
})
afterEach(async () => {
  await h.close()
})

describe('ant templates', () => {
  it('round-trips profile, skills, routines, rules and instructions, never history', async () => {
    const a = h.ant('Scout')
    h.svc.updateAnt(a.id, { label: 'Researcher', effort: 'high', permissionMode: 'supervised' })
    h.svc.skills.save(a.paths.folder, { name: 'digest', description: 'Writes the digest. Use when asked.', body: '## Steps\n1. Read\n' }, 'ant')
    h.scheduler.create({ antId: a.id, name: 'Morning', instruction: 'Brief me', when: 'every weekday at 9am' })
    h.scheduler.create({ antId: a.id, name: 'Hook', instruction: 'x', when: '', trigger: 'webhook' })
    h.scheduler.create({ antId: a.id, name: 'Watch', instruction: 'y', when: '', trigger: 'watch', event: { source: 'watch', url: 'https://example.com', everyMinutes: 30 } })
    R.addRule(h.db, { scope: 'ant', antId: a.id, pattern: 'Bash', behaviour: 'ask', source: 'user', label: 'Run git push', note: 'input:git push' })
    R.setSetting(h.db, `guidance.${a.id}`, ['Be brief'])
    h.svc.sendFromUser(a.threadId, 'say:secret history')
    await h.finished(a.id)

    const t = exportAnt(h.svc, h.scheduler, a.id)
    expect(JSON.stringify(t)).not.toContain('secret history')
    expect(t.routines.map((r) => r.name)).toEqual(['Morning', 'Watch'])
    const { antId, skipped } = importAnt(h.svc, h.scheduler, t)
    expect(skipped).toEqual([])
    const copy = R.getAnt(h.db, antId)!
    expect(copy).toMatchObject({ name: 'Scout 2', label: 'Researcher', effort: 'high', permissionMode: 'supervised' })
    expect(h.svc.skills.list(h.svc.pathsFor(antId).folder).map((s) => s.name)).toEqual(['digest'])
    expect(h.scheduler.list(antId).map((r) => [r.name, r.trigger, r.when])).toEqual([
      ['Morning', 'schedule', h.scheduler.list(a.id)[0]!.when],
      ['Watch', 'watch', h.scheduler.list(a.id)[2]!.when],
    ])
    expect(R.listRules(h.db, { antId }).filter((r) => r.antId === antId)).toMatchObject([{ pattern: 'Bash', behaviour: 'ask', label: 'Run git push', note: 'input:git push' }])
    expect(R.getSetting(h.db, `guidance.${antId}`, [])).toEqual(['Be brief'])
    expect(R.listMessages(h.db, h.svc.antThread(antId).id, { limit: 10 }).filter((m) => m.kind === 'text')).toEqual([])
    expect(() => importAnt(h.svc, h.scheduler, { format: 'nope' } as never)).toThrow('Not an Ant template')
  })

  it('mutes replies but not approvals', () => {
    const a = h.ant()
    const sent: PushPayload[] = []
    const hub = new PushHub(h.db, () => 'mailto:x@localhost')
    hub.subscribe(null, { endpoint: 'https://push.example/1', keys: { p256dh: 'x', auth: 'y' } })
    hub.sender = async (_s, b) => void sent.push(JSON.parse(b))
    h.svc.push = hub
    h.svc.updateAnt(a.id, { muted: true })
    h.svc.alert({ title: 'A', body: 'reply' }, false, a.id)
    h.svc.alert({ title: 'A', body: 'approval' }, true)
    return new Promise((r) => setTimeout(r, 50)).then(() => expect(sent.map((p) => p.body)).toEqual(['approval']))
  })
})
