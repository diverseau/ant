import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb, tx } from '../../src/db/index.ts'
import type { Db } from '../../src/db/index.ts'
import * as repo from '../../src/db/repos/index.ts'

let db: Db
beforeEach(() => { db = openDb(':memory:') })
afterEach(() => { db.close(); vi.restoreAllMocks() })
function ant(slug: string): repo.Ant {
  return repo.createAnt(db, { slug, name: slug, label: 'Worker', description: 'A test ant', color: 'coral',
    accessory: 'none', model: 'sonnet', effort: 'high' })
}
function thread(): repo.Thread { return repo.createThread(db, { kind: 'ant', refId: 'ant-test' }) }
function message(threadId: string, text: string): repo.Message {
  return repo.insertMessage(db, { threadId, author: 'user', kind: 'text', payload: { text, nested: [1, true, null] }, text })
}

describe('ants and colonies', () => {
  it('creates, gets, lists, updates and archives ants with real booleans', () => {
    const first = ant('chief')
    const second = ant('fixer')
    expect(first).toMatchObject({ slug: 'chief', archived: false, status: 'idle', model: 'sonnet' })
    expect(first.id).toMatch(/^ant_/)
    expect(first.createdAt).toBeGreaterThan(0)
    expect(repo.getAnt(db, first.id)).toEqual(first)
    expect(repo.getAntBySlug(db, 'chief')).toEqual(first)
    expect(repo.getAnt(db, 'missing')).toBeNull()
    expect(repo.getAntBySlug(db, 'missing')).toBeNull()
    vi.spyOn(Date, 'now').mockReturnValue(first.updatedAt + 100)
    expect(repo.updateAnt(db, first.id, { name: 'Chief', status: 'working', description: 'Updated' }))
      .toMatchObject({ name: 'Chief', status: 'working', description: 'Updated', updatedAt: first.updatedAt + 100 })
    expect(() => ant('chief')).toThrow()
    expect(repo.archiveAnt(db, first.id)!.archived).toBe(true)
    expect(repo.listAnts(db)).toEqual([second])
    expect(repo.listAnts(db, { includeArchived: true })).toHaveLength(2)
    expect(repo.updateAnt(db, 'missing', { name: 'No' })).toBeNull()
    repo.updateAnt(db, first.id, { archived: false })
    expect(repo.listAnts(db)).toHaveLength(2)
  })

  it('preserves member ordering, changes lead, and cascades colony deletion', () => {
    const a = ant('a'), b = ant('b'), c = ant('c')
    const colony = repo.createColony(db, { name: 'Team', memberIds: [b.id, a.id] })
    expect(colony).toMatchObject({ memberIds: [b.id, a.id], leadAntId: b.id })
    expect(repo.getColony(db, colony.id)).toEqual(colony)
    expect(repo.listColonies(db)).toEqual([colony])
    expect(repo.setLead(db, colony.id, a.id)!.leadAntId).toBe(a.id)
    expect(repo.setMembers(db, colony.id, [c.id, b.id])!).toMatchObject({ memberIds: [c.id, b.id], leadAntId: c.id })
    expect(repo.setMembers(db, colony.id, [])!).toMatchObject({ memberIds: [], leadAntId: null })
    repo.setMembers(db, colony.id, [a.id])
    expect(repo.deleteColony(db, colony.id)).toBe(true)
    expect(repo.getColony(db, colony.id)).toBeNull()
    expect(db.prepare('SELECT * FROM colony_members').all()).toEqual([])
    expect(repo.deleteColony(db, colony.id)).toBe(false)
    expect(repo.setMembers(db, 'missing', [a.id])).toBeNull()
  })

  it('rolls back colony creation and member replacement on invalid members', () => {
    const a = ant('a')
    expect(() => repo.createColony(db, { name: 'Invalid', memberIds: [a.id, 'missing'] })).toThrow()
    expect(repo.listColonies(db)).toEqual([])
    const colony = repo.createColony(db, { name: 'Valid', memberIds: [a.id], leadAntId: null })
    expect(colony.leadAntId).toBeNull()
    expect(() => repo.setMembers(db, colony.id, ['missing'])).toThrow()
    expect(repo.getColony(db, colony.id)).toEqual(colony)
    expect(() => repo.setMembers(db, colony.id, [a.id, a.id])).toThrow()
    expect(repo.getColony(db, colony.id)).toEqual(colony)
  })
})

