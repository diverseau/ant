// Routines (plan §8): schedules and webhooks that start turns on an ant while you're away.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { CreateRoutineInput, RoutineRunView, RoutineView } from '@ant/shared'
import * as R from '../db/repos/index.ts'
import { HttpError, type AntService, type Turn } from '../service.ts'
import { holdUntil, isHeld, release, type QuotaState } from './quota-hold.ts'
import { classifyLateness, describeSchedule, graceSeconds, nextRunAt, parseSchedule, ScheduleError, type Schedule } from './schedule.ts'

const TICK_MS = 15_000
const MAX_PER_ANT = 50

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex')

export class Scheduler {
  private svc: AntService
  private timer: NodeJS.Timeout
  private first: NodeJS.Timeout
  private quota: QuotaState = { heldUntil: null, reason: null }
  /** routine run id → message id of its routine card */
  private cards = new Map<string, string>()

  constructor(svc: AntService) {
    this.svc = svc
    this.timer = setInterval(() => this.tick(), TICK_MS)
    // Runs that were in flight when antd stopped can't finish now.
    for (const r of R.listRoutines(svc.db)) {
      for (const run of R.listRoutineRuns(svc.db, r.id, 5)) if (run.status === 'running') R.finishRoutineRun(svc.db, run.id, { status: 'failed', output: 'Ant restarted' })
    }
    svc.bus.on('turn.finished', (e: { antId: string; turn: Turn; ok: boolean; text: string }) => this.finished(e))
    svc.bus.on('event', (e: { type: string; usage?: { status: string; fiveHour?: { resetsAt: number } } }) => {
      if (e.type !== 'usage' || !e.usage) return
      if (e.usage.status !== 'allowed' && e.usage.fiveHour) this.quota = holdUntil(this.quota, e.usage.fiveHour.resetsAt, 'usage limit')
      else if (e.usage.status === 'allowed') this.quota = release(this.quota)
    })
    this.first = setTimeout(() => this.tick(), 2000)
  }

