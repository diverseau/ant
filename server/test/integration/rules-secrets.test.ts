import type { Health } from '@ant/shared'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startHttp } from '../../src/api/http.ts'
import { ChannelHub } from '../../src/channels/hub.ts'
import { Registry } from '../../src/connectors/registry.ts'
import * as R from '../../src/db/repos/index.ts'
import { Vault } from '../../src/secrets/vault.ts'
import { createHarness, toolCommand, waitFor, type Harness } from './helpers.ts'

let h: Harness
let server: ReturnType<typeof startHttp>
let base: string
const health: Health = { claude: { found: true, loggedIn: true }, sandbox: { ok: true, missing: [] }, computer: { chromium: false }, antHome: '/tmp', version: 'test' }

beforeEach(async () => {
  h = await createHarness()
  h.svc.registry = new Registry(h.db, new Vault(h.cfg.dataDir))
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

const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const events = (runId: string) => R.listToolEvents(h.db, runId)

describe('rules written in the app', () => {
  it('blocks or asks for tools Claude Code would allow, and writes instructions into CLAUDE.md', async () => {
    const a = h.ant()
    // Full access: Claude Code asks nothing, so only Ant's hook can stop these.
    h.svc.updateAnt(a.id, { permissionMode: 'full' })
    expect((await post('/rules', { antId: a.id, pattern: 'Write|Edit', behaviour: 'deny', inputContains: 'secret-plans', label: 'Edit files “secret-plans”' })).status).toBe(201)
    expect((await post('/rules', { antId: null, pattern: 'mcp__*mail*__*send*', behaviour: 'ask', label: 'Send email' })).status).toBe(201)
    expect((await post('/rules', { antId: a.id, pattern: 'rm -rf /', behaviour: 'ask', label: 'x' })).status).toBe(400)

    h.svc.sendFromUser(a.threadId, toolCommand('Write', { file_path: `${a.paths.folder}/workspace/secret-plans.md`, content: 'x' }))
    await h.finished(a.id)
    expect(events(h.runs(a.id)[0]!.id)[0]).toMatchObject({ name: 'Write', status: 'denied' })

    h.svc.sendFromUser(a.threadId, toolCommand('Write', { file_path: `${a.paths.folder}/workspace/notes.md`, content: 'x' }))
    await h.finished(a.id, 2)
    expect(events(h.runs(a.id)[1]!.id)[0]).toMatchObject({ name: 'Write', status: 'ok' })

    h.svc.sendFromUser(a.threadId, toolCommand('mcp__claude_ai_Gmail__send_message', { to: 'x@example.invalid' }))
    const card = await waitFor(() => R.listApprovals(h.db, { status: 'pending' })[0], 'ask card')
    expect(card.toolName).toBe('mcp__claude_ai_Gmail__send_message')
    h.broker.decide(card.id, 'deny')
    await h.finished(a.id, 3)

    const rules = await (await fetch(`${base}/ants/${a.id}/rules`)).json()
    expect(rules.map((r: { label: string; written: boolean; scope: string }) => [r.label, r.written, r.scope])).toEqual([['Edit files “secret-plans”', true, 'ant'], ['Send email', true, 'global']])

    await fetch(`${base}/ants/${a.id}/guidance`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ant: ['Reply in British English'], all: ['Never email anyone outside acme.com'] }) })
    h.svc.sendFromUser(a.threadId, 'say:ok')
    await h.finished(a.id, 4)
    const md = readFileSync(a.paths.claudeMd, 'utf8')
    expect(md).toContain("rules\nThese come from")
    expect(md.indexOf('Never email anyone outside acme.com')).toBeLessThan(md.indexOf('Reply in British English'))
  })
})

describe('secure secret card', () => {
  it('stores the value encrypted, scopes it to the ant and restarts it with the env var', async () => {
    const a = h.ant()
    h.svc.sendFromUser(a.threadId, toolCommand('mcp__ant__request_secret', { name: 'GITHUB_TOKEN', description: 'GitHub token', why: 'To read your private repo' }))
    await h.finished(a.id)
    const card = h.messages(a.threadId).find((m) => m.kind === 'secret')!
    expect(card.payload).toMatchObject({ name: 'GITHUB_TOKEN', why: 'To read your private repo' })

    expect((await post(`/messages/${card.id}/secret`, { value: 'ghp_supersecret' })).status).toBe(204)
    expect((await post(`/messages/${card.id}/secret`, { value: 'again' })).status).toBe(409)
    await h.finished(a.id, 2)

    const row = R.getSecretByName(h.db, 'GITHUB_TOKEN')!
    expect(Buffer.from(row.ciphertext).toString('utf8')).not.toContain('ghp_supersecret')
    expect(h.svc.registry!.forAnt(a.id).env).toMatchObject({ GITHUB_TOKEN: 'ghp_supersecret' })
    // The secret never appears in the conversation, and the follow-up turn says where it is.
    expect(JSON.stringify(h.messages(a.threadId))).not.toContain('ghp_supersecret')
    expect(h.messages(a.threadId).some((m) => m.kind === 'text' && m.text?.includes('in your environment as $GITHUB_TOKEN'))).toBe(true)
    expect(R.listMessages(h.db, a.threadId, { limit: 50 }).find((m) => m.id === card.id)!.payload).toMatchObject({ state: 'saved' })
    // The second turn ran in a fresh process (new env).
    expect(h.trace(a.id).filter((e) => e.kind === 'spawn')).toHaveLength(2)
  })
})
