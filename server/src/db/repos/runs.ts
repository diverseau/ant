import type { Db } from '../index.ts'
import { newId } from '../ids.ts'
import { decode, encodeJson, getRow, insert, limitValue, patchRow } from './_shared.ts'

export interface Run {
  id: string
  antId: string
  threadId: string | null
  sessionId: string | null
  trigger: 'user' | 'ant' | 'routine' | 'webhook' | 'channel'
  parentRunId: string | null
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'stopped'
  startedAt: number | null
  endedAt: number | null
  costUsd: number
  tokensIn: number
  tokensOut: number
  turns: number
  error: string | null
  createdAt: number
}
export type CreateRunInput = Pick<Run, 'antId' | 'trigger'> & Partial<Pick<Run, 'threadId' | 'sessionId' | 'parentRunId' | 'status' | 'startedAt' | 'endedAt' | 'costUsd' | 'tokensIn' | 'tokensOut' | 'turns' | 'error'>>
export type RunPatch = Partial<Omit<Run, 'id' | 'createdAt'>>

export function createRun(db: Db, input: CreateRunInput): Run {
  const id = newId('run')
  const now = Date.now()
  insert(db, 'runs', {
    id,
    ant_id: input.antId,
    thread_id: input.threadId ?? null,
    session_id: input.sessionId ?? null,
    trigger: input.trigger,
    parent_run_id: input.parentRunId ?? null,
    status: input.status ?? 'queued',
    started_at: input.startedAt ?? null,
    ended_at: input.endedAt ?? null,
    cost_usd: input.costUsd ?? 0,
    tokens_in: input.tokensIn ?? 0,
    tokens_out: input.tokensOut ?? 0,
    turns: input.turns ?? 0,
    error: input.error ?? null,
    created_at: now,
  })
  return getRun(db, id)!
}

export function getRun(db: Db, id: string): Run | null {
  return getRow<Run>(db, 'runs', id, [], [])
}

export function updateRun(db: Db, id: string, patch: RunPatch): Run | null {
  patchRow(db, 'runs', id, patch, {
    antId: 'ant_id',
    threadId: 'thread_id',
    sessionId: 'session_id',
    trigger: 'trigger',
    parentRunId: 'parent_run_id',
    status: 'status',
    startedAt: 'started_at',
    endedAt: 'ended_at',
    costUsd: 'cost_usd',
    tokensIn: 'tokens_in',
    tokensOut: 'tokens_out',
    turns: 'turns',
    error: 'error',
  }, [], [], false)
  return getRun(db, id)
}

export function listRuns(db: Db, options: { antId?: string; threadId?: string; limit?: number } = {}): Run[] {
  const where: string[] = []
  const args: (string | number)[] = []
  if (options.antId !== undefined) { where.push('ant_id = ?'); args.push(options.antId) }
  if (options.threadId !== undefined) { where.push('thread_id = ?'); args.push(options.threadId) }
  args.push(limitValue(options.limit ?? 50))
  return db.prepare(`SELECT * FROM runs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, rowid DESC LIMIT ?`)
    .all(...args).map(row => decode<Run>(row))
}

export interface ToolEvent {
  id: string
  runId: string
  toolUseId: string
  name: string
  input: unknown
  status: 'running' | 'ok' | 'error' | 'denied'
  durationMs: number | null
  outputSummary: string | null
  createdAt: number
}
export type AddToolEventInput = Pick<ToolEvent, 'runId' | 'toolUseId' | 'name' | 'input'> & Partial<Pick<ToolEvent, 'status' | 'durationMs' | 'outputSummary'>>

export function addToolEvent(db: Db, input: AddToolEventInput): ToolEvent {
  const id = newId('tool')
  insert(db, 'tool_events', { id, run_id: input.runId, tool_use_id: input.toolUseId, name: input.name,
    input: encodeJson(input.input), status: input.status ?? 'running', duration_ms: input.durationMs ?? null,
    output_summary: input.outputSummary ?? null, created_at: Date.now() })
  return getRow<ToolEvent>(db, 'tool_events', id, ['input'])!
}

export function updateToolEvent(db: Db, id: string, patch: Partial<Pick<ToolEvent, 'input' | 'status' | 'durationMs' | 'outputSummary'>>): ToolEvent | null {
  patchRow(db, 'tool_events', id, patch, { input: 'input', status: 'status', durationMs: 'duration_ms', outputSummary: 'output_summary' }, ['input'], [], false)
  return getRow<ToolEvent>(db, 'tool_events', id, ['input'])
}

export function listToolEvents(db: Db, runId: string): ToolEvent[] {
  return db.prepare('SELECT * FROM tool_events WHERE run_id = ? ORDER BY created_at, rowid').all(runId)
    .map(row => decode<ToolEvent>(row, ['input']))
}
