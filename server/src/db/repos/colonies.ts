import { tx } from '../index.ts'
import type { Db } from '../index.ts'
import { newId } from '../ids.ts'
import { getRow, insert } from './_shared.ts'

export interface Colony {
  id: string
  name: string
  leadAntId: string | null
  memberIds: string[]
  createdAt: number
  updatedAt: number
}

function replaceMembers(db: Db, id: string, memberIds: readonly string[]): void {
  db.prepare('DELETE FROM colony_members WHERE colony_id = ?').run(id)
  const statement = db.prepare('INSERT INTO colony_members (colony_id, ant_id, position) VALUES (?, ?, ?)')
  memberIds.forEach((antId, position) => statement.run(id, antId, position))
}

export function createColony(db: Db, input: { name: string; memberIds: string[]; leadAntId?: string | null }): Colony {
  return tx(db, () => {
    const id = newId('colony')
    const now = Date.now()
    insert(db, 'colonies', { id, name: input.name, lead_ant_id: input.leadAntId === undefined ? input.memberIds[0] ?? null : input.leadAntId,
      created_at: now, updated_at: now })
    replaceMembers(db, id, input.memberIds)
    return getColony(db, id)!
  })
}

export function getColony(db: Db, id: string): Colony | null {
  const colony = getRow<Omit<Colony, 'memberIds'>>(db, 'colonies', id)
  if (!colony) return null
  const memberIds = db.prepare('SELECT ant_id FROM colony_members WHERE colony_id = ? ORDER BY position').all(id)
    .map(row => String(row.ant_id))
  return { ...colony, memberIds }
}

export function listColonies(db: Db): Colony[] {
  return db.prepare('SELECT id FROM colonies ORDER BY created_at, rowid').all().map(row => getColony(db, String(row.id))!)
}

export function setMembers(db: Db, id: string, memberIds: string[]): Colony | null {
  return tx(db, () => {
    const colony = getColony(db, id)
    if (!colony) return null
    replaceMembers(db, id, memberIds)
    const lead = colony.leadAntId !== null && memberIds.includes(colony.leadAntId) ? colony.leadAntId : memberIds[0] ?? null
    db.prepare('UPDATE colonies SET lead_ant_id = ?, updated_at = ? WHERE id = ?').run(lead, Date.now(), id)
    return getColony(db, id)
  })
}

export function setLead(db: Db, id: string, leadAntId: string | null): Colony | null {
  db.prepare('UPDATE colonies SET lead_ant_id = ?, updated_at = ? WHERE id = ?').run(leadAntId, Date.now(), id)
  return getColony(db, id)
}

export function deleteColony(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM colonies WHERE id = ?').run(id).changes > 0
}
