import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb } from '../../src/db/index.ts'
import type { Db } from '../../src/db/index.ts'
import * as repo from '../../src/db/repos/index.ts'

let db: Db
beforeEach(() => { db = openDb(':memory:') })
afterEach(() => { db.close(); vi.restoreAllMocks() })
function approval(expiresAt?: number, antId = 'ant-a'): repo.Approval {
  return repo.createApproval(db, { antId, threadId: 'thread-a', toolName: 'Shell', input: { command: 'echo hello' },
    behaviour: 'ask', expiresAt })
}
function routine(name: string, options: Partial<repo.CreateRoutineInput> = {}): repo.Routine {
  return repo.createRoutine(db, { antId: 'ant-a', name, instruction: 'Summarize tickets',
    schedule: { cron: '0 9 * * *' }, tz: 'Australia/Perth', ...options })
}

describe('runs and tool events', () => {
  it('creates, gets, updates and filters runs', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123)
    const first = repo.createRun(db, { antId: 'a', trigger: 'user', threadId: 't' })
    const second = repo.createRun(db, { antId: 'b', trigger: 'routine', threadId: 't', sessionId: 'session', parentRunId: first.id })
    const third = repo.createRun(db, { antId: 'a', trigger: 'ant', threadId: 'other' })
    expect(first).toMatchObject({ status: 'queued', costUsd: 0, tokensIn: 0, tokensOut: 0, turns: 0,
      sessionId: null, parentRunId: null, startedAt: null, endedAt: null, error: null, createdAt: 123 })
    expect(repo.getRun(db, first.id)).toEqual(first)
    expect(repo.getRun(db, 'missing')).toBeNull()
    expect(repo.updateRun(db, first.id, { status: 'succeeded', startedAt: 100, endedAt: 200,
      costUsd: 0.5, tokensIn: 100, tokensOut: 50, turns: 2 })).toMatchObject({ status: 'succeeded', startedAt: 100,
      endedAt: 200, costUsd: 0.5, tokensIn: 100, tokensOut: 50, turns: 2, createdAt: 123 })
    expect(repo.listRuns(db, { antId: 'a' }).map(row => row.id)).toEqual([third.id, first.id])
    expect(repo.listRuns(db, { threadId: 't' }).map(row => row.id)).toEqual([second.id, first.id])
    expect(repo.listRuns(db, { antId: 'a', threadId: 't' }).map(row => row.id)).toEqual([first.id])
    expect(repo.listRuns(db, { limit: 1 })).toEqual([third])
    expect(repo.updateRun(db, 'missing', { status: 'failed' })).toBeNull()
  })

  it('round trips tool inputs, updates events, orders them and cascades with the run', () => {
    const run = repo.createRun(db, { antId: 'a', trigger: 'user' })
    const first = repo.addToolEvent(db, { runId: run.id, toolUseId: 'tu1', name: 'Read', input: { path: '/tmp/example' } })
    const second = repo.addToolEvent(db, { runId: run.id, toolUseId: 'tu2', name: 'Write', input: [1, null], status: 'denied' })
    expect(first).toMatchObject({ status: 'running', durationMs: null, outputSummary: null, input: { path: '/tmp/example' } })
    const updated = repo.updateToolEvent(db, first.id, { status: 'ok', durationMs: 12, outputSummary: 'Read file', input: null })!
    expect(updated).toMatchObject({ status: 'ok', durationMs: 12, outputSummary: 'Read file', input: null })
    expect(repo.listToolEvents(db, run.id)).toEqual([updated, second])
    expect(repo.updateToolEvent(db, 'missing', { status: 'error' })).toBeNull()
    expect(() => repo.addToolEvent(db, { runId: 'missing', toolUseId: 'bad', name: 'Read', input: {} })).toThrow()
    db.prepare('DELETE FROM runs WHERE id = ?').run(run.id)
    expect(repo.listToolEvents(db, run.id)).toEqual([])
  })
})

