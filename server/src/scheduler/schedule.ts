// Ported from hermes-agent cron/jobs.py @ 54bc5e50 (MIT, Nous Research)
import { Cron, CronDate } from 'croner'

export type Schedule =
  | { kind: 'once'; runAt: string; display: string }
  | { kind: 'interval'; minutes: number; display: string }
  | { kind: 'cron'; expr: string; display: string }

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScheduleError'
  }
}

const MIN_INTERVAL_MINUTES = 5
const ONESHOT_GRACE_SECONDS = 120
const DAYS: Record<string, string> = {
  sunday: '0', sun: '0', monday: '1', mon: '1',
  tuesday: '2', tue: '2', tues: '2', wednesday: '3', wed: '3', weds: '3',
  thursday: '4', thu: '4', thur: '4', thurs: '4', friday: '5', fri: '5',
  saturday: '6', sat: '6',
}
const DAY_GROUPS: Record<string, string> = {
  day: '*', daily: '*', everyday: '*', weekday: '1-5', weekdays: '1-5',
  weekend: '0,6', weekends: '0,6',
}

export function parseDuration(s: string): number {
  const match = /^(\d*)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/.exec(s.trim().toLowerCase())
  if (!match) {
    throw new ScheduleError(`Invalid duration '${s}'. Use '30m', '2 hours', '1d', or 'hour'.`)
  }
  const value = match[1] ? Number(match[1]) : 1
  const minutes = value * ({ m: 1, h: 60, d: 1440 }[match[2][0]] ?? 1)
  if (!Number.isSafeInteger(minutes) || minutes <= 0) {
    throw new ScheduleError('Duration must be a positive whole number of minutes within the supported range.')
  }
  return minutes
}

function clockTime(text: string): [number, number] | null {
  const compact = text.replace(/\s/g, '')
  if (compact === 'noon' || compact === 'midday') return [12, 0]
  if (compact === 'midnight') return [0, 0]
  const match = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(compact)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (match[3]) {
    if (hour < 1 || hour > 12) return null
    hour = hour % 12 + (match[3] === 'pm' ? 12 : 0)
  }
  return hour <= 23 && minute <= 59 ? [hour, minute] : null
}

function naturalCron(text: string): string | null {
  const tokens = text.replace(/,/g, ' ').split(/\s+/)
  let dow = DAY_GROUPS[tokens[0]]
  let index = 1
  if (dow === undefined) {
    const days: string[] = []
    index = 0
    while (index < tokens.length) {
      const token = tokens[index]
      if (token === 'and') {
        index++
        continue
      }
      const day = DAYS[token]
      if (day === undefined) break
      if (!days.includes(day)) days.push(day)
      index++
    }
    if (!days.length) return null
    dow = days.join(',')
  }
  if (tokens[index] === 'at') index++
  const time = clockTime(tokens.slice(index).join(' '))
  return time ? `${time[1]} ${time[0]} * * ${dow}` : null
}

function validateZone(tz: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    throw new ScheduleError(`Invalid time zone '${tz}'. Use an IANA zone such as 'Australia/Sydney'.`)
  }
}

function dateMs(date: Date): number {
  const ms = date.getTime()
  if (!Number.isFinite(ms)) throw new ScheduleError('Invalid date supplied for schedule computation.')
  return ms
}

function cronFor(expr: string, tz: string): Cron {
  if (expr.trim().split(/\s+/).length !== 5) {
    throw new ScheduleError('Invalid cron expression. Use exactly 5 fields: minute hour day month weekday.')
  }
  try {
    // No callback or name: this only evaluates expressions and never starts a timer.
    return new Cron(expr, { timezone: tz, mode: '5-part', paused: true })
  } catch {
    throw new ScheduleError(`Invalid cron expression '${expr}'. Check the minute, hour, day, month and weekday fields.`)
  }
}

function interval(minutes: number): Schedule {
  if (!Number.isSafeInteger(minutes) || minutes < MIN_INTERVAL_MINUTES) {
    throw new ScheduleError('Recurring intervals must be at least 5 minutes and use whole minutes.')
  }
  return { kind: 'interval', minutes, display: `every ${minutes}m` }
}

function timestamp(input: string, tz: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(input)
  const invalid = () => new ScheduleError(`Invalid timestamp '${input}'. Use an ISO date and time, for example '2026-10-03T09:00:00+10:00'.`)
  if (!match) throw invalid()
  const [, year, month, day, hour = '00', minute = '00', second = '00', fraction, offset] = match
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > daysInMonth
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) throw invalid()
  if (offset && offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59)) throw invalid()
  const wall = `${year}-${month}-${day}T${hour}:${minute}:${second}`
  let result: Date
  try {
    const iso = `${wall}${fraction ? `.${fraction}` : ''}`
    if (offset) result = new Date(`${iso}${offset}`)
    else {
      // Seed wall components in UTC: parsing a naive string in Croner first uses the host zone,
      // which could normalize a DST gap there even when the requested zone has no gap.
      const local = new CronDate(new Date(`${wall}Z`), 'UTC')
      local.tz = tz
      result = new Date(local.getDate().getTime() + Number((fraction ?? '0').padEnd(3, '0')))
    }
  } catch {
    throw invalid()
  }
  if (!Number.isFinite(result.getTime())) throw invalid()
  return result
}

