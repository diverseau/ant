import type { Db } from '../index.ts'
import { encodeJson } from './_shared.ts'

export function getSetting<T>(db: Db, key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? JSON.parse(String(row.value)) as T : fallback
}

export function setSetting<T>(db: Db, key: string, value: T): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .run(key, encodeJson(value))
}