describe('approvals', () => {
  it('round trips inputs and filters by status and ant', () => {
    const first = approval()
    const other = approval(100, 'ant-b')
    expect(first).toMatchObject({ status: 'pending', runId: null, messageId: null, expiresAt: null,
      decidedAt: null, input: { command: 'echo hello' } })
    expect(repo.getApproval(db, first.id)).toEqual(first)
    expect(repo.getApproval(db, 'missing')).toBeNull()
    expect(repo.listApprovals(db)).toEqual([first, other])
    expect(repo.listApprovals(db, { antId: 'ant-b', status: 'pending' })).toEqual([other])
    repo.decideApproval(db, first.id, 'deny')
    expect(repo.listApprovals(db, { status: 'pending' })).toEqual([other])
  })

  it.each(['once', 'always', 'deny', 'expired'] as const)('allows %s only from pending and preserves the first decision', status => {
    const first = approval()
    vi.spyOn(Date, 'now').mockReturnValue(999)
    const decided = repo.decideApproval(db, first.id, status)!
    expect(decided).toMatchObject({ status, decidedAt: 999 })
    expect(repo.decideApproval(db, first.id, 'deny')).toBeNull()
    expect(repo.decideApproval(db, first.id, 'once')).toBeNull()
    expect(repo.getApproval(db, first.id)).toEqual(decided)
    expect(repo.decideApproval(db, 'missing', status)).toBeNull()
  })

  it('expires only pending due approvals, including the exact deadline', () => {
    const overdue = approval(99), due = approval(100), future = approval(101), noDeadline = approval()
    const decided = approval(90)
    repo.decideApproval(db, decided.id, 'always')
    expect(repo.expireDue(db, 100)).toEqual([overdue.id, due.id])
    expect(repo.getApproval(db, due.id)).toMatchObject({ status: 'expired', decidedAt: 100 })
    expect(repo.decideApproval(db, due.id, 'once')).toBeNull()
    expect(repo.getApproval(db, decided.id)!.status).toBe('always')
    expect(repo.listApprovals(db, { status: 'pending' })).toEqual([future, noDeadline])
    expect(repo.expireDue(db, 100)).toEqual([])
    expect(repo.expireDue(db, 101)).toEqual([future.id])
  })
})

describe('rules', () => {
  it('adds and deletes rules and lists global plus the selected ant rules', () => {
    const global = repo.addRule(db, { scope: 'global', pattern: 'Read:*', behaviour: 'allow', source: 'default' })
    const own = repo.addRule(db, { scope: 'ant', antId: 'a', pattern: 'Shell:*', behaviour: 'ask', source: 'user', note: 'Review commands' })
    const other = repo.addRule(db, { scope: 'ant', antId: 'b', pattern: '*', behaviour: 'deny', source: 'admin' })
    expect(global).toMatchObject({ antId: null, note: null })
    expect(repo.listRules(db)).toEqual([global, own, other])
    expect(repo.listRules(db, { antId: 'a' })).toEqual([global, own])
    expect(repo.listRules(db, { antId: 'missing' })).toEqual([global])
    expect(repo.deleteRule(db, own.id)).toBe(true)
    expect(repo.listRules(db, { antId: 'a' })).toEqual([global])
    expect(repo.deleteRule(db, own.id)).toBe(false)
  })
})

