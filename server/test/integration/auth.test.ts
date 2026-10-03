import type { Health } from '@ant/shared'
import { request } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startHttp } from '../../src/api/http.ts'
import { ChannelHub } from '../../src/channels/hub.ts'
import * as R from '../../src/db/repos/index.ts'
import { createHarness, waitFor, type Harness } from './helpers.ts'

let h: Harness
let server: ReturnType<typeof startHttp> | undefined
let base: string
const health: Health = { claude: { found: true, loggedIn: true }, sandbox: { ok: true, missing: [] }, computer: { chromium: false }, antHome: '/tmp', version: 'test' }
const REMOTE = { 'x-forwarded-for': '100.64.0.7' }

beforeEach(async () => {
  h = await createHarness()
  const channels = new ChannelHub(h.svc, async () => { throw new Error('none') }, () => null)
  server = startHttp(h.svc, h.broker, h.scheduler, channels, () => health)
  const port = await waitFor(() => {
    const a = server!.address()
    return a && typeof a !== 'string' ? a.port : undefined
  }, 'HTTP listener')
  base = `http://127.0.0.1:${port}`
})

afterEach(async () => {
  delete process.env.ANT_REQUIRE_LOGIN
  if (server) await new Promise<void>((r) => server!.close(() => r()))
  await h.close()
})

const get = (path: string, headers: Record<string, string> = {}) => fetch(base + path, { headers })
// fetch() won't send a custom Host header; node:http will.
const status = (path: string, headers: Record<string, string>) =>
  new Promise<number>((resolve, reject) => {
    const req = request(base + path, { headers }, (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('error', reject)
    req.end()
  })
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

describe('device pairing', () => {
  it('trusts this computer, and makes remote clients pair with a one-time code', async () => {
    expect((await get('/api/bootstrap')).status).toBe(200)
    const denied = await get('/api/bootstrap', REMOTE)
    expect(denied.status).toBe(401)
    expect(await denied.json()).toMatchObject({ code: 'auth' })
    // Static app and the status/pair endpoints stay reachable so a phone can show the pairing screen.
    expect((await get('/api/auth/status', REMOTE)).status).toBe(200)
    expect((await post('/api/auth/pairing-code', {}, REMOTE)).status).toBe(401)

    const { code } = await (await post('/api/auth/pairing-code', {})).json()
    const paired = await post('/api/auth/pair', { code: code.toLowerCase(), name: 'Phone' }, REMOTE)
    expect(paired.status).toBe(200)
    const cookie = paired.headers.get('set-cookie')!.split(';')[0]
    expect(paired.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    expect(paired.headers.get('set-cookie')).toMatch(/SameSite=Strict/i)

    expect((await get('/api/bootstrap', { ...REMOTE, cookie })).status).toBe(200)
    expect((await post('/api/auth/pair', { code }, REMOTE)).status).toBe(400)
    expect((await get('/api/bootstrap', { ...REMOTE, cookie: cookie.replace(/.$/, 'x') })).status).toBe(401)

    const [device] = R.listDevices(h.db)
    expect(device).toMatchObject({ name: 'Phone' })
    expect(device!.tokenHash).not.toContain(cookie.split('.')[1]!)
    expect((await fetch(`${base}/api/auth/devices/${device!.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await get('/api/bootstrap', { ...REMOTE, cookie })).status).toBe(401)
  })

  it('rate limits wrong codes and honours ANT_REQUIRE_LOGIN', async () => {
    const codes = []
    for (let i = 0; i < 11; i++) codes.push((await post('/api/auth/pair', { code: 'ZZZZ-ZZZZ' }, REMOTE)).status)
    expect(codes.slice(0, 10).every((s) => s === 400)).toBe(true)
    expect(codes[10]).toBe(429)
    process.env.ANT_REQUIRE_LOGIN = '1'
    expect((await get('/api/bootstrap')).status).toBe(401)
  })

  it('rejects unknown hosts and origins, and accepts hosts added for remote access', async () => {
    expect(await status('/api/auth/status', { host: 'evil.example' })).toBe(403)
    expect(await status('/api/bootstrap', { origin: 'https://evil.example' })).toBe(403)
    R.setSetting(h.db, 'remote.hosts', ['ant.tailnet.ts.net'])
    expect(await status('/api/auth/status', { host: 'ant.tailnet.ts.net' })).toBe(200)
    // Remote host names never count as this computer.
    expect(await status('/api/bootstrap', { host: 'ant.tailnet.ts.net' })).toBe(401)
    expect(await status('/api/auth/status', { host: 'ant.tailnet.ts.net', origin: 'https://ant.tailnet.ts.net:8443' })).toBe(200)
    expect(await status('/api/auth/status', { host: 'ant.tailnet.ts.net', origin: 'https://ant.tailnet.ts.net.evil.example' })).toBe(403)
  })
})
