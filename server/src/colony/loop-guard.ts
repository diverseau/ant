// Ported from hermes-agent gateway/bot_loop_guard.py @ 54bc5e50 (MIT, Nous Research)
export interface LoopGuardConfig {
  windowSeconds: number
  maxEvents: number
  cooldownSeconds: number
  maxDepth: number
}

export const DEFAULT_LOOP_GUARD: LoopGuardConfig = Object.freeze({
  windowSeconds: 120, maxEvents: 8, cooldownSeconds: 300, maxDepth: 4,
})

type Pair = { from: string; to: string }
type Admission = { ok: true } | { ok: false; reason: 'depth' | 'rate'; retryAfterMs: number }
type Window = { events: number[]; cooldownUntil: number | null }

function pairKey(key: Pair): string {
  return JSON.stringify([key.from, key.to].sort())
}

function positive(value: number | undefined, fallback: number, integer = false): number {
  return value !== undefined && Number.isFinite(value) && value > 0 && (!integer || Number.isSafeInteger(value)) ? value : fallback
}

export class LoopGuard {
  private readonly config: LoopGuardConfig
  private readonly now: () => number
  private readonly windows = new Map<string, Window>()
  private lastSweep: number | null = null

  /** The injected clock returns milliseconds, preferably from a monotonic clock. */
  constructor(config: Partial<LoopGuardConfig> = {}, now: () => number = () => performance.now()) {
    this.config = {
      windowSeconds: positive(config.windowSeconds, DEFAULT_LOOP_GUARD.windowSeconds),
      maxEvents: positive(config.maxEvents, DEFAULT_LOOP_GUARD.maxEvents, true),
      cooldownSeconds: positive(config.cooldownSeconds, DEFAULT_LOOP_GUARD.cooldownSeconds),
      maxDepth: config.maxDepth !== undefined && Number.isSafeInteger(config.maxDepth) && config.maxDepth >= 0
        ? config.maxDepth : DEFAULT_LOOP_GUARD.maxDepth,
    }
    this.now = now
  }

  /** Record an ant-authored message between an unordered pair at the given hop depth. */
  admit(key: Pair, depth: number): Admission {
    if (!Number.isSafeInteger(depth) || depth < 0 || depth > this.config.maxDepth) {
      return { ok: false, reason: 'depth', retryAfterMs: 0 }
    }
    const now = this.now()
    if (!Number.isFinite(now)) throw new RangeError('Loop guard clock must return finite milliseconds.')
    this.sweep(now)
    const id = pairKey(key)
    let window = this.windows.get(id)
    if (!window) {
      window = { events: [], cooldownUntil: null }
      this.windows.set(id, window)
    }
    if (window.cooldownUntil !== null && window.cooldownUntil > now) {
      return { ok: false, reason: 'rate', retryAfterMs: window.cooldownUntil - now }
    }
    window.cooldownUntil = null
    const cutoff = now - this.config.windowSeconds * 1000
    window.events = window.events.filter(time => time > cutoff)
    if (window.events.length >= this.config.maxEvents) {
      window.cooldownUntil = now + this.config.cooldownSeconds * 1000
      window.events = []
      return { ok: false, reason: 'rate', retryAfterMs: this.config.cooldownSeconds * 1000 }
    }
    window.events.push(now)
    return { ok: true }
  }

  reset(key?: Pair): void {
    if (key) this.windows.delete(pairKey(key))
    else {
      this.windows.clear()
      this.lastSweep = null
    }
  }

  private sweep(now: number): void {
    const windowMs = this.config.windowSeconds * 1000
    if (this.lastSweep !== null && now - this.lastSweep < windowMs) return
    this.lastSweep = now
    const cutoff = now - windowMs
    for (const [key, window] of this.windows) {
      const latest = window.events.at(-1)
      if ((window.cooldownUntil === null || window.cooldownUntil <= now) && (latest === undefined || latest <= cutoff)) {
        this.windows.delete(key)
      }
    }
  }
}
