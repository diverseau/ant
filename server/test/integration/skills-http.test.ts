import type { Health } from '@ant/shared'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startHttp } from '../../src/api/http.ts'
import { ChannelHub } from '../../src/channels/hub.ts'
import { createHarness, waitFor, type Harness } from './helpers.ts'

let h: Harness
let server: ReturnType<typeof startHttp>
let base: string
const health: Health = { claude: { found: true, loggedIn: true }, sandbox: { ok: true, missing: [] }, computer: { chromium: false }, antHome: '/tmp', version: 'test' }

beforeEach(async () => {
  h = await createHarness()
  server = startHttp(h.svc, h.broker, h.scheduler, new ChannelHub(h.svc, async () => { throw new Error('none') }, () => null), () => health)
  const port = await waitFor(() => {
    const a = server.address()
    return a && typeof a !== 'string' ? a.port : undefined
  }, 'HTTP listener')
  base = `http://127.0.0.1:${port}/api`
})
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()))
  await h.close()
})

const call = (method: string, path: string, body?: unknown) =>
  fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })

describe('skill manager', () => {
  it('writes, reads, shares with the colony and deletes skills', async () => {
    const a = h.ant('A')
    const b = h.ant('B')
    const skill = { description: 'Writes the weekly report. Use when asked for the weekly report.', body: '## Steps\n1. Gather updates\n2. Draft the report\n', scope: 'ant' }
    expect((await call('PUT', `/ants/${a.id}/skills/weekly-report`, skill)).status).toBe(200)
    expect((await call('PUT', `/ants/${a.id}/skills/Bad Name`, skill)).status).toBe(400)

    const read = await (await call('GET', `/ants/${a.id}/skills/weekly-report?scope=ant`)).json()
    expect(read).toMatchObject({ name: 'weekly-report', description: skill.description, scope: 'ant' })
    expect(read.body).toContain('Gather updates')
    expect(await (await call('GET', `/ants/${b.id}/skills`)).json()).toEqual([])

    expect((await call('POST', `/ants/${a.id}/skills/weekly-report/share`)).status).toBe(204)
    expect(await (await call('GET', `/ants/${b.id}/skills`)).json()).toEqual([{ name: 'weekly-report', description: skill.description, scope: 'colony' }])
    expect(existsSync(join(b.paths.folder, '.claude/skills/weekly-report/SKILL.md'))).toBe(true)
    expect((await call('POST', `/ants/${a.id}/skills/weekly-report/share`)).status).toBe(400)

    expect((await call('DELETE', `/ants/${a.id}/skills/weekly-report?scope=colony`)).status).toBe(204)
    h.svc.skills.sync(b.paths.folder)
    expect(existsSync(join(b.paths.folder, '.claude/skills/weekly-report'))).toBe(false)
  })
})
