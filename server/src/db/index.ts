import { DatabaseSync } from 'node:sqlite'
import { migrate } from './migrate.ts'

export type Db = DatabaseSync

export function openDb(path: string): Db {
  const db = new DatabaseSync(path)
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000')
    migrate(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

let savepointId = 0

// Savepoints allow callers to compose repository writes in an outer transaction.
export function tx<T>(db: Db, fn: () => T): T {
  const savepoint = db.isTransaction ? `ant_tx_${++savepointId}` : null
  db.exec(savepoint ? `SAVEPOINT ${savepoint}` : 'BEGIN')
  try {
    const result = fn()
    db.exec(savepoint ? `RELEASE ${savepoint}` : 'COMMIT')
    return result
  } catch (error) {
    if (savepoint) {
      db.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`)
    } else {
      db.exec('ROLLBACK')
    }
    throw error
  }
}