describe('routines', () => {
  it('creates, gets, lists and updates routines with parsed schedules and booleans', () => {
    const first = routine('Morning')
    const second = routine('Webhook', { antId: 'b', trigger: 'webhook', schedule: null, enabled: false })
    expect(first).toMatchObject({ schedule: { cron: '0 9 * * *' }, enabled: true, trigger: 'schedule',
      nextRunAt: null, lastRunAt: null, webhookKeyHash: null, budgetUsd: null })
    expect(repo.getRoutine(db, first.id)).toEqual(first)
    expect(repo.getRoutine(db, 'missing')).toBeNull()
    expect(repo.listRoutines(db)).toEqual([first, second])
    expect(repo.listRoutines(db, { antId: 'b', enabled: false })).toEqual([second])
    vi.spyOn(Date, 'now').mockReturnValue(first.updatedAt + 100)
    const updated = repo.updateRoutine(db, first.id, { name: 'Later', schedule: { intervalMs: 600000 },
      enabled: false, nextRunAt: 200, budgetUsd: 1, webhookKeyHash: 'hashed' })!
    expect(updated).toMatchObject({ name: 'Later', schedule: { intervalMs: 600000 }, enabled: false,
      nextRunAt: 200, budgetUsd: 1, webhookKeyHash: 'hashed', updatedAt: first.updatedAt + 100 })
    expect(repo.updateRoutine(db, 'missing', { enabled: true })).toBeNull()
  })

  it('lists enabled due routines in schedule order, excluding nulls and future dates', () => {
    const later = routine('Later', { nextRunAt: 100 })
    const earlier = routine('Earlier', { nextRunAt: 50 })
    routine('Disabled', { nextRunAt: 10, enabled: false })
    routine('Future', { nextRunAt: 101 })
    routine('No time')
    expect(repo.listDue(db, 100)).toEqual([earlier, later])
    expect(repo.listDue(db, 49)).toEqual([])
  })

  it('records and finishes history, updates lastRunAt, limits history and cascades deletes', () => {
    const r = routine('Daily')
    const first = repo.recordRoutineRun(db, { routineId: r.id, runId: 'run-a', startedAt: 100 })
    expect(first).toMatchObject({ status: 'running', startedAt: 100, endedAt: null, output: null })
    expect(repo.getRoutine(db, r.id)!.lastRunAt).toBe(100)
    const finished = repo.finishRoutineRun(db, first.id, { status: 'succeeded', endedAt: 200, output: 'Done' })!
    expect(finished).toMatchObject({ status: 'succeeded', endedAt: 200, output: 'Done' })
    const second = repo.recordRoutineRun(db, { routineId: r.id, startedAt: 300, status: 'skipped', output: 'Missed' })
    expect(repo.listRoutineRuns(db, r.id)).toEqual([second, finished])
    expect(repo.listRoutineRuns(db, r.id, 1)).toEqual([second])
    expect(repo.finishRoutineRun(db, 'missing', { status: 'failed' })).toBeNull()
    expect(() => repo.recordRoutineRun(db, { routineId: 'missing' })).toThrow()
    expect(repo.deleteRoutine(db, r.id)).toBe(true)
    expect(repo.getRoutine(db, r.id)).toBeNull()
    expect(repo.listRoutineRuns(db, r.id)).toEqual([])
    expect(repo.deleteRoutine(db, r.id)).toBe(false)
  })

  it('rolls back routine history when updating the owning routine fails', () => {
    const r = routine('Daily')
    db.exec("CREATE TRIGGER reject_history BEFORE UPDATE ON routines BEGIN SELECT RAISE(ABORT, 'history failure'); END")
    expect(() => repo.recordRoutineRun(db, { routineId: r.id })).toThrow('history failure')
    expect(repo.listRoutineRuns(db, r.id)).toEqual([])
    expect(repo.getRoutine(db, r.id)).toEqual(r)
  })
})

describe('delegations', () => {
  it('creates, gets, updates, filters and deletes delegations', () => {
    const first = repo.createDelegation(db, { fromAnt: 'a', toAnt: 'b', depth: 1, originRunId: 'run-a' })
    const second = repo.createDelegation(db, { fromAnt: 'b', toAnt: 'c', depth: 2 })
    expect(first).toMatchObject({ status: 'open', summary: null })
    expect(repo.getDelegation(db, first.id)).toEqual(first)
    expect(repo.getDelegation(db, 'missing')).toBeNull()
    expect(repo.listDelegations(db).map(row => row.id)).toEqual([second.id, first.id])
    expect(repo.listDelegations(db, { fromAnt: 'a', toAnt: 'b', originRunId: 'run-a', status: 'open' })).toEqual([first])
    expect(repo.updateDelegation(db, first.id, { status: 'done', summary: 'Fixed' })).toMatchObject({ status: 'done', summary: 'Fixed' })
    expect(repo.listDelegations(db, { status: 'open' })).toEqual([second])
    expect(repo.updateDelegation(db, 'missing', { status: 'failed' })).toBeNull()
    expect(repo.deleteDelegation(db, first.id)).toBe(true)
    expect(repo.getDelegation(db, first.id)).toBeNull()
    expect(repo.deleteDelegation(db, first.id)).toBe(false)
  })
})
