import { tx } from '../index.ts'
import type { Db } from '../index.ts'
import { newId } from '../ids.ts'
import { decode, encodeJson, getRow, insert } from './_shared.ts'

export interface Approval {
  id: string
  runId: string | null
  antId: string
  threadId: string
  messageId: string | null
  toolName: string
  input: unknown
  behaviour: 'ask' | 'handoff'
  status: 'pending' | 'once' | 'always' | 'deny' | 'expired'
  expiresAt: number | null
  decidedAt: number | null
  createdAt: number
}
export type CreateApprovalInput = Pick<Approval, 'antId' | 'threadId' | 'toolName' | 'input' | 'behaviour'> & Partial<Pick<Approval, 'runId' | 'messageId' | 'expiresAt'>>

export function createApproval(db: Db, input: CreateApprovalInput): Approval {
  const id = newId('approval')
  insert(db, 'approvals', { id, run_id: input.runId ?? null, ant_id: input.antId, thread_id: input.threadId,
    message_id: input.messageId ?? null, tool_name: input.toolName, input: encodeJson(input.input),
    behaviour: input.behaviour, status: 'pending', expires_at: input.expiresAt ?? null,
    decided_at: null, created_at: Date.now() })
  return getApproval(db, id)!
}

export function getApproval(db: Db, id: string): Approval | null {
  return getRow<Approval>(db, 'approvals', id, ['input'])
}

export function listApprovals(db: Db, options: { status?: Approval['status']; antId?: string } = {}): Approval[] {
  const where: string[] = []
  const args: string[] = []
  if (options.status !== undefined) { where.push('status = ?'); args.push(options.status) }
  if (options.antId !== undefined) { where.push('ant_id = ?'); args.push(options.antId) }
  return db.prepare(`SELECT * FROM approvals ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at, rowid`)
    .all(...args).map(row => decode<Approval>(row, ['input']))
}

export function decideApproval(db: Db, id: string, status: Exclude<Approval['status'], 'pending'>): Approval | null {
  if (!['once', 'always', 'deny', 'expired'].includes(status)) throw new TypeError('Invalid approval decision')
  const row = db.prepare("UPDATE approvals SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending' RETURNING *")
    .get(status, Date.now(), id)
  return row ? decode<Approval>(row, ['input']) : null
}

export function expireDue(db: Db, now: number): string[] {
  return tx(db, () => {
    const ids = db.prepare("SELECT id FROM approvals WHERE status = 'pending' AND expires_at <= ? ORDER BY expires_at, rowid")
      .all(now).map(row => String(row.id))
    db.prepare("UPDATE approvals SET status = 'expired', decided_at = ? WHERE status = 'pending' AND expires_at <= ?").run(now, now)
    return ids
  })
}
