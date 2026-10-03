import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { Agent, createServer } from 'node:https'
import type { IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import webpush from 'web-push'
import { openDb } from '../../src/db/index.ts'
import * as R from '../../src/db/repos/index.ts'
import { PushHub } from '../../src/push/push.ts'

// web-push only speaks https, like real push services: a throwaway self-signed certificate.
const dir = mkdtempSync(join(tmpdir(), 'ant-push-'))
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
  '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' })
const tls = { key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }
const insecure = new Agent({ rejectUnauthorized: false })
const hubFor = (db: ReturnType<typeof openDb>, subject: string) => {
  const hub = new PushHub(db, () => subject)
  hub.sender = (s, b, o) => webpush.sendNotification(s, b, { ...o, agent: insecure })
  return hub
}

// A fake push service: records what the real web-push library sends it.
async function pushService(status = 201) {
  const got: Array<{ headers: IncomingMessage['headers']; bytes: number }> = []
  const server = createServer(tls, (req, res) => {
    let bytes = 0
    req.on('data', (d: Buffer) => (bytes += d.length))
    req.on('end', () => {
      got.push({ headers: req.headers, bytes })
      res.writeHead(status).end()
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const url = `https://127.0.0.1:${(server.address() as { port: number }).port}/push/abc`
  return { got, url, close: () => new Promise<void>((r) => server.close(() => r())) }
}

// Browser-side keys for a subscription (what PushSubscription.toJSON().keys holds).
const client = () => {
  const ecdh = webpush.generateVAPIDKeys()
  return { p256dh: ecdh.publicKey, auth: Buffer.from('0123456789abcdef').toString('base64url') }
}

const closers: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const c of closers.splice(0)) await c()
})

describe('PushHub', () => {
  it('signs with persistent VAPID keys and delivers an encrypted payload', async () => {
    const svc = await pushService()
    closers.push(svc.close)
    const db = openDb(':memory:')
    const hub = hubFor(db, 'https://ant.example.ts.net:8443')
    const key = hub.publicKey()
    expect(new PushHub(db, () => '').publicKey()).toBe(key)
    hub.subscribe(null, { endpoint: svc.url, keys: client() })
    expect(await hub.send({ title: 'Rex', body: 'Needs your approval: Send email', tag: 'appr_1' })).toBe(1)
    const h = svc.got[0]!.headers
    expect(h['content-encoding']).toBe('aes128gcm')
    expect(String(h.authorization)).toMatch(new RegExp(`^vapid t=.+, k=${key}$`))
    expect(h.urgency).toBe('high')
    expect(svc.got[0]!.bytes).toBeGreaterThan(50)
  })

  it('drops subscriptions the push service says are gone', async () => {
    const svc = await pushService(410)
    closers.push(svc.close)
    const db = openDb(':memory:')
    const hub = hubFor(db, 'mailto:ant@localhost')
    hub.subscribe(null, { endpoint: svc.url, keys: client() })
    expect(await hub.send({ title: 'x', body: 'y' })).toBe(0)
    expect(R.listPushSubscriptions(db)).toEqual([])
  })
})