  timezone(): string {
    return R.getSetting(this.svc.db, 'timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)
  }

  view(r: R.Routine): RoutineView {
    const last = R.listRoutineRuns(this.svc.db, r.id, 1)[0]
    return {
      id: r.id,
      antId: r.antId,
      name: r.name,
      instruction: r.instruction,
      when: r.trigger === 'webhook' ? 'When its webhook is called' : describeSchedule(r.schedule as Schedule, r.tz),
      tz: r.tz,
      trigger: r.trigger === 'webhook' ? 'webhook' : 'schedule',
      enabled: r.enabled,
      nextRunAt: r.nextRunAt,
      lastRunAt: r.lastRunAt,
      lastStatus: last?.status ?? null,
      ...(r.trigger === 'webhook' && { webhookUrl: `http://${this.svc.cfg.host}:${this.svc.cfg.port}/hooks/${r.id}` }),
    }
  }

  runs(routineId: string): RoutineRunView[] {
    return R.listRoutineRuns(this.svc.db, routineId, 20).map((x) => ({
      id: x.id,
      routineId: x.routineId,
      status: x.status,
      startedAt: x.startedAt,
      endedAt: x.endedAt,
      output: x.output,
    }))
  }

  list(antId?: string): RoutineView[] {
    return R.listRoutines(this.svc.db, { ...(antId && { antId }) }).map((r) => this.view(r))
  }

  private publish(r: R.Routine) {
    this.svc.emit({ type: 'routine.updated', routine: this.view(r) })
  }

  /** Create from the UI or the ant's schedule_routine tool. Returns the webhook key once, if any. */
  create(input: CreateRoutineInput): { routine: RoutineView; key?: string } {
    this.svc.antRow(input.antId)
    if (R.listRoutines(this.svc.db, { antId: input.antId }).length >= MAX_PER_ANT) throw new HttpError(400, `An ant can have at most ${MAX_PER_ANT} routines.`)
    const name = input.name.trim()
    if (!name || !input.instruction.trim()) throw new HttpError(400, 'A routine needs a name and an instruction.')
    const tz = input.tz || this.timezone()
    if (input.trigger === 'webhook') {
      const key = `ant_${randomBytes(24).toString('base64url')}`
      const r = R.createRoutine(this.svc.db, { antId: input.antId, name, instruction: input.instruction.trim(), schedule: null, tz, trigger: 'webhook', webhookKeyHash: hashKey(key) })
      this.publish(r)
      return { routine: this.view(r), key }
    }
    const schedule = this.parse(input.when, tz)
    const next = nextRunAt(schedule, { after: new Date(), tz })
    const r = R.createRoutine(this.svc.db, { antId: input.antId, name, instruction: input.instruction.trim(), schedule, tz, nextRunAt: next?.getTime() ?? null })
    this.publish(r)
    return { routine: this.view(r) }
  }

  update(id: string, patch: { name?: string; instruction?: string; when?: string; tz?: string; enabled?: boolean }): RoutineView {
    const r = this.get(id)
    const tz = patch.tz ?? r.tz
    let schedule = r.schedule as Schedule | null
    if (patch.when !== undefined && r.trigger === 'schedule') schedule = this.parse(patch.when, tz)
    const enabled = patch.enabled ?? r.enabled
    const next = r.trigger === 'schedule' && schedule && enabled ? (nextRunAt(schedule, { after: new Date(), tz })?.getTime() ?? null) : r.nextRunAt
    const row = R.updateRoutine(this.svc.db, id, {
      ...(patch.name !== undefined && { name: patch.name.trim() }),
      ...(patch.instruction !== undefined && { instruction: patch.instruction.trim() }),
      schedule,
      tz,
      enabled,
      nextRunAt: next,
    })!
    this.publish(row)
    return this.view(row)
  }

  delete(id: string) {
    this.get(id)
    R.deleteRoutine(this.svc.db, id)
    this.svc.emit({ type: 'routine.deleted', routineId: id })
  }

  get(id: string): R.Routine {
    const r = R.getRoutine(this.svc.db, id)
    if (!r) throw new HttpError(404, 'No such routine')
    return r
  }

  findByName(antId: string, name: string): R.Routine | undefined {
    const n = name.trim().toLowerCase()
    return R.listRoutines(this.svc.db, { antId }).find((r) => r.name.toLowerCase() === n)
  }

  private parse(when: string, tz: string): Schedule {
    try {
      return parseSchedule(when, { tz, now: new Date() })
    } catch (err) {
      throw new HttpError(400, err instanceof ScheduleError ? err.message : `Couldn't understand "${when}" as a schedule.`)
    }
  }

  verifyWebhook(id: string, auth: string | undefined): R.Routine {
    const r = R.getRoutine(this.svc.db, id)
    const key = auth?.replace(/^Bearer\s+/i, '') ?? ''
    if (!r || r.trigger !== 'webhook' || !r.webhookKeyHash || !key) throw new HttpError(404, 'Not found')
    const a = Buffer.from(hashKey(key))
    const b = Buffer.from(r.webhookKeyHash)
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(404, 'Not found')
    if (!r.enabled) throw new HttpError(409, 'Routine is paused')
    return r
  }

  /** Start a run now. `test` runs ignore pause state and don't move the schedule. */
  fire(r: R.Routine, opts: { trigger: 'schedule' | 'webhook' | 'test'; payload?: unknown } = { trigger: 'schedule' }) {
    const svc = this.svc
    const ant = R.getAnt(svc.db, r.antId)
    if (!ant || ant.archived) return
    const now = Date.now()
    const run = R.recordRoutineRun(svc.db, { routineId: r.id, status: 'running', startedAt: now })
    if (opts.trigger === 'schedule' && r.schedule) {
      const next = nextRunAt(r.schedule as Schedule, { after: new Date(now + 1000), tz: r.tz, lastRunAt: new Date(now) })
      R.updateRoutine(svc.db, r.id, { lastRunAt: now, nextRunAt: next?.getTime() ?? null, ...(next ? {} : { enabled: false }) })
    } else R.updateRoutine(svc.db, r.id, { lastRunAt: now })
    const thread = svc.antThread(r.antId)
    const card = svc.insert(thread.id, r.antId, 'routine', { name: r.name, result: 'running', routineId: r.id, runId: run.id })
    this.cards.set(run.id, card.id)
    const payload = opts.payload === undefined ? '' : `\n\nWebhook payload:\n${truncate(JSON.stringify(opts.payload, null, 2), 8000)}`
    svc.enqueue(r.antId, {
      threadId: thread.id,
      text: `[Routine: ${r.name}] ${r.instruction}${payload}\n\nThis is unattended: approvals expire after 10 minutes. Finish with a short summary of what you did.`,
      source: 'routine',
      depth: 0,
      enqueuedAt: now,
      routineRunId: run.id,
    })
    this.publish(R.getRoutine(svc.db, r.id)!)
  }

  private finished(e: { antId: string; turn: Turn; ok: boolean; text: string }) {
    const runId = e.turn.routineRunId
    if (!runId) return
    const status = e.ok ? 'succeeded' : 'failed'
    const run = R.finishRoutineRun(this.svc.db, runId, { status, output: e.text.slice(0, 4000) || null })
    const cardId = this.cards.get(runId)
    this.cards.delete(runId)
    if (cardId) this.svc.patch(cardId, { result: status })
    const r = run && R.getRoutine(this.svc.db, run.routineId)
    if (r) this.publish(r)
  }

  private tick() {
    const now = Date.now()
    if (isHeld(this.quota, now)) return
    for (const r of R.listDue(this.svc.db, now)) {
      if (r.trigger !== 'schedule' || !r.schedule) continue
      const ant = R.getAnt(this.svc.db, r.antId)
      if (!ant || ant.archived || ant.status === 'paused') continue
      const lateness = (now - (r.nextRunAt ?? now)) / 1000
      if (classifyLateness(lateness, graceSeconds(r.schedule as Schedule)) === 'missed_skip') {
        // Missed while the PC was off: log it and move on rather than running stale work.
        const run = R.recordRoutineRun(this.svc.db, { routineId: r.id, status: 'skipped', startedAt: r.nextRunAt ?? now })
        R.finishRoutineRun(this.svc.db, run.id, { status: 'skipped', output: 'Missed while Ant was not running' })
        const next = nextRunAt(r.schedule as Schedule, { after: new Date(now), tz: r.tz })
        const row = R.updateRoutine(this.svc.db, r.id, { nextRunAt: next?.getTime() ?? null })
        if (row) this.publish(row)
        continue
      }
      this.fire(r)
    }
  }

  shutdown() {
    clearInterval(this.timer)
    clearTimeout(this.first)
  }
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '\n…(truncated)' : s
}
