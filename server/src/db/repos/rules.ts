import type { Db } from '../index.ts'
import { newId } from '../ids.ts'
import { decode, getRow, insert } from './_shared.ts'

export interface Rule {
  id: string
  scope: 'global' | 'ant'
  antId: string | null
  pattern: string
  behaviour: 'allow' | 'ask' | 'handoff' | 'deny'
  source: 'default' | 'user' | 'admin'
  note: string | null
  createdAt: number
}
export type AddRuleInput = Pick<Rule, 'scope' | 'pattern' | 'behaviour' | 'source'> & Partial<Pick<Rule, 'antId' | 'note'>>

export function addRule(db: Db, input: AddRuleInput): Rule {
  const id = newId('rule')
  insert(db, 'rules', { id, scope: input.scope, ant_id: input.antId ?? null, pattern: input.pattern,
    behaviour: input.behaviour, source: input.source, note: input.note ?? null, created_at: Date.now() })
  return getRow<Rule>(db, 'rules', id)!
}

export function listRules(db: Db, options: { antId?: string } = {}): Rule[] {
  const rows = options.antId === undefined
    ? db.prepare('SELECT * FROM rules ORDER BY created_at, rowid').all()
    : db.prepare("SELECT * FROM rules WHERE scope = 'global' OR (scope = 'ant' AND ant_id = ?) ORDER BY created_at, rowid").all(options.antId)
  return rows.map(row => decode<Rule>(row))
}

export function deleteRule(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM rules WHERE id = ?').run(id).changes > 0
}
