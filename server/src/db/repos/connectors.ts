import { tx } from '../index.ts'
import type { Db } from '../index.ts'
import { newId } from '../ids.ts'
import { decode, encodeJson, insert, patchRow } from './_shared.ts'

export interface Connector {
  id: string
  name: string
  transport: 'http' | 'stdio'
  config: unknown
  status: string
  allAnts: boolean
  antIds: string[]
  createdAt: number
  updatedAt: number
}
export type CreateConnectorInput = Pick<Connector, 'name' | 'transport' | 'config' | 'status'> & Partial<Pick<Connector, 'allAnts' | 'antIds'>>
export type ConnectorPatch = Partial<Omit<Connector, 'id' | 'createdAt' | 'updatedAt'>>

function replaceScopes(db: Db, id: string, antIds: readonly string[]): void {
  db.prepare('DELETE FROM connector_scopes WHERE connector_id = ?').run(id)
  const statement = db.prepare('INSERT INTO connector_scopes (connector_id, ant_id) VALUES (?, ?)')
  for (const antId of new Set(antIds)) statement.run(id, antId)
}

export function createConnector(db: Db, input: CreateConnectorInput): Connector {
  return tx(db, () => {
    const id = newId('connector')
    const now = Date.now()
    insert(db, 'connectors', { id, name: input.name,
      transport: input.transport, config: encodeJson(input.config), status: input.status,
      all_ants: Number(input.allAnts ?? true), created_at: now, updated_at: now })
    replaceScopes(db, id, input.antIds ?? [])
    return getConnector(db, id)!
  })
}

export function getConnector(db: Db, id: string): Connector | null {
  const row = db.prepare('SELECT * FROM connectors WHERE id = ?').get(id)
  if (!row) return null
  const record = decode<Omit<Connector, 'antIds'>>(row, ['config'], ['allAnts'])
  const antIds = db.prepare('SELECT ant_id FROM connector_scopes WHERE connector_id = ? ORDER BY ant_id').all(id).map(scope => String(scope.ant_id))
  return { ...record, antIds }
}

export function getConnectorByName(db: Db, name: string): Connector | null {
  const row = db.prepare('SELECT id FROM connectors WHERE name = ?').get(name)
  return row ? getConnector(db, String(row.id)) : null
}

export function listConnectors(db: Db, options: { antId?: string } = {}): Connector[] {
  const rows = options.antId === undefined
    ? db.prepare('SELECT id FROM connectors ORDER BY created_at, rowid').all()
    : db.prepare(`SELECT id FROM connectors WHERE all_ants = 1 OR EXISTS (
        SELECT 1 FROM connector_scopes WHERE connector_id = connectors.id AND ant_id = ?
      ) ORDER BY created_at, rowid`).all(options.antId)
  return rows.map(row => getConnector(db, String(row.id))!)
}

export function updateConnector(db: Db, id: string, patch: ConnectorPatch): Connector | null {
  return tx(db, () => {
    if (!getConnector(db, id)) return null
    patchRow(db, 'connectors', id, patch, { name: 'name', allAnts: 'all_ants',
      transport: 'transport', config: 'config', status: 'status',
    }, ['config'], ['allAnts'])
    if (patch.antIds !== undefined) {
      replaceScopes(db, id, patch.antIds)
      db.prepare('UPDATE connectors SET updated_at = ? WHERE id = ?').run(Date.now(), id)
    }
    return getConnector(db, id)
  })
}

export function setConnectorScopes(db: Db, id: string, antIds: string[]): Connector | null {
  return updateConnector(db, id, { antIds })
}

export function deleteConnector(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM connectors WHERE id = ?').run(id).changes > 0
}
