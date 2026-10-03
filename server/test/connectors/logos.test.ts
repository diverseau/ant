import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { logoDomain } from '@ant/shared'
import { LogoCache } from '../../src/connectors/logos.ts'

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
let server: Server
let base = ''
const hits: string[] = []
const dir = mkdtempSync(join(tmpdir(), 'ant-logos-'))

beforeAll(async () => {
  server = createServer((req, res) => {
    const d = new URL(req.url!, 'http://x').searchParams.get('d')!
    hits.push(d)
    if (d === 'known.com') res.writeHead(200, { 'content-type': 'image/png' }).end(PNG)
    else res.writeHead(404, { 'content-type': 'image/png' }).end(PNG)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterAll(() => {
  server.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('logo cache', () => {
  it('fetches once, caches hits and misses, and rejects bad domains', async () => {
    const cache = new LogoCache(dir, (d) => `${base}/?d=${d}`)
    expect(await cache.get('known.com')).toEqual(PNG)
    expect(await cache.get('KNOWN.com')).toEqual(PNG)
    expect(await cache.get('unknown.com')).toBeNull()
    expect(await cache.get('unknown.com')).toBeNull()
    expect(await cache.get('../etc/passwd')).toBeNull()
    expect(await cache.get('localhost')).toBeNull()
    expect(hits).toEqual(['known.com', 'unknown.com'])
  })
})

describe('logoDomain', () => {
  it('maps claude.ai connector names, URLs and channels', () => {
    expect(logoDomain('Gmail')).toBe('mail.google.com')
    expect(logoDomain('Google Calendar')).toBe('calendar.google.com')
    expect(logoDomain('Cloudflare Developer Platform')).toBe('cloudflare.com')
    expect(logoDomain('Claude Docs')).toBe('claude.ai')
    expect(logoDomain('Acme Widgets', { guess: true })).toBe('acme.com')
    expect(logoDomain('notes', { url: 'https://mcp.example.org/mcp' })).toBe('example.org')
    expect(logoDomain('local', { url: 'http://127.0.0.1:3000/mcp' })).toBeNull()
    expect(logoDomain('my-tool')).toBeNull()
  })
})
