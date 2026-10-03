import { describe, expect, it } from 'vitest'
import { parseReset, parseUsageText } from '../../src/usage/probe.ts'

// 2026-10-03 08:20 UTC = 16:20 in Perth (UTC+8, no DST).
const NOW = Date.UTC(2026, 9, 3, 8, 20)

describe('/usage parsing', () => {
  it('reads both windows from Claude Code 2.1 output', () => {
    const text = `You are currently using your subscription to power your Claude Code usage

Current session: 34% used · resets Oct 3, 5:50pm (Australia/Perth)
Current week (all models): 30% used · resets Oct 8, 9pm (Australia/Perth)

What's contributing to your limits usage?`
    expect(parseUsageText(text, NOW)).toEqual({
      fiveHour: { utilization: 0.34, resetsAt: Date.UTC(2026, 9, 3, 9, 50) },
      sevenDay: { utilization: 0.3, resetsAt: Date.UTC(2026, 9, 8, 13, 0) },
    })
  })

  it('handles bare times, noon, midnight and the year boundary', () => {
    expect(parseReset('5:50pm', 'Australia/Perth', NOW)).toBe(Date.UTC(2026, 9, 3, 9, 50))
    expect(parseReset('3pm', 'Australia/Perth', NOW)).toBe(Date.UTC(2026, 9, 4, 7, 0))
    expect(parseReset('Oct 4, 12am', 'Australia/Perth', NOW)).toBe(Date.UTC(2026, 9, 3, 16, 0))
    expect(parseReset('Oct 4, 12pm', 'Australia/Perth', NOW)).toBe(Date.UTC(2026, 9, 4, 4, 0))
    expect(parseReset('Jan 2, 9am', 'UTC', Date.UTC(2026, 11, 30))).toBe(Date.UTC(2027, 0, 2, 9, 0))
  })

  it('respects DST in the reset zone', () => {
    // New York is UTC-4 in October.
    expect(parseReset('Oct 8, 9pm', 'America/New_York', NOW)).toBe(Date.UTC(2026, 9, 9, 1, 0))
  })

  it('tolerates missing reset times and unknown text', () => {
    expect(parseUsageText('Current session: 5% used', NOW).fiveHour?.utilization).toBe(0.05)
    expect(parseUsageText('nothing here', NOW)).toEqual({ fiveHour: undefined, sevenDay: undefined })
    expect(parseReset('someday', 'UTC', NOW)).toBeNull()
    expect(parseReset('Oct 8, 9pm', 'Not/AZone', NOW)).toBeNull()
  })
})
