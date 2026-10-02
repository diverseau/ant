import type { SQLInputValue, SQLOutputValue } from 'node:sqlite'
import type { Db } from '../index.ts'

export type SqlRow = Record<string, SQLOutputValue>

export function decode<T>(row: SqlRow, json: readonly string[] = [], booleans: readonly string[] = []): T {
  const result: Record<string, unknown> = {}
  for (const [column, value] of Object.entries(row)) {
    const key = column.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
    result[key] = json.includes(key) && value !== null
      ? JSON.parse(String(value)) as unknown
      : booleans.includes(key) ? value === 1 : value
  }
  return result as T
}

export function encodeJson(value: unknown): string {
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new TypeError('Value must be JSON serializable')
  return encoded
}

export function insert(db: Db, table: string, fields: Record<string, SQLInputValue>): void {
  const columns = Object.keys(fields)
  db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .run(...Object.values(fields))
}

// Only the repository's static field map can supply column names.
export function patchRow(db: Db, table: string, id: string, patch: object,
  columns: Readonly<Record<string, string>>, json: readonly string[] = [], booleans: readonly string[] = [],
  timestamp = true): void {
  const fields: Record<string, SQLInputValue> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || !Object.hasOwn(columns, key)) continue
    fields[columns[key]] = json.includes(key) ? encodeJson(value)
      : booleans.includes(key) ? Number(value) : value as SQLInputValue
  }
  if (!Object.keys(fields).length) return
  if (timestamp) fields.updated_at = Date.now()
  db.prepare(`UPDATE ${table} SET ${Object.keys(fields).map(column => `${column} = ?`).join(', ')} WHERE id = ?`)
    .run(...Object.values(fields), id)
}

export function getRow<T>(db: Db, table: string, id: string, json: readonly string[] = [], booleans: readonly string[] = []): T | null {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)
  return row ? decode<T>(row, json, booleans) : null
}

export function limitValue(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError('Limit must be a non-negative integer')
  return limit
}
