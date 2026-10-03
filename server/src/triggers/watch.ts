// Page watches: antd fetches a public web page on an interval and starts the routine when its
// text changes (or starts containing a phrase). No model usage until something changes.
import { lookup } from 'node:dns'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'

const MAX_BYTES = 2 * 1024 * 1024

/** Loopback, private, link-local, CGNAT (Tailscale), multicast and reserved ranges. */
export function privateAddress(ip: string): boolean {
  const v = ip.replace(/^::ffff:/i, '')
  if (isIP(v) === 4) {
    const [a, b] = v.split('.').map(Number) as [number, number]
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
  }
  const l = v.toLowerCase()
  return l === '::' || l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('ff')
}

// Checked at connect time, so a DNS answer can't change between the check and the request.
const publicOnly: LookupFunction = (host, options, callback) => {
  lookup(host, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0)
    const list = addresses as Array<{ address: string; family: number }>
    const bad = list.find((a) => privateAddress(a.address))
    if (bad || !list.length) return callback(new Error('Only public web addresses can be watched'), '', 0)
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list)
    callback(null, list[0]!.address, list[0]!.family)
  })
}

export function checkUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('That isn’t a web address')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http and https pages can be watched')
  if (u.username || u.password) throw new Error('Addresses with passwords can’t be watched')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && privateAddress(host)) throw new Error('Only public web addresses can be watched')
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.ts\.net)$/i.test(host)) throw new Error('Only public web addresses can be watched')
  return u
}

export function fetchPage(raw: string, redirects = 3): Promise<string> {
  const u = checkUrl(raw)
  return new Promise((resolve, reject) => {
    const req = (u.protocol === 'https:' ? httpsRequest : httpRequest)(
      u,
      { lookup: publicOnly, headers: { 'user-agent': 'Mozilla/5.0 (Ant page watch)', accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' }, timeout: 15_000 },
      (res) => {
        const loc = res.headers.location
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && loc) {
          res.resume()
          if (!redirects) return reject(new Error('Too many redirects'))
          return resolve(fetchPage(new URL(loc, u).href, redirects - 1))
        }
        if (!res.statusCode || res.statusCode >= 400) {
          res.resume()
          return reject(new Error(`The page answered ${res.statusCode}`))
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (d: Buffer) => {
          size += d.length
          if (size > MAX_BYTES) req.destroy(new Error('Page too large'))
          else chunks.push(d)
        })
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        res.on('error', reject)
      },
    )
    req.on('timeout', () => req.destroy(new Error('The page took too long')))
    req.on('error', reject)
    req.end()
  })
}

/** Visible text of an HTML page, one block per line. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

export function diffLines(before: string, after: string, max = 40): { added: string[]; removed: string[] } {
  const a = new Set(before.split('\n'))
  const b = new Set(after.split('\n'))
  return {
    added: [...b].filter((l) => !a.has(l)).slice(0, max),
    removed: [...a].filter((l) => !b.has(l)).slice(0, max),
  }
}
