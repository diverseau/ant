import type { Db } from '../index.ts'
import { newId } from '../ids.ts'
import { decode, getRow, insert, patchRow } from './_shared.ts'

export interface Ant {
  id: string
  slug: string
  name: string
  label: string
  description: string
  color: string
  accessory: string
  model: string
  effort: string
  fast: boolean
  permissionMode: string
  status: string
  archived: boolean
  createdAt: number
  updatedAt: number
}
export type CreateAntInput = Omit<Ant, 'id' | 'status' | 'archived' | 'fast' | 'permissionMode' | 'createdAt' | 'updatedAt'>
  & Partial<Pick<Ant, 'status' | 'archived' | 'fast' | 'permissionMode'>>
export type AntPatch = Partial<Omit<Ant, 'id' | 'createdAt' | 'updatedAt'>>

const BOOLEANS = ['archived', 'fast']

export function createAnt(db: Db, input: CreateAntInput): Ant {
  const id = newId('ant')
  const now = Date.now()
  insert(db, 'ants', {
    id, slug: input.slug, name: input.name, label: input.label, description: input.description,
    color: input.color, accessory: input.accessory, model: input.model, effort: input.effort,
    fast: Number(input.fast ?? false), permission_mode: input.permissionMode ?? 'edits',
    status: input.status ?? 'idle', archived: Number(input.archived ?? false), created_at: now, updated_at: now,
  })
  return getAnt(db, id)!
}

export function getAnt(db: Db, id: string): Ant | null {
  return getRow<Ant>(db, 'ants', id, [], BOOLEANS)
}

export function getAntBySlug(db: Db, slug: string): Ant | null {
  const row = db.prepare('SELECT * FROM ants WHERE slug = ?').get(slug)
  return row ? decode<Ant>(row, [], BOOLEANS) : null
}

export function listAnts(db: Db, options: { includeArchived?: boolean } = {}): Ant[] {
  return db.prepare(`SELECT * FROM ants ${options.includeArchived ? '' : 'WHERE archived = 0'} ORDER BY created_at, rowid`)
    .all().map(row => decode<Ant>(row, [], BOOLEANS))
}

export function updateAnt(db: Db, id: string, patch: AntPatch): Ant | null {
  patchRow(db, 'ants', id, patch, {
    slug: 'slug', name: 'name', label: 'label', description: 'description', color: 'color',
    accessory: 'accessory', model: 'model', effort: 'effort', fast: 'fast', permissionMode: 'permission_mode',
    status: 'status', archived: 'archived',
  }, [], BOOLEANS)
  return getAnt(db, id)
}

export function archiveAnt(db: Db, id: string): Ant | null {
  return updateAnt(db, id, { archived: true })
}
