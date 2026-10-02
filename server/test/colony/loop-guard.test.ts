import { describe, expect, it } from 'vitest'
import { DEFAULT_LOOP_GUARD, LoopGuard } from '../../src/colony/loop-guard.ts'

const pair = { from: 'Chief', to: 'Fixer' }
const reverse = { from: 'Fixer', to: 'Chief' }

describe('LoopGuard', () => {
  it('uses the specified defaults and trips on the ninth admitted attempt', () => {
    expect(DEFAULT_LOOP_GUARD).toEqual({ windowSeconds: 120, maxEvents: 8, cooldownSeconds: 300, maxDepth: 4 })
    const guard = new LoopGuard({}, () => 0)
    for (let i = 0; i < 8; i++) expect(guard.admit(pair, 4)).toEqual({ ok: true })
    expect(guard.admit(pair, 4)).toEqual({ ok: false, reason: 'rate', retryAfterMs: 300_000 })
  })

  it('rejects excess depth without consuming rate budget or starting a cooldown', () => {
    const guard = new LoopGuard({ maxEvents: 1 }, () => 0)
    expect(guard.admit(pair, 5)).toEqual({ ok: false, reason: 'depth', retryAfterMs: 0 })
    expect(guard.admit(pair, 4)).toEqual({ ok: true })
    expect(guard.admit(pair, 5)).toEqual({ ok: false, reason: 'depth', retryAfterMs: 0 })
    expect(guard.admit(pair, 0)).toEqual({ ok: false, reason: 'rate', retryAfterMs: 300_000 })
  })

  it('supports a custom depth limit, including zero', () => {
    const guard = new LoopGuard({ maxDepth: 0 }, () => 0)
    expect(guard.admit(pair, 0)).toEqual({ ok: true })
    expect(guard.admit(pair, 1)).toEqual({ ok: false, reason: 'depth', retryAfterMs: 0 })
  })

  it.each([-1, 0.5, NaN, Infinity])('rejects malformed depth %s', depth => {
    expect(new LoopGuard({}, () => 0).admit(pair, depth)).toEqual({ ok: false, reason: 'depth', retryAfterMs: 0 })
  })

  it('shares budget and cooldown across both directions of a pair', () => {
    const guard = new LoopGuard({ maxEvents: 2 }, () => 100)
    expect(guard.admit(pair, 1)).toEqual({ ok: true })
    expect(guard.admit(reverse, 2)).toEqual({ ok: true })
    expect(guard.admit(pair, 3)).toEqual({ ok: false, reason: 'rate', retryAfterMs: 300_000 })
    expect(guard.admit(reverse, 3)).toEqual({ ok: false, reason: 'rate', retryAfterMs: 300_000 })
  })

  it('isolates unrelated pairs, including colony destinations', () => {
    const guard = new LoopGuard({ maxEvents: 1 }, () => 0)
    guard.admit(pair, 1)
    expect(guard.admit(pair, 1).ok).toBe(false)
    expect(guard.admit({ from: 'Chief', to: 'Researcher' }, 1)).toEqual({ ok: true })
    expect(guard.admit({ from: 'Chief', to: 'colony:offsite' }, 1)).toEqual({ ok: true })
  })

  it('does not collide for identifiers containing separators, quotes or unicode', () => {
    const guard = new LoopGuard({ maxEvents: 1 }, () => 0)
    for (const key of [{ from: 'a:b', to: 'c' }, { from: 'a', to: 'b:c' }, { from: '"🐜"', to: 'c' }]) {
      expect(guard.admit(key, 1)).toEqual({ ok: true })
    }
  })

  it('expires window events at the boundary and counts only admitted events', () => {
    let now = 0
    const guard = new LoopGuard({ windowSeconds: 10, maxEvents: 2, cooldownSeconds: 5 }, () => now)
    expect(guard.admit(pair, 1)).toEqual({ ok: true })
    now = 5000
    expect(guard.admit(pair, 1)).toEqual({ ok: true })
    now = 10_000
    expect(guard.admit(pair, 1)).toEqual({ ok: true })
    expect(guard.admit(pair, 1)).toEqual({ ok: false, reason: 'rate', retryAfterMs: 5000 })
  })

  it('trips inside the window even just before the oldest event expires', () => {
    let now = 0
    const guard = new LoopGuard({ maxEvents: 1 }, () => now)
    guard.admit(pair, 0)
    now = 119_999
    expect(guard.admit(pair, 0)).toEqual({ ok: false, reason: 'rate', retryAfterMs: 300_000 })
  })

  it('does not prolong cooldown on rejected attempts and resets the budget at expiry', () => {
    let now = 0
    const guard = new LoopGuard({ maxEvents: 1, cooldownSeconds: 10 }, () => now)
    guard.admit(pair, 1)
    expect(guard.admit(pair, 1)).toEqual({ ok: false, reason: 'rate', retryAfterMs: 10_000 })
    now = 9000
    expect(guard.admit(reverse, 1)).toEqual({ ok: false, reason: 'rate', retryAfterMs: 1000 })
    now = 9999
    expect(guard.admit(pair, 1)).toEqual({ ok: false, reason: 'rate', retryAfterMs: 1 })
    now = 10_000
    expect(guard.admit(pair, 1)).toEqual({ ok: true })
    expect(guard.admit(pair, 1)).toEqual({ ok: false, reason: 'rate', retryAfterMs: 10_000 })
  })

  it('keeps active cooldowns through idle sweeps', () => {
    let now = 0
    const guard = new LoopGuard({ windowSeconds: 1, maxEvents: 1, cooldownSeconds: 10 }, () => now)
    guard.admit(pair, 1)
    guard.admit(pair, 1)
    now = 2000
    guard.admit({ from: 'Other', to: 'Helper' }, 0)
    expect(guard.admit(pair, 1)).toEqual({ ok: false, reason: 'rate', retryAfterMs: 8000 })
    now = 10_000
    expect(guard.admit(pair, 1)).toEqual({ ok: true })
  })

  it('resets one unordered pair without resetting others, or resets all', () => {
    const guard = new LoopGuard({ maxEvents: 1 }, () => 0)
    const other = { from: 'A', to: 'B' }
    for (const key of [pair, other]) {
      guard.admit(key, 1)
      guard.admit(key, 1)
    }
    guard.reset(reverse)
    expect(guard.admit(pair, 1)).toEqual({ ok: true })
    expect(guard.admit(other, 1).ok).toBe(false)
    guard.reset()
    expect(guard.admit(pair, 1)).toEqual({ ok: true })
    expect(guard.admit(other, 1)).toEqual({ ok: true })
  })

  it('falls back to defaults for unusable settings, as Hermes does', () => {
    const guard = new LoopGuard({ windowSeconds: NaN, cooldownSeconds: -1, maxEvents: 1.5, maxDepth: -1 }, () => 0)
    for (let i = 0; i < 8; i++) expect(guard.admit(pair, 4)).toEqual({ ok: true })
    expect(guard.admit(pair, 4)).toEqual({ ok: false, reason: 'rate', retryAfterMs: 300_000 })
  })

  it('copies the config and handles self-pairs', () => {
    const config = { maxEvents: 1 }
    const guard = new LoopGuard(config, () => 0)
    config.maxEvents = 100
    const self = { from: 'Chief', to: 'Chief' }
    expect(guard.admit(self, 1)).toEqual({ ok: true })
    expect(guard.admit(self, 1).ok).toBe(false)
  })

  it('rejects invalid clock values', () => {
    expect(() => new LoopGuard({}, () => NaN).admit(pair, 1)).toThrow(/finite milliseconds/)
  })
})
