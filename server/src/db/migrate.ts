import { readdirSync, readFileSync } from 'node:fs'
import type { Db } from './index.ts'
import { tx } from './index.ts'

export function migrate(db: Db, directory: string | URL = new URL('./migrations/', import.meta.url)): void {
  const files = readdirSync(directory).filter(name => name.endsWith('.sql')).sort()
  const migrations = files.map(name => {
    const match = /^(\d+)_.+\.sql$/.exec(name)
    if (!match) throw new Error(`Invalid migration filename: ${name}`)
    return { name, version: Number(match[1]) }
  })
  let previous = 0
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version <= previous || migration.version > 2147483647) {
      throw new Error(`Migration versions must increase in filename order: ${migration.name}`)
    }
    previous = migration.version
  }
  const current = Number(db.prepare('PRAGMA user_version').get()!.user_version)
  if (current > previous) throw new Error(`Database version ${current} is newer than available migrations`)
  for (const { name, version } of migrations) {
    if (version <= current) continue
    const path = typeof directory === 'string' ? `${directory}/${name}` : new URL(name, directory)
    const sql = readFileSync(path, 'utf8')
    tx(db, () => {
      db.exec(sql)
      db.exec(`PRAGMA user_version=${version}`)
    })
  }
}
