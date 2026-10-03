import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activity } from '../../src/activity.ts'
import * as R from '../../src/db/repos/index.ts'
import { createHarness, toolCommand, waitFor, type Harness } from './helpers.ts'

let h: Harness
beforeEach(async () => {
  h = await createHarness()
})
afterEach(async () => {
  await h.close()
})

describe('activity view', () => {
  it('lists what is waiting on the user and recent runs with their routine and reply', async () => {
    const a = h.ant()
    const { routine } = h.scheduler.create({ antId: a.id, name: 'Digest', instruction: 'say:**Bold** digest ready', when: 'every day at 9am' })
    h.scheduler.fire(R.getRoutine(h.db, routine.id)!, { trigger: 'test' })
    await h.finished(a.id)
    h.svc.sendFromUser(a.threadId, toolCommand('Write', { file_path: '/etc/outside.txt', content: 'x' }))
    await waitFor(() => R.listApprovals(h.db, { status: 'pending' })[0], 'approval')
    const v = activity(h.svc)
    expect(v.waiting).toHaveLength(1)
    expect(v.waiting[0]).toMatchObject({ antId: a.id, threadId: a.threadId, behaviour: 'ask' })
    expect(v.working.map((w) => w.antId)).toEqual([a.id])
    expect(v.recent[0]).toMatchObject({ antId: a.id, trigger: 'routine', status: 'succeeded', routine: 'Digest' })
    expect(v.recent[0]!.summary).not.toContain('**')
  })
})