export function parseSchedule(input: string, opts: { now?: Date; tz?: string } = {}): Schedule {
  const original = input.trim()
  const lower = original.toLowerCase()
  const tz = opts.tz ?? 'UTC'
  validateZone(tz)
  const rest = lower.replace(/^every\s+/, '')
  const expr = naturalCron(rest)
  if (expr) {
    cronFor(expr, tz)
    return { kind: 'cron', expr, display: original }
  }
  if (lower === 'hourly') return interval(60)
  if (/^in\s+/.test(lower)) {
    const duration = lower.replace(/^in\s+/, '')
    let minutes: number
    try {
      minutes = parseDuration(duration)
    } catch {
      throw new ScheduleError(`Invalid duration '${duration}' after 'in'. Use 'in 45m' or 'in 2h'.`)
    }
    const runAt = new Date(dateMs(opts.now ?? new Date()) + minutes * 60_000)
    dateMs(runAt)
    return { kind: 'once', runAt: runAt.toISOString(), display: `once in ${duration}` }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(original)) {
    return { kind: 'once', runAt: timestamp(original, tz).toISOString(), display: `once at ${original}` }
  }
  if (original.split(/\s+/).length >= 5 && !/^every\s+/.test(lower)) {
    const expr = original.replace(/\s+/g, ' ')
    cronFor(expr, tz)
    return { kind: 'cron', expr, display: original }
  }
  if (/^every\s+/.test(lower) || /^\d*\s*(?:m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)$/.test(rest)) {
    return interval(parseDuration(rest))
  }
  throw new ScheduleError(`Invalid schedule '${original}'. Use 'every 30m', 'daily at 9am', 'in 45m', a 5-field cron expression, or an ISO timestamp.`)
}

function nextCron(cron: Cron, after: Date): Date | null {
  let cursor = after
  let first = true
  for (;;) {
    const next = cron.nextRun(cursor)
    if (!next) return null
    // Croner 10 can shift a gap time or return the first fold before an after in the second fold.
    if (next.getTime() > after.getTime() && cron.match(next)) return next
    if (!first && next.getTime() <= cursor.getTime()) {
      throw new ScheduleError('Unable to advance this cron expression across the time zone transition.')
    }
    first = false
    cursor = next
  }
}

export function nextRunAt(s: Schedule, opts: { after: Date; tz: string; lastRunAt?: Date | null }): Date | null {
  const after = dateMs(opts.after)
  validateZone(opts.tz)
  const last = opts.lastRunAt ? dateMs(opts.lastRunAt) : null
  if (s.kind === 'once') {
    if (last !== null) return null
    const runAt = timestamp(s.runAt, opts.tz)
    return after - runAt.getTime() <= ONESHOT_GRACE_SECONDS * 1000 ? runAt : null
  }
  if (s.kind === 'interval') {
    interval(s.minutes)
    const period = s.minutes * 60_000
    const base = last ?? after
    // Keep the last run's phase, coalescing missed slots to the first strictly future slot.
    const steps = Math.max(1, Math.floor((after - base) / period) + 1)
    const next = new Date(base + steps * period)
    dateMs(next)
    return next
  }
  return nextCron(cronFor(s.expr, opts.tz), new Date(Math.max(after, last ?? after)))
}

export function cadenceSeconds(s: Schedule): number | null {
  if (s.kind === 'once') return null
  if (s.kind === 'interval') return Number.isFinite(s.minutes) && s.minutes > 0 ? s.minutes * 60 : null
  try {
    // A fixed UTC reference keeps this approximate cadence pure and independent of DST or the clock.
    const cron = cronFor(s.expr, 'UTC')
    const first = nextCron(cron, new Date('2024-01-01T00:00:00Z'))
    const second = first && nextCron(cron, first)
    return first && second ? (second.getTime() - first.getTime()) / 1000 : null
  } catch {
    return null
  }
}

export function graceSeconds(s: Schedule): number {
  const cadence = cadenceSeconds(s)
  return cadence === null ? 120 : Math.max(120, Math.min(Math.floor(cadence / 2), 7200))
}

export function classifyLateness(latenessSeconds: number, grace: number): 'on_time' | 'late_run' | 'missed_skip' {
  if (latenessSeconds > grace) return 'missed_skip'
  return latenessSeconds > 300 ? 'late_run' : 'on_time'
}

function formatClock(hour: number, minute: number): string {
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

export function describeSchedule(s: Schedule, tz: string): string {
  validateZone(tz)
  let description: string
  if (s.kind === 'interval') {
    const unit = s.minutes % 1440 === 0 ? 'day' : s.minutes % 60 === 0 ? 'hour' : 'minute'
    const value = s.minutes / (unit === 'day' ? 1440 : unit === 'hour' ? 60 : 1)
    description = `Every ${value} ${unit}${value === 1 ? '' : 's'}`
  } else if (s.kind === 'once') {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(timestamp(s.runAt, tz))
    description = `Once on ${formatted}`
  } else {
    const parts = s.expr.trim().split(/\s+/)
    const [minute, hour, day, month, dow] = parts
    const labels: Record<string, string> = { '*': 'Daily', '1-5': 'Weekdays', '0,6': 'Weekends', '6,0': 'Weekends' }
    let days = labels[dow]
    if (!days && /^[0-6](?:,[0-6])*$/.test(dow ?? '')) {
      days = dow.split(',').map(d => ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][Number(d)]).join(', ')
    }
    description = parts.length === 5 && /^\d+$/.test(minute) && /^\d+$/.test(hour) && day === '*' && month === '*' && days
      ? `${days} at ${formatClock(Number(hour), Number(minute))}`
      : `Cron: ${s.expr}`
  }
  return `${description} · ${tz}`
}
