// Real logos for connectors and channels: fetched once from Google's favicon service (the
// site's own icon, up to 128px) and cached on disk, so the browser never calls Google itself.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DOMAIN } from '@ant/shared'

const MISS_TTL = 864e5
const MAX_BYTES = 256 * 1024

export class LogoCache {
  private dir: string
  private inflight = new Map<string, Promise<Buffer | null>>()
  private source: (domain: string) => string

  constructor(dataDir: string, source = (d: string) => `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${d}&size=128`) {
    this.dir = join(dataDir, 'logos')
    this.source = source
  }

  /** PNG bytes for a site's logo, or null when it has none (remembered for a day). */
  get(domain: string): Promise<Buffer | null> {
    domain = domain.toLowerCase()
    if (!DOMAIN.test(domain)) return Promise.resolve(null)
    const file = join(this.dir, `${domain}.png`)
    if (existsSync(file)) return Promise.resolve(readFileSync(file))
    const miss = join(this.dir, `${domain}.miss`)
    if (existsSync(miss) && Date.now() - statSync(miss).mtimeMs < MISS_TTL) return Promise.resolve(null)
    let p = this.inflight.get(domain)
    if (!p) {
      p = this.fetch(domain, file, miss).finally(() => this.inflight.delete(domain))
      this.inflight.set(domain, p)
    }
    return p
  }

  private async fetch(domain: string, file: string, miss: string): Promise<Buffer | null> {
    mkdirSync(this.dir, { recursive: true })
    try {
      const r = await fetch(this.source(domain), { signal: AbortSignal.timeout(8000), redirect: 'follow' })
      const type = r.headers.get('content-type') ?? ''
      const body = Buffer.from(await r.arrayBuffer())
      // A 404 still carries a generic globe; treat it as "no logo". fallback_opts makes Google
      // fetch the site's icon when it isn't cached yet.
      if (!r.ok || !type.startsWith('image/') || !body.length || body.length > MAX_BYTES || !isPng(body)) {
        writeFileSync(miss, '')
        return null
      }
      writeFileSync(file, body)
      return body
    } catch {
      // Offline: don't remember the miss, try again next time.
      return null
    }
  }
}

function isPng(b: Buffer) {
  return b.length > 8 && b.readUInt32BE(0) === 0x89504e47
}
