import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { openDb, tx } from '../../src/db/index.ts'
import { migrate } from '../../src/db/migrate.ts'
import { newId } from '../../src/db/ids.ts'

const databases: DatabaseSync[] = []
const directories: string[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ant-db-test-'))
  directories.push(directory)
  return directory
}
function track(db: DatabaseSync): DatabaseSync {
  databases.push(db)
  return db
}

describe('database setup', () => {
  it('creates the full schema and sets pragmas on an in-memory database', () => {
    const db = track(openDb(':memory:'))
    expect(db.prepare('PRAGMA foreign_keys').get()!.foreign_keys).toBe(1)
    expect(db.prepare('PRAGMA busy_timeout').get()!.timeout).toBe(5000)
    expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(2)
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name)
    expect(names).toEqual(expect.arrayContaining(['ants', 'colonies', 'colony_members', 'threads', 'messages', 'messages_fts',
      'runs', 'tool_events', 'approvals', 'rules', 'routines', 'routine_runs', 'delegations', 'connectors',
      'connector_scopes', 'secrets', 'secret_scopes', 'usage_daily', 'settings']))
  })

  it('reopens a file without rerunning migrations or losing records', () => {
    const path = join(tempDirectory(), 'ant.sqlite')
    const first = openDb(path)
    try {
      expect(first.prepare('PRAGMA journal_mode').get()!.journal_mode).toBe('wal')
      first.prepare('INSERT INTO settings VALUES (?, ?)').run('sentinel', '123')
    } finally {
      first.close()
    }
    const second = track(openDb(path))
    migrate(second)
    expect(second.prepare('PRAGMA user_version').get()!.user_version).toBe(2)
    expect(second.prepare('SELECT value FROM settings WHERE key = ?').get('sentinel')!.value).toBe('123')
  })

  it('applies migration versions in filename order and never reruns an applied file', () => {
    const directory = tempDirectory()
    writeFileSync(join(directory, '010_last.sql'), 'INSERT INTO sequence VALUES (10);')
    writeFileSync(join(directory, '001_first.sql'), 'CREATE TABLE sequence (n INTEGER); INSERT INTO sequence VALUES (1);')
    writeFileSync(join(directory, '002_middle.sql'), 'INSERT INTO sequence VALUES (2);')
    const db = track(new DatabaseSync(':memory:'))
    migrate(db, directory)
    migrate(db, directory)
    expect(db.prepare('SELECT n FROM sequence ORDER BY rowid').all().map(row => row.n)).toEqual([1, 2, 10])
    expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(10)
  })

  it('rolls back both schema changes and user_version when a migration fails', () => {
    const directory = tempDirectory()
    writeFileSync(join(directory, '001_ok.sql'), 'CREATE TABLE preserved (n INTEGER);')
    writeFileSync(join(directory, '002_fail.sql'), 'CREATE TABLE rolled_back (n INTEGER); INSERT INTO missing VALUES (1);')
    const db = track(new DatabaseSync(':memory:'))
    expect(() => migrate(db, directory)).toThrow()
    expect(db.isTransaction).toBe(false)
    expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(1)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'rolled_back'").get()).toBeUndefined()
    writeFileSync(join(directory, '002_fail.sql'), 'CREATE TABLE recovered (n INTEGER);')
    migrate(db, directory)
    expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(2)
  })

  it('rejects ambiguous migration order and databases newer than the code', () => {
    const directory = tempDirectory()
    const db = track(new DatabaseSync(':memory:'))
    writeFileSync(join(directory, '001_a.sql'), 'SELECT 1;')
    writeFileSync(join(directory, '001_b.sql'), 'SELECT 1;')
    expect(() => migrate(db, directory)).toThrow('versions must increase')
    rmSync(join(directory, '001_b.sql'))
    db.exec('PRAGMA user_version=2')
    expect(() => migrate(db, directory)).toThrow('newer than available')
  })
})

describe('transactions and ids', () => {
  it('commits a result and rolls back failed writes', () => {
    const db = track(openDb(':memory:'))
    expect(tx(db, () => {
      db.exec("INSERT INTO settings VALUES ('ok', '1')")
      return 42
    })).toBe(42)
    expect(() => tx(db, () => {
      db.exec("INSERT INTO settings VALUES ('rollback', '2')")
      throw new Error('fail')
    })).toThrow('fail')
    expect(db.prepare('SELECT key FROM settings').all().map(row => row.key)).toEqual(['ok'])
    expect(db.isTransaction).toBe(false)
  })

  it('composes nested transactions and isolates a caught nested failure', () => {
    const db = track(openDb(':memory:'))
    tx(db, () => {
      db.exec("INSERT INTO settings VALUES ('outer', '1')")
      expect(() => tx(db, () => {
        db.exec("INSERT INTO settings VALUES ('inner_failed', '2')")
        throw new Error('nested')
      })).toThrow('nested')
      tx(db, () => db.exec("INSERT INTO settings VALUES ('inner_ok', '3')"))
    })
    expect(db.prepare('SELECT key FROM settings ORDER BY key').all().map(row => row.key)).toEqual(['inner_ok', 'outer'])
    expect(() => tx(db, () => {
      tx(db, () => db.exec("INSERT INTO settings VALUES ('nested_success', '4')"))
      throw new Error('outer failure')
    })).toThrow('outer failure')
    expect(db.prepare("SELECT key FROM settings WHERE key = 'nested_success'").get()).toBeUndefined()
  })

  it('generates unique prefixed ids with exactly 16 URL-safe random characters', () => {
    const ids = Array.from({ length: 1000 }, () => newId('ant'))
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^ant_[A-Za-z0-9_-]{16}$/)
  })
})
