import type { Db } from '../index.ts'
import { newId } from '../ids.ts'
import { decode, getRow, insert, patchRow } from './_shared.ts'

export interface Thread {
  id: string
  kind: 'ant' | 'colony'
  refId: string
  pinned: boolean
  section: string | null
  unread: number
  lastReadAt: number | null
  createdAt: number
  updatedAt: number
}
export type CreateThreadInput = Pick<Thread, 'kind' | 'refId'> & Partial<Pick<Thread, 'pinned' | 'section' | 'unread' | 'lastReadAt'>>
export type ThreadPatch = Partial<Omit<Thread, 'id' | 'createdAt' | 'updatedAt'>>

export function createThread(db: Db, input: CreateThreadInput): Thread {
  const id = newId('thread')
  const now = Date.now()
  insert(db, 'threads', { id, kind: input.kind, ref_id: input.refId, pinned: Number(input.pinned ?? false),
    section: input.section ?? null, unread: input.unread ?? 0, last_read_at: input.lastReadAt ?? null,
    created_at: now, updated_at: now })
  return getThread(db, id)!
}

export function getThread(db: Db, id: string): Thread | null {
  return getRow<Thread>(db, 'threads', id, [], ['pinned'])
}

export function getThreadByRef(db: Db, kind: Thread['kind'], refId: string): Thread | null {
  const row = db.prepare('SELECT * FROM threads WHERE kind = ? AND ref_id = ? ORDER BY rowid LIMIT 1').get(kind, refId)
  return row ? decode<Thread>(row, [], ['pinned']) : null
}

export function listThreads(db: Db): Thread[] {
  return db.prepare('SELECT * FROM threads ORDER BY pinned DESC, updated_at DESC, rowid DESC').all()
    .map(row => decode<Thread>(row, [], ['pinned']))
}

export function updateThread(db: Db, id: string, patch: ThreadPatch): Thread | null {
  patchRow(db, 'threads', id, patch, { kind: 'kind', refId: 'ref_id', pinned: 'pinned', section: 'section',
    unread: 'unread', lastReadAt: 'last_read_at' }, [], ['pinned'])
  return getThread(db, id)
}

export function bumpThread(db: Db, id: string, at: number): Thread | null {
  db.prepare('UPDATE threads SET updated_at = ? WHERE id = ?').run(at, id)
  return getThread(db, id)
}

export function markRead(db: Db, id: string, at: number = Date.now()): Thread | null {
  db.prepare('UPDATE threads SET unread = 0, last_read_at = ? WHERE id = ?').run(at, id)
  return getThread(db, id)
}

export function incrementUnread(db: Db, id: string): Thread | null {
  db.prepare('UPDATE threads SET unread = unread + 1 WHERE id = ?').run(id)
  return getThread(db, id)
}

export function deleteThread(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM threads WHERE id = ?').run(id).changes > 0
}
