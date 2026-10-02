import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as R from '../../src/db/repos/index.ts'
import { HttpError } from '../../src/service.ts'
import { createHarness, waitFor, type Harness } from './helpers.ts'

let h: Harness

beforeEach(async () => {
  h = await createHarness()
})

afterEach(async () => {
  await h.close()
})

describe('routines', () => {
  it('parses schedules and computes the next run', () => {
    const a = h.ant('Sched')
    const { routine } = h.scheduler.create({ antId: a.id, name: 'Brief', instruction: 'say:brief', when: 'every weekday at 9am', tz: 'Australia/Sydney' })
    expect(routine.when).toBe('Weekdays at 9:00 AM · Australia/Sydney')
    expect(routine.nextRunAt).toBeGreaterThan(Date.now())
    expect(() => h.scheduler.create({ antId: a.id, name: 'Too fast', instruction: 'x', when: 'every 1m' })).toThrow(HttpError)
  })

  it('a test run starts an unattended turn and records the result', async () => {
    const a = h.ant('Runner')
    const { routine } = h.scheduler.create({ antId: a.id, name: 'Digest', instruction: 'say:digest done', when: 'every 2 hours' })
    h.scheduler.fire(h.scheduler.get(routine.id), { trigger: 'test' })
    const run = await waitFor(() => R.listRoutineRuns(h.db, routine.id, 1).find((r) => r.status !== 'running'), 'routine run to finish', 8000)
    expect(run.status).toBe('succeeded')
    expect(run.output).toContain('digest done')
    const card = h.messages(a.threadId).find((m) => m.kind === 'routine')
    expect(card?.payload).toMatchObject({ name: 'Digest', result: 'succeeded' })
    const stdin = h.trace(a.id).filter((t) => t.kind === 'stdin').map((t) => JSON.stringify(t.message))
    expect(stdin.some((s) => s.includes('[Routine: Digest]'))).toBe(true)
  })

  it('webhooks verify the key', () => {
    const a = h.ant('Hook')
    const { routine, key } = h.scheduler.create({ antId: a.id, name: 'Inbound', instruction: 'say:hook', when: '', trigger: 'webhook' })
    expect(key).toMatch(/^ant_/)
    expect(routine.webhookUrl).toContain(`/hooks/${routine.id}`)
    expect(() => h.scheduler.verifyWebhook(routine.id, 'Bearer wrong')).toThrow(HttpError)
    expect(h.scheduler.verifyWebhook(routine.id, `Bearer ${key}`).id).toBe(routine.id)
  })
})