describe('threads', () => {
  it('gets by reference, updates, and lists pinned first then most recently updated', () => {
    const first = thread()
    const second = repo.createThread(db, { kind: 'colony', refId: 'colony-test', pinned: true })
    const third = repo.createThread(db, { kind: 'ant', refId: 'another' })
    expect(repo.getThread(db, first.id)).toEqual(first)
    expect(repo.getThreadByRef(db, 'ant', first.refId)).toEqual(first)
    expect(repo.getThreadByRef(db, 'colony', first.refId)).toBeNull()
    expect(repo.updateThread(db, first.id, { section: 'Work', pinned: true })).toMatchObject({ section: 'Work', pinned: true })
    repo.bumpThread(db, first.id, 100)
    repo.bumpThread(db, second.id, 200)
    repo.bumpThread(db, third.id, 300)
    expect(repo.listThreads(db).map(row => row.id)).toEqual([second.id, first.id, third.id])
    repo.updateThread(db, first.id, { pinned: false, section: null })
    repo.bumpThread(db, first.id, 400)
    expect(repo.listThreads(db).map(row => row.id)).toEqual([second.id, first.id, third.id])
    expect(repo.updateThread(db, 'missing', { pinned: true })).toBeNull()
  })

  it('increments unread atomically and records reads without reordering activity', () => {
    const t = thread()
    expect(repo.incrementUnread(db, t.id)!.unread).toBe(1)
    expect(repo.incrementUnread(db, t.id)!.unread).toBe(2)
    expect(repo.markRead(db, t.id, 123)).toMatchObject({ unread: 0, lastReadAt: 123, updatedAt: t.updatedAt })
    expect(repo.incrementUnread(db, 'missing')).toBeNull()
    expect(repo.deleteThread(db, t.id)).toBe(true)
    expect(repo.getThread(db, t.id)).toBeNull()
    expect(repo.deleteThread(db, t.id)).toBe(false)
  })
})

