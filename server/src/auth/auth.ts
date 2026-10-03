// Who may use antd. This computer (loopback, local Host, no proxy headers) is trusted as before;
// every other device pairs once with a short-lived one-time code and then holds its own
// revocable session cookie. There are no passwords to store or leak.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import type { Context } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { getCookie } from 'hono/cookie'
import type { Db } from '../db/index.ts'
import * as R from '../db/repos/index.ts'

export const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
export const SESSION_COOKIE = 'ant_session'
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_TTL = 10 * 60_000
const SESSION_DAYS = 400
const FAILS_PER_MINUTE = 10

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const normaliseCode = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, '')

export function hostOf(c: Context): string {
  return (c.req.header('host') ?? '').toLowerCase().replace(/:\d+$/, '')
}

export class Auth {
  private db: Db
  private fails: number[] = []
  /** Live sockets per device, closed when the device is removed. */
  private sockets = new Map<string, Set<() => void>>()

  constructor(db: Db) {
    this.db = db
  }

  /** Extra host names Ant answers to: ANT_ALLOWED_HOSTS plus the ones set in Settings. */
  allowedHosts(): string[] {
    const env = (process.env.ANT_ALLOWED_HOSTS ?? '').split(',')
    const saved = R.getSetting<string[]>(this.db, 'remote.hosts', [])
    return [...new Set([...env, ...saved].map((h) => h.trim().toLowerCase()).filter(Boolean))]
  }

  /** This computer, talking to antd directly. Anything proxied or remote must pair. */
  trusted(c: Context): boolean {
    if (process.env.ANT_REQUIRE_LOGIN === '1') return false
    if (!LOCAL_HOSTS.has(hostOf(c))) return false
    if (c.req.header('x-forwarded-for') || c.req.header('forwarded') || c.req.header('x-real-ip')) return false
    let addr = ''
    try {
      addr = getConnInfo(c).remote.address ?? ''
    } catch {
      return false
    }
    return addr === '::1' || /^(::ffff:)?127\./.test(addr)
  }

  /** The paired device behind this request's session cookie, if any. */
  device(c: Context): R.Device | null {
    const raw = getCookie(c, SESSION_COOKIE)
    const [id, secret] = (raw ?? '').split('.')
    if (!id || !secret) return null
    const d = R.getDevice(this.db, id)
    if (!d) return null
    const a = Buffer.from(sha256(secret))
    const b = Buffer.from(d.tokenHash)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    if (Date.now() - d.lastSeenAt > 60_000) R.touchDevice(this.db, d.id)
    return d
  }

  newPairingCode(): { code: string; expiresAt: number } {
    const raw = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
    const expiresAt = Date.now() + CODE_TTL
    R.addPairingCode(this.db, sha256(raw), expiresAt)
    return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt }
  }

  /** Redeem a code for a new device session. Wrong guesses are rate limited across all clients. */
  pair(code: string, name: string, userAgent: string): { device: R.Device; cookieValue: string } | { error: string; status: 400 | 429 } {
    const now = Date.now()
    this.fails = this.fails.filter((t) => now - t < 60_000)
    if (this.fails.length >= FAILS_PER_MINUTE) return { error: 'Too many attempts. Wait a minute and try again.', status: 429 }
    const clean = normaliseCode(code)
    if (clean.length !== 8 || !R.redeemPairingCode(this.db, sha256(clean))) {
      this.fails.push(now)
      return { error: "That code didn't work. Codes last 10 minutes and work once.", status: 400 }
    }
    const secret = randomBytes(32).toString('base64url')
    const device = R.createDevice(this.db, { name: name.trim().slice(0, 60) || 'Device', tokenHash: sha256(secret), userAgent: userAgent.slice(0, 300) })
    return { device, cookieValue: `${device.id}.${secret}` }
  }

  cookieOptions(c: Context) {
    const https = c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:' || !LOCAL_HOSTS.has(hostOf(c))
    return { httpOnly: true, sameSite: 'Strict' as const, path: '/', secure: https, maxAge: SESSION_DAYS * 86400 }
  }

  revoke(id: string): boolean {
    const ok = R.deleteDevice(this.db, id)
    for (const close of this.sockets.get(id) ?? []) close()
    this.sockets.delete(id)
    return ok
  }

  trackSocket(deviceId: string | undefined, close: () => void): () => void {
    if (!deviceId) return () => {}
    let set = this.sockets.get(deviceId)
    if (!set) this.sockets.set(deviceId, (set = new Set()))
    set.add(close)
    return () => set.delete(close)
  }
}
