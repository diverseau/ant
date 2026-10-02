import { describe, expect, it } from 'vitest'
import { holdUntil, isHeld, release } from '../../src/scheduler/quota-hold.ts'
import type { QuotaState } from '../../src/scheduler/quota-hold.ts'

describe('quota holds', () => {
  const clear: QuotaState = Object.freeze({ heldUntil: null, reason: null })

  it('holds until the exact reset boundary without mutating state', () => {
    const held = holdUntil(clear, 10_000, 'Usage limit')
    expect(held).toEqual({ heldUntil: 10_000, reason: 'Usage limit' })
    expect(clear).toEqual({ heldUntil: null, reason: null })
    expect(isHeld(held, 9999)).toBe(true)
    expect(isHeld(held, 10_000)).toBe(false)
    expect(isHeld(held, 10_001)).toBe(false)
  })

  it('extends holds but never shortens an existing provider window', () => {
    const held = Object.freeze(holdUntil(clear, 10_000, 'Provider A'))
    expect(holdUntil(held, 5000, 'Provider B')).toEqual(held)
    expect(holdUntil(held, 20_000, 'Provider B')).toEqual({ heldUntil: 20_000, reason: 'Provider B' })
    expect(holdUntil(held, 10_000, 'Updated reason')).toEqual({ heldUntil: 10_000, reason: 'Updated reason' })
    expect(held.reason).toBe('Provider A')
  })

  it('releases both fields without mutating state and is idempotent', () => {
    const held = Object.freeze(holdUntil(clear, 10_000, 'Limit'))
    expect(release(held)).toEqual(clear)
    expect(release(release(held))).toEqual(clear)
    expect(held.heldUntil).toBe(10_000)
    expect(isHeld(clear, 0)).toBe(false)
  })

  it('treats past holds as inert and supports timestamp zero', () => {
    expect(isHeld(holdUntil(clear, 0, 'Limit'), -1)).toBe(true)
    expect(isHeld(holdUntil(clear, 0, 'Limit'), 0)).toBe(false)
    expect(isHeld(holdUntil(clear, 100, 'Limit'), 200)).toBe(false)
  })

  it.each([NaN, Infinity, -Infinity])('rejects invalid reset timestamp %s', reset => {
    expect(() => holdUntil(clear, reset, 'Limit')).toThrow(/finite timestamp in milliseconds/)
  })
})
