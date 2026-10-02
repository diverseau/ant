import { tx } from '../index.ts'
import type { Db } from '../index.ts'
import { newId } from '../ids.ts'
import { decode, encodeJson, getRow, insert, limitValue, patchRow } from './_shared.ts'

export interface Routine {
  id: string
  antId: string
  name: string
  instruction: string
  schedule: unknown
  tz: string
  trigger: 'schedule' | 'webhook' | 'watch' | 'event'
  enabled: boolean
  nextRunAt: number | null
  lastRunAt: number | null
  webhookKeyHash: string | null
  budgetUsd: number | null
  createdAt: number
  updatedAt: number
}
export type CreateRoutineInput = Pick<Routine, 'antId' | 'name' | 'instruction' | 'schedule' | 'tz'> & Partial<Pick<Routine, 'trigger' | 'enabled' | 'nextRunAt' | 'lastRunAt' | 'webhookKeyHash' | 'budgetUsd'>>
export type RoutinePatch = Partial<Omit<Routine, 'id' | 'createdAt' | 'updatedAt'>>

export function createRoutine(db: Db, input: CreateRoutineInput): Routine {
  const id = newId('routine')
  const now = Date.now()
  insert(db, 'routines', {
    id,
    ant_id: input.antId,
    name: input.name,
    instruction: input.instruction,
    schedule: encodeJson(input.schedule),
    tz: input.tz,
    trigger: input.trigger ?? 'schedule',
    enabled: Number(input.enabled ?? true),
    next_run_at: input.nextRunAt ?? null,
    last_run_at: input.lastRunAt ?? null,
    webhook_key_hash: input.webhookKeyHash ?? null,
    budget_usd: input.budgetUsd ?? null,
    created_at: now,
    updated_at: now,
  })
  return getRoutine(db, id)!
}

export function getRoutine(db: Db, id: string): Routine | null {
  return getRow<Routine>(db, 'routines', id, ['schedule'], ['enabled'])
}

export function updateRoutine(db: Db, id: string, patch: RoutinePatch): Routine | null {
  patchRow(db, 'routines', id, patch, {
    antId: 'ant_id',
    name: 'name',
    instruction: 'instruction',
    schedule: 'schedule',
    tz: 'tz',
    trigger: 'trigger',
    enabled: 'enabled',
    nextRunAt: 'next_run_at',
    lastRunAt: 'last_run_at',
    webhookKeyHash: 'webhook_key_hash',
    budgetUsd: 'budget_usd',
  }, ['schedule'], ['enabled'], true)
  return getRoutine(db, id)
}

export function deleteRoutine(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM routines WHERE id = ?').run(id).changes > 0
}

export function listRoutines(db: Db, options: { antId?: string; enabled?: boolean } = {}): Routine[] {
  const where: string[] = []
  const args: (string | number)[] = []
  if (options.antId !== undefined) { where.push('ant_id = ?'); args.push(options.antId) }
  if (options.enabled !== undefined) { where.push('enabled = ?'); args.push(Number(options.enabled)) }
  return db.prepare(`SELECT * FROM routines ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at, rowid`)
    .all(...args).map(row => decode<Routine>(row, ['schedule'], ['enabled']))
}

export function listDue(db: Db, now: number): Routine[] {
  return db.prepare('SELECT * FROM routines WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at, rowid').all(now)
    .map(row => decode<Routine>(row, ['schedule'], ['enabled']))
}

export interface RoutineRun {
  id: string
  routineId: string
  runId: string | null
  status: 'running' | 'succeeded' | 'failed' | 'skipped' | 'expired'
  startedAt: number
  endedAt: number | null
  output: string | null
}
export type RecordRoutineRunInput = Pick<RoutineRun, 'routineId'> & Partial<Omit<RoutineRun, 'id' | 'routineId'>>

export function recordRoutineRun(db: Db, input: RecordRoutineRunInput): RoutineRun {
  return tx(db, () => {
    const id = newId('routine_run')
    const startedAt = input.startedAt ?? Date.now()
    insert(db, 'routine_runs', { id, routine_id: input.routineId, run_id: input.runId ?? null,
      status: input.status ?? 'running', started_at: startedAt, ended_at: input.endedAt ?? null, output: input.output ?? null })
    db.prepare('UPDATE routines SET last_run_at = ?, updated_at = ? WHERE id = ?').run(startedAt, Date.now(), input.routineId)
    return getRow<RoutineRun>(db, 'routine_runs', id)!
  })
}

export function finishRoutineRun(db: Db, id: string, input: { status: Exclude<RoutineRun['status'], 'running'>; output?: string | null; endedAt?: number }): RoutineRun | null {
  patchRow(db, 'routine_runs', id, { ...input, endedAt: input.endedAt ?? Date.now() },
    { status: 'status', output: 'output', endedAt: 'ended_at' }, [], [], false)
  return getRow<RoutineRun>(db, 'routine_runs', id)
}

export function listRoutineRuns(db: Db, routineId: string, limit = 20): RoutineRun[] {
  return db.prepare('SELECT * FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?')
    .all(routineId, limitValue(limit)).map(row => decode<RoutineRun>(row))
}
