import { tx } from '../index.ts'
import type { Db } from '../index.ts'
import { newId } from '../ids.ts'
import { decode, insert, patchRow } from './_shared.ts'

export interface Secret {
  id: string
  name: string
  description: string
  ciphertext: Uint8Array
  allAnts: boolean
  antIds: string[]
  createdAt: number
  updatedAt: number
}
export type CreateSecretInput = Pick<Secret, 'name' | 'description' | 'ciphertext'> & Partial<Pick<Secret, 'allAnts' | 'antIds'>>
export type SecretPatch = Partial<Omit<Secret, 'id' | 'createdAt' | 'updatedAt'>>

function replaceScopes(db: Db, id: string, antIds: readonly string[]): void {
  db.prepare('DELETE FROM secret_scopes WHERE secret_id = ?').run(id)
  const statement = db.prepare('INSERT INTO secret_scopes (secret_id, ant_id) VALUES (?, ?)')
  for (const antId of new Set(antIds)) statement.run(id, antId)
}

export function createSecret(db: Db, input: CreateSecretInput): Secret {
  return tx(db, () => {
    const id = newId('secret')
    const now = Date.now()
    insert(db, 'secrets', { id, name: input.name,
      description: input.description, ciphertext: input.ciphertext,
      all_ants: Number(input.allAnts ?? false), created_at: now, updated_at: now })
    replaceScopes(db, id, input.antIds ?? [])
    return getSecret(db, id)!
  })
}

export function getSecret(db: Db, id: string): Secret | null {
  const row = db.prepare('SELECT * FROM secrets WHERE id = ?').get(id)
  if (!row) return null
  const record = decode<Omit<Secret, 'antIds'>>(row, [], ['allAnts'])
  const antIds = db.prepare('SELECT ant_id FROM secret_scopes WHERE secret_id = ? ORDER BY ant_id').all(id).map(scope => String(scope.ant_id))
  return { ...record, antIds, ciphertext: new Uint8Array(record.ciphertext) }
}

export function getSecretByName(db: Db, name: string): Secret | null {
  const row = db.prepare('SELECT id FROM secrets WHERE name = ?').get(name)
  return row ? getSecret(db, String(row.id)) : null
}

export function listSecrets(db: Db, options: { antId?: string } = {}): Secret[] {
  const rows = options.antId === undefined
    ? db.prepare('SELECT id FROM secrets ORDER BY created_at, rowid').all()
    : db.prepare(`SELECT id FROM secrets WHERE all_ants = 1 OR EXISTS (
        SELECT 1 FROM secret_scopes WHERE secret_id = secrets.id AND ant_id = ?
      ) ORDER BY created_at, rowid`).all(options.antId)
  return rows.map(row => getSecret(db, String(row.id))!)
}

export function updateSecret(db: Db, id: string, patch: SecretPatch): Secret | null {
  return tx(db, () => {
    if (!getSecret(db, id)) return null
    patchRow(db, 'secrets', id, patch, { name: 'name', allAnts: 'all_ants',
      description: 'description', ciphertext: 'ciphertext',
    }, [], ['allAnts'])
    if (patch.antIds !== undefined) {
      replaceScopes(db, id, patch.antIds)
      db.prepare('UPDATE secrets SET updated_at = ? WHERE id = ?').run(Date.now(), id)
    }
    return getSecret(db, id)
  })
}

export function setSecretScopes(db: Db, id: string, antIds: string[]): Secret | null {
  return updateSecret(db, id, { antIds })
}

export function deleteSecret(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM secrets WHERE id = ?').run(id).changes > 0
}
