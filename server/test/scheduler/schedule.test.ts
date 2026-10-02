import { describe, expect, it, vi } from 'vitest'
import {
  ScheduleError, cadenceSeconds, classifyLateness, describeSchedule, graceSeconds, nextRunAt, parseDuration, parseSchedule,
} from '../../src/scheduler/schedule.ts'
import type { Schedule } from '../../src/scheduler/schedule.ts'

const now = new Date('2026-10-03T00:00:00Z')
const parse = (input: string, tz = 'UTC') => parseSchedule(input, { now, tz })
const next = (schedule: Schedule, after: string, tz = 'UTC', lastRunAt?: string) => nextRunAt(schedule, {
  after: new Date(after), tz, lastRunAt: lastRunAt ? new Date(lastRunAt) : null,
})?.toISOString() ?? null

describe('parseDuration', () => {
  it.each([
    ['30m', 30], [' 30 MIN ', 30], ['2 mins', 2], ['5 minute', 5], ['5 minutes', 5],
    ['2h', 120], ['2 hr', 120], ['2 hrs', 120], ['2 hour', 120], ['2 hours', 120],
    ['1d', 1440], ['2 day', 2880], ['2 days', 2880], ['hour', 60], ['day', 1440], ['m', 1],
  ])('parses %s as %i minutes', (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes)
  })

  it.each(['', '0m', '-5m', '1.5h', '2 weeks', '1h 30m', '30m garbage', 'Infinityh', '9007199254740992m'])('rejects invalid duration %s with a message', input => {
    expect(() => parseDuration(input)).toThrow(ScheduleError)
    expect(() => parseDuration(input)).toThrow(/Invalid duration|positive whole number/)
  })
})

