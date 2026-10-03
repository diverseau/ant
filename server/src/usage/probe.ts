// Fresh subscription usage on demand. Claude Code's `/usage` is a local command: it runs
// no model turn and costs nothing, so the refresh button can call it freely.
import { execFile } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { UsageWindows } from '@ant/shared'
import type { Config } from '../config.ts'

type Window = NonNullable<UsageWindows['fiveHour']>

export async function probeUsage(cfg: Config, previous: UsageWindows | null): Promise<UsageWindows> {
  // An empty folder of its own, so no ant's CLAUDE.md or settings are involved.
  const cwd = join(cfg.dataDir, 'usage-probe')
  mkdirSync(cwd, { recursive: true })
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      cfg.claudeBin,
      ['-p', '/usage', '--output-format', 'json', '--no-session-persistence', '--setting-sources', 'project,local'],
      { cwd, timeout: 30_000, maxBuffer: 1 << 20 },
      (err, out) => (err ? reject(new Error('Claude Code did not answer /usage')) : resolve(out)),
    )
  })
  let text = ''
  try {
    text = String((JSON.parse(stdout) as { result?: unknown }).result ?? '')
  } catch {
    throw new Error('Unexpected /usage output')
  }
  const parsed = parseUsageText(text)
  if (!parsed.fiveHour && !parsed.sevenDay) throw new Error('Claude Code reported no subscription usage')
  const full = [parsed.fiveHour, parsed.sevenDay].some((w) => w && w.utilization >= 1)
  return {
    status: full ? 'rejected' : 'allowed',
    fiveHour: parsed.fiveHour ?? previous?.fiveHour,
    sevenDay: parsed.sevenDay ?? previous?.sevenDay,
    updatedAt: Date.now(),
  }
}

/**
 * Reads lines such as
 *   Current session: 34% used · resets Oct 3, 5:50pm (Australia/Perth)
 *   Current week (all models): 30% used · resets Oct 8, 9pm (Australia/Perth)
 */
export function parseUsageText(text: string, now = Date.now()): { fiveHour?: Window; sevenDay?: Window } {
  const line = (label: RegExp) => {
    const m = text.match(new RegExp(`(?:${label.source})[^:\\n]*:\\s*(\\d+(?:\\.\\d+)?)%\\s*used(?:[^\\n]*?resets\\s+([^\\n(]+?)\\s*\\(([^)]+)\\))?`, 'i'))
    if (!m) return undefined
    const resetsAt = m[2] && m[3] ? parseReset(m[2], m[3], now) : null
    return { utilization: Number(m[1]) / 100, resetsAt: resetsAt ?? NaN }
  }
  return { fiveHour: line(/Current session/), sevenDay: line(/Current week/) }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "Oct 3, 5:50pm" or "5:50pm" as wall time in an IANA zone → epoch ms (next occurrence). */
export function parseReset(when: string, zone: string, now = Date.now()): number | null {
  const m = when.trim().match(/^(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+)?(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!m) return null
  let hour = Number(m[3]) % 12
  if (m[5]?.toLowerCase() === 'pm') hour += 12
  if (!m[5]) hour = Number(m[3])
  const minute = Number(m[4] ?? 0)
  let today: { y: number; mo: number; d: number }
  try {
    today = wallDate(now, zone)
  } catch {
    return null
  }
  const month = m[1] ? MONTHS.indexOf(m[1].toLowerCase()) : today.mo
  if (month < 0) return null
  const day = m[2] ? Number(m[2]) : today.d
  let at = zonedToEpoch(today.y, month, day, hour, minute, zone)
  // No year in the text: a date well in the past means next year; a bare time means tomorrow.
  if (m[1] && at < now - 2 * 864e5) at = zonedToEpoch(today.y + 1, month, day, hour, minute, zone)
  if (!m[1] && at < now - 60_000) at += 864e5
  return at
}

function wallDate(at: number, zone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  )
  return { y: Number(p.year), mo: Number(p.month) - 1, d: Number(p.day) }
}

function offsetAt(at: number, zone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  )
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(at / 1000) * 1000
}

function zonedToEpoch(y: number, mo: number, d: number, h: number, min: number, zone: string): number {
  const guess = Date.UTC(y, mo, d, h, min)
  const first = guess - offsetAt(guess, zone)
  // Second pass settles DST edges.
  return guess - offsetAt(first, zone)
}