describe('messages and search', () => {
  it('round trips JSON, defaults text, updates fields, and bumps the thread', () => {
    const t = thread()
    vi.spyOn(Date, 'now').mockReturnValue(t.updatedAt + 100)
    const m = message(t.id, 'hello')
    expect(repo.getMessage(db, m.id)).toEqual(m)
    expect(m.payload).toEqual({ text: 'hello', nested: [1, true, null] })
    expect(repo.getThread(db, t.id)!.updatedAt).toBe(m.createdAt)
    const empty = repo.insertMessage(db, { threadId: t.id, author: 'system', kind: 'card', payload: null })
    expect(empty).toMatchObject({ text: '', payload: null, runId: null })
    expect(repo.updateMessage(db, m.id, { text: 'updated', payload: ['data', false] }))
      .toMatchObject({ text: 'updated', payload: ['data', false], createdAt: m.createdAt })
    expect(repo.updateMessage(db, 'missing', { text: 'gone' })).toBeNull()
    expect(repo.getMessage(db, 'missing')).toBeNull()
  })

  it('returns newest pages oldest to newest with stable id cursors at tied timestamps', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const t = thread()
    const messages = Array.from({ length: 6 }, (_, i) => message(t.id, `message ${i}`))
    expect(repo.listMessages(db, t.id, { limit: 2 })).toEqual(messages.slice(4))
    expect(repo.listMessages(db, t.id, { before: messages[4].id, limit: 2 })).toEqual(messages.slice(2, 4))
    expect(repo.listMessages(db, t.id, { before: messages[2].id, limit: 2 })).toEqual(messages.slice(0, 2))
    expect(repo.listMessages(db, t.id, { before: messages[0].id })).toEqual([])
    expect(repo.listMessages(db, t.id, { before: 1000 })).toEqual([])
    expect(repo.listMessages(db, t.id, { before: 1001 })).toEqual(messages)
    expect(repo.listMessages(db, t.id, { before: 'missing' })).toEqual([])
    const other = thread()
    const wrongThread = message(other.id, 'wrong thread')
    expect(repo.listMessages(db, t.id, { before: wrongThread.id })).toEqual([])
    expect(repo.listMessages(db, t.id, { limit: 0 })).toEqual([])
    expect(() => repo.listMessages(db, t.id, { limit: -1 })).toThrow(RangeError)
  })

  it('uses default pagination limits and orders different timestamps', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1)
    const t = thread()
    const messages = Array.from({ length: 55 }, (_, i) => {
      now.mockReturnValue(100 + i)
      return message(t.id, `${i}`)
    })
    expect(repo.listMessages(db, t.id)).toEqual(messages.slice(5))
    expect(repo.listMessages(db, t.id, { before: 105 })).toEqual(messages.slice(0, 5))
  })

  it('searches plain terms, safely handles FTS syntax, and filters by thread', () => {
    const t = thread(), other = thread()
    const found = message(t.id, 'alpha beta greeting')
    message(other.id, 'alpha beta elsewhere')
    message(t.id, 'alpha OR beta')
    for (const query of ['"alpha" beta', 'alpha* -beta', 'alpha:beta', 'alpha NEAR(beta)', '"', '* - :', '']) {
      expect(() => repo.searchMessages(db, query)).not.toThrow()
    }
    expect(repo.searchMessages(db, '"alpha"*: -beta', { threadId: t.id }).map(result => result.message.id))
      .toEqual(expect.arrayContaining([found.id]))
    expect(repo.searchMessages(db, 'alpha OR beta', { threadId: t.id })).toHaveLength(1)
    const result = repo.searchMessages(db, 'greeting')[0]
    expect(result.message).toEqual(found)
    expect(result.snippet).toContain('<mark>greeting</mark>')
    expect(repo.searchMessages(db, '* - :')).toEqual([])
    expect(repo.searchMessages(db, 'alpha', { limit: 1 })).toHaveLength(1)
    expect(repo.searchMessages(db, 'alpha', { limit: 0 })).toEqual([])
  })

  it('synchronizes FTS after updates, direct deletes and thread cascade deletes', () => {
    const t = thread()
    const m = message(t.id, 'oldterm')
    expect(repo.searchMessages(db, 'oldterm')).toHaveLength(1)
    repo.updateMessage(db, m.id, { text: 'newterm' })
    expect(repo.searchMessages(db, 'oldterm')).toEqual([])
    expect(repo.searchMessages(db, 'newterm')[0].message.id).toBe(m.id)
    const direct = message(t.id, 'directterm')
    db.prepare('DELETE FROM messages WHERE id = ?').run(direct.id)
    expect(repo.searchMessages(db, 'directterm')).toEqual([])
    repo.deleteThread(db, t.id)
    expect(repo.getMessage(db, m.id)).toBeNull()
    expect(repo.searchMessages(db, 'newterm')).toEqual([])
    expect(db.prepare("SELECT rowid FROM messages_fts WHERE messages_fts MATCH 'newterm'").all()).toEqual([])
    db.exec("INSERT INTO messages_fts(messages_fts, rank) VALUES ('integrity-check', 1)")
  })

  it('rolls back message and FTS insertion when the thread bump fails', () => {
    const t = thread()
    db.exec("CREATE TRIGGER reject_bump BEFORE UPDATE ON threads BEGIN SELECT RAISE(ABORT, 'bump failure'); END")
    expect(() => message(t.id, 'rolledback')).toThrow('bump failure')
    expect(repo.listMessages(db, t.id)).toEqual([])
    expect(repo.searchMessages(db, 'rolledback')).toEqual([])
    expect(repo.getThread(db, t.id)).toEqual(t)
  })

  it('supports repository operations in a caller transaction and rejects invalid JSON', () => {
    const t = thread()
    expect(() => tx(db, () => {
      message(t.id, 'nestedrollback')
      throw new Error('abort')
    })).toThrow('abort')
    expect(repo.listMessages(db, t.id)).toEqual([])
    expect(repo.searchMessages(db, 'nestedrollback')).toEqual([])
    expect(() => repo.insertMessage(db, { threadId: t.id, author: 'user', kind: 'text', payload: undefined })).toThrow(TypeError)
    expect(() => message('missing', 'invalid')).toThrow()
    expect(db.isTransaction).toBe(false)
  })
})