describe('parseSchedule', () => {
  it.each([
    ['30m', 30], ['every 30m', 30], ['every 2 hours', 120], ['hourly', 60], ['every hour', 60],
    ['  EVERY   5 MINUTES  ', 5], ['day', 1440],
  ])('parses recurring interval %s', (input, minutes) => {
    expect(parse(input)).toEqual({ kind: 'interval', minutes, display: `every ${minutes}m` })
  })

  it.each([
    ['daily at 9am', '0 9 * * *'],
    ['every weekday at 9:30am', '30 9 * * 1-5'],
    ['every monday, wednesday at 14:00', '0 14 * * 1,3'],
    ['weekends at noon', '0 12 * * 0,6'],
    ['every sunday at midnight', '0 0 * * 0'],
    ['every day 12 am', '0 0 * * *'],
    ['everyday at 12:05pm', '5 12 * * *'],
    ['every mon and WED at 7', '0 7 * * 1,3'],
    ['weekdays 9 am', '0 9 * * 1-5'],
    ['every monday, monday, friday 11:59pm', '59 23 * * 1,5'],
    ['every tues, thurs and sat at midday', '0 12 * * 2,4,6'],
  ])('parses calendar phrase %s', (input, expr) => {
    expect(parse(input)).toEqual({ kind: 'cron', expr, display: input })
  })

  it.each(['0 9 * * *', '*/15 * * * *', '0 9 * JAN MON-FRI', '0 12 1,15 * *', '0 9 * * 0'])('validates 5-field cron %s', expr => {
    expect(parse(expr)).toEqual({ kind: 'cron', expr, display: expr })
  })

  it('normalizes whitespace in a cron expression', () => {
    expect(parse('0   9 * * *')).toEqual({ kind: 'cron', expr: '0 9 * * *', display: '0   9 * * *' })
  })

  it('makes explicit delays one-shot, allowing delays below the recurring minimum', () => {
    expect(parse('in 45m')).toEqual({ kind: 'once', runAt: '2026-10-03T00:45:00.000Z', display: 'once in 45m' })
    expect(parse('IN 2 hours')).toMatchObject({ kind: 'once', runAt: '2026-10-03T02:00:00.000Z' })
    expect(parse('in 1m')).toMatchObject({ kind: 'once', runAt: '2026-10-03T00:01:00.000Z' })
  })

  it.each([
    ['2026-10-03T09:00:00+10:00', '2026-10-02T23:00:00.000Z'],
    ['2026-10-03T09:00:00-04:00', '2026-10-03T13:00:00.000Z'],
    ['2026-10-03T09:00:00.123Z', '2026-10-03T09:00:00.123Z'],
    ['2026-10-03T09:00:00', '2026-10-02T23:00:00.000Z'],
    ['2026-10-03T09:00:00.12', '2026-10-02T23:00:00.120Z'],
    ['2026-10-03', '2026-10-02T14:00:00.000Z'],
    ['2028-02-29T09:00:00', '2028-02-28T22:00:00.000Z'],
  ])('canonicalizes timestamp %s, interpreting offset-free times in tz', (input, runAt) => {
    expect(parse(input, 'Australia/Sydney')).toMatchObject({ kind: 'once', runAt })
  })

  it('defaults offset-free timestamps to UTC independently of the host zone', () => {
    expect(parseSchedule('2026-10-03T09:00:00')).toMatchObject({ runAt: '2026-10-03T09:00:00.000Z' })
  })

  it.each(['UTC', 'America/New_York', 'Australia/Sydney'])('interprets naive timestamps in the requested zone when the host is %s', host => {
    vi.stubEnv('TZ', host)
    try {
      expect(parse('2026-03-08T02:30:00.123', 'Australia/Sydney')).toMatchObject({ runAt: '2026-03-07T15:30:00.123Z' })
      expect(parse('2026-10-04T02:30:00', 'America/New_York')).toMatchObject({ runAt: '2026-10-04T06:30:00.000Z' })
      expect(parseSchedule('2026-03-08T02:30:00')).toMatchObject({ runAt: '2026-03-08T02:30:00.000Z' })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each(['1m', 'every 4 minutes', 'every minute'])('rejects short recurring interval %s clearly', input => {
    expect(() => parse(input)).toThrow('Recurring intervals must be at least 5 minutes')
  })

  it.each([
    ['', /Invalid schedule/], ['tomorrow', /Invalid schedule/], ['every fortnight', /Invalid duration/],
    ['daily at 25:00', /Invalid schedule/], ['weekdays at 9:60am', /Invalid schedule/],
    ['weekends at 0am', /Invalid schedule/], ['every monday at 13pm', /Invalid duration/],
    ['in apples', /Invalid duration .* after 'in'/], ['in 0m', /Invalid duration/],
    ['61 9 * * *', /Invalid cron expression/], ['0 24 * * *', /Invalid cron expression/],
    ['0 9 * 13 *', /Invalid cron expression/], ['0 9 * * 8', /Invalid cron expression/],
    ['*/0 * * * *', /Invalid cron expression/], ['0 0 9 * * *', /exactly 5 fields/],
    ['0 9 * *', /Invalid schedule/], ['2026-02-30T09:00:00Z', /Invalid timestamp/],
    ['2026-02-29T09:00:00Z', /Invalid timestamp/], ['2026-13-01T09:00:00Z', /Invalid timestamp/],
    ['2026-10-03T24:00:00Z', /Invalid timestamp/], ['2026-10-03T09:60:00Z', /Invalid timestamp/],
    ['2026-10-03T09:00:60Z', /Invalid timestamp/], ['2026-10-03T09:00:00+24:00', /Invalid timestamp/],
    ['2026-10-03T09:00:00+10:60', /Invalid timestamp/], ['2026-10-03garbage', /Invalid timestamp/],
  ])('rejects %s with a user-facing error', (input, message) => {
    expect(() => parse(input)).toThrow(ScheduleError)
    expect(() => parse(input)).toThrow(message)
  })

  it('rejects invalid zones and invalid injected dates', () => {
    expect(() => parse('daily at 9am', 'Mars/Olympus')).toThrow(/Invalid time zone/)
    expect(() => parseSchedule('in 45m', { now: new Date(NaN) })).toThrow(/Invalid date/)
  })
})

describe('nextRunAt', () => {
  it('anchors new intervals after the supplied time', () => {
    expect(next(parse('30m'), '2026-10-03T00:00:15Z')).toBe('2026-10-03T00:30:15.000Z')
  })

  it('preserves interval phase, skips missed windows and advances strictly after a boundary', () => {
    const schedule = parse('every 30m')
    expect(next(schedule, '2026-10-03T04:10:00Z', 'UTC', '2026-10-03T00:05:00Z')).toBe('2026-10-03T04:35:00.000Z')
    expect(next(schedule, '2026-10-03T04:05:00Z', 'UTC', '2026-10-03T00:05:00Z')).toBe('2026-10-03T04:35:00.000Z')
    expect(next(schedule, '2026-10-03T00:00:00Z', 'UTC', '2026-10-03T00:05:00Z')).toBe('2026-10-03T00:35:00.000Z')
  })

  it('advances cron past downtime, using the configured wall clock instead of last run offset', () => {
    expect(next(parse('daily at 9am'), '2026-10-05T02:00:00Z', 'Australia/Sydney', '2026-10-01T23:00:00Z')).toBe('2026-10-05T22:00:00.000Z')
    expect(next(parse('daily at 9am'), '2026-10-03T09:00:00Z')).toBe('2026-10-04T09:00:00.000Z')
    expect(next(parse('daily at 9am'), '2026-10-03T00:00:00Z', 'UTC', '2026-10-03T09:00:00Z')).toBe('2026-10-04T09:00:00.000Z')
  })

  it('uses 0 for Sunday and honors weekday lists', () => {
    expect(next(parse('every sunday at 9am'), '2026-10-03T00:00:00Z')).toBe('2026-10-04T09:00:00.000Z')
    expect(next(parse('every monday, wednesday at 14:00'), '2026-10-05T15:00:00Z')).toBe('2026-10-07T14:00:00.000Z')
    expect(next(parse('every weekday at 9:30am'), '2026-10-02T10:00:00Z')).toBe('2026-10-05T09:30:00.000Z')
  })

  it('returns null when a valid cron has no possible occurrence', () => {
    expect(next(parse('0 9 30 FEB *'), '2026-10-03T00:00:00Z')).toBeNull()
  })

  it('allows unrun one-shots up to 120 seconds late, then expires them', () => {
    const schedule = parse('2026-10-03T00:00:00Z')
    expect(next(schedule, '2026-10-02T00:00:00Z')).toBe('2026-10-03T00:00:00.000Z')
    expect(next(schedule, '2026-10-03T00:00:00Z')).toBe('2026-10-03T00:00:00.000Z')
    expect(next(schedule, '2026-10-03T00:02:00Z')).toBe('2026-10-03T00:00:00.000Z')
    expect(next(schedule, '2026-10-03T00:02:00.001Z')).toBeNull()
    expect(next(schedule, '2026-10-03T00:00:01Z', 'UTC', '2026-10-03T00:00:00Z')).toBeNull()
  })

  it('does not mutate input dates or schedules', () => {
    const after = new Date(now)
    const lastRunAt = new Date('2026-10-02T23:00:00Z')
    const schedule = Object.freeze(parse('every 30m'))
    nextRunAt(schedule, { after, lastRunAt, tz: 'UTC' })
    expect(after.toISOString()).toBe(now.toISOString())
    expect(lastRunAt.toISOString()).toBe('2026-10-02T23:00:00.000Z')
  })

  it('rejects invalid computation dates and zones', () => {
    expect(() => nextRunAt(parse('30m'), { after: new Date(NaN), tz: 'UTC' })).toThrow(/Invalid date/)
    expect(() => nextRunAt(parse('30m'), { after: now, tz: 'invalid' })).toThrow(/Invalid time zone/)
    expect(() => nextRunAt(parse('30m'), { after: now, tz: 'UTC', lastRunAt: new Date(NaN) })).toThrow(/Invalid date/)
  })
})

describe('DST transitions', () => {
  it.each([
    ['Australia/Sydney', '2026-10-02T23:00:00Z', '2026-10-03T22:00:00.000Z'],
    ['Australia/Sydney', '2026-04-03T22:00:00Z', '2026-04-04T23:00:00.000Z'],
    ['America/New_York', '2026-03-07T14:00:00Z', '2026-03-08T13:00:00.000Z'],
    ['America/New_York', '2026-10-31T13:00:00Z', '2026-11-01T14:00:00.000Z'],
  ])('keeps 9am local in %s after %s', (tz, after, expected) => {
    expect(next(parse('daily at 9am'), after, tz, after)).toBe(expected)
  })

  it.each([
    ['Australia/Sydney', '2026-10-03T16:00:00Z', '2026-10-04T15:30:00.000Z'],
    ['America/New_York', '2026-03-08T06:00:00Z', '2026-03-09T06:30:00.000Z'],
  ])('skips nonexistent 2:30am in %s', (tz, after, expected) => {
    expect(next(parse('daily at 2:30am'), after, tz)).toBe(expected)
  })

  it.each([
    ['Australia/Sydney', 'daily at 2:30am', '2026-04-04T14:00:00Z', '2026-04-04T15:30:00.000Z', '2026-04-05T16:30:00.000Z'],
    ['America/New_York', 'daily at 1:30am', '2026-11-01T04:00:00Z', '2026-11-01T05:30:00.000Z', '2026-11-02T06:30:00.000Z'],
  ])('runs repeated wall times only at the first occurrence in %s', (tz, input, after, first, following) => {
    const schedule = parse(input)
    expect(next(schedule, after, tz)).toBe(first)
    expect(next(schedule, first, tz, first)).toBe(following)
  })

  it.each([
    ['Australia/Sydney', 'daily at 2:30am', '2026-04-04T16:10:00Z', '2026-04-05T16:30:00.000Z'],
    ['America/New_York', 'daily at 1:30am', '2026-11-01T06:10:00Z', '2026-11-02T06:30:00.000Z'],
    ['America/New_York', '*/5 * * * *', '2026-11-01T06:01:00Z', '2026-11-01T07:00:00.000Z'],
  ])('never returns a past instant from the second fold in %s', (tz, input, after, expected) => {
    expect(next(parse(input), after, tz)).toBe(expected)
  })

  it.each([
    ['Australia/Sydney', '2026-10-03T15:30:00Z', '2026-10-03T16:15:00.000Z'],
    ['Australia/Sydney', '2026-04-04T15:30:00Z', '2026-04-04T16:15:00.000Z'],
    ['America/New_York', '2026-03-08T06:30:00Z', '2026-03-08T07:15:00.000Z'],
    ['America/New_York', '2026-11-01T05:30:00Z', '2026-11-01T06:15:00.000Z'],
  ])('measures relative delays and intervals by elapsed time in %s', (tz, after, expected) => {
    expect(parseSchedule('in 45m', { now: new Date(after), tz })).toMatchObject({ runAt: expected })
    expect(next(parse('45m'), after, tz, after)).toBe(expected)
  })
})

describe('cadence, grace and lateness', () => {
  it.each([
    ['5m', 300, 150], ['30m', 1800, 900], ['hourly', 3600, 1800], ['daily at 9am', 86400, 7200],
    ['every monday at 9am', 604800, 7200], ['*/1 * * * *', 60, 120], ['in 45m', null, 120],
  ])('computes cadence and bounded grace for %s', (input, cadence, grace) => {
    expect(cadenceSeconds(parse(input))).toBe(cadence)
    expect(graceSeconds(parse(input))).toBe(grace)
  })

  it('returns unknown cadence and minimum grace for malformed or impossible cron', () => {
    for (const expr of ['bad', '0 9 30 FEB *']) {
      const schedule: Schedule = { kind: 'cron', expr, display: expr }
      expect(cadenceSeconds(schedule)).toBeNull()
      expect(graceSeconds(schedule)).toBe(120)
    }
  })

  it.each([
    [-1, 900, 'on_time'], [0, 900, 'on_time'], [300, 900, 'on_time'], [301, 900, 'late_run'],
    [900, 900, 'late_run'], [900.1, 900, 'missed_skip'], [120, 120, 'on_time'], [121, 120, 'missed_skip'],
    [150, 150, 'on_time'], [151, 150, 'missed_skip'],
  ])('classifies %s seconds late with grace %s as %s', (late, grace, expected) => {
    expect(classifyLateness(late, grace)).toBe(expected)
  })
})

describe('describeSchedule', () => {
  it.each([
    ['every weekday at 9am', 'Weekdays at 9:00 AM'], ['daily at midnight', 'Daily at 12:00 AM'],
    ['weekends at noon', 'Weekends at 12:00 PM'], ['every monday, wednesday at 14:00', 'Mondays, Wednesdays at 2:00 PM'],
    ['30m', 'Every 30 minutes'], ['hourly', 'Every 1 hour'], ['2d', 'Every 2 days'],
    ['*/15 * * * *', 'Cron: */15 * * * *'],
  ])('describes %s with its zone', (input, text) => {
    expect(describeSchedule(parse(input), 'Australia/Sydney')).toBe(`${text} · Australia/Sydney`)
  })

  it('renders one-shots in the requested zone', () => {
    expect(describeSchedule(parse('2026-10-03T00:00:00Z'), 'Australia/Sydney')).toBe('Once on Oct 3, 2026, 10:00 AM · Australia/Sydney')
    expect(() => describeSchedule(parse('30m'), 'invalid')).toThrow(/Invalid time zone/)
  })
})
