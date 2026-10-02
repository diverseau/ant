import type { Db } from '../index.ts'
import { newId } from '../ids.ts'
import { decode, getRow, insert, patchRow } from './_shared.ts'

export interface Delegation {
  id: string
  fromAnt: string
  toAnt: string
  originRunId: string | null
  depth: number
  status: 'open' | 'done' | 'failed' | 'cancelled'
  summary: string | null
  createdAt: number
  updatedAt: number
}
export type CreateDelegationInput = Pick<Delegation, 'fromAnt' | 'toAnt' | 'depth'> & Partial<Pick<Delegation, 'originRunId' | 'status' | 'summary'>>
export type DelegationPatch = Partial<Omit<Delegation, 'id' | 'createdAt' | 'updatedAt'>>

export function createDelegation(db: Db, input: CreateDelegationInput): Delegation {
  const id = newId('delegation')
  const now = Date.now()
  insert(db, 'delegations', {
    id,
    from_ant: input.fromAnt,
    to_ant: input.toAnt,
    origin_run_id: input.originRunId ?? null,
    depth: input.depth,
    status: input.status ?? 'open',
    summary: input.summary ?? null,
    created_at: now,
    updated_at: now,
  })
  return getDelegation(db, id)!
}

export function getDelegation(db: Db, id: string): Delegation | null {
  return getRow<Delegation>(db, 'delegations', id, [], [])
}

export function updateDelegation(db: Db, id: string, patch: DelegationPatch): Delegation | null {
  patchRow(db, 'delegations', id, patch, {
    fromAnt: 'from_ant',
    toAnt: 'to_ant',
    originRunId: 'origin_run_id',
    depth: 'depth',
    status: 'status',
    summary: 'summary',
  }, [], [], true)
  return getDelegation(db, id)
}

export function deleteDelegation(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM delegations WHERE id = ?').run(id).changes > 0
}

export function listDelegations(db: Db, options: { fromAnt?: string; toAnt?: string; originRunId?: string; status?: Delegation['status'] } = {}): Delegation[] {
  const where: string[] = []
  const args: string[] = []
  for (const [key, column] of Object.entries({ fromAnt: 'from_ant', toAnt: 'to_ant', originRunId: 'origin_run_id', status: 'status' } as const)) {
    const value = options[key as keyof typeof options]
    if (value !== undefined) { where.push(`${column} = ?`); args.push(value) }
  }
  return db.prepare(`SELECT * FROM delegations ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, rowid DESC`)
    .all(...args).map(row => decode<Delegation>(row))
}
