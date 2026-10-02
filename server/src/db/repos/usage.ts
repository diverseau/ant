import type { Db } from '../index.ts'
import { decode } from './_shared.ts'

export interface DailyUsage {
  date: string
  antId: string
  costUsd: number
  tokens: number
  runs: number
}

export function addUsage(db: Db, input: Omit<DailyUsage, 'runs'>): DailyUsage {
  const row = db.prepare(`INSERT INTO usage_daily (date, ant_id, cost_usd, tokens, runs) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT (date, ant_id) DO UPDATE SET cost_usd = usage_daily.cost_usd + excluded.cost_usd,
      tokens = usage_daily.tokens + excluded.tokens, runs = usage_daily.runs + 1 RETURNING *`)
    .get(input.date, input.antId, input.costUsd, input.tokens)!
  return decode<DailyUsage>(row)
}

// ISO calendar dates, inclusive at both ends, one row per date and ant.
export function usageRange(db: Db, from: string, to: string): DailyUsage[] {
  return db.prepare('SELECT * FROM usage_daily WHERE date >= ? AND date <= ? ORDER BY date, ant_id')
    .all(from, to).map(row => decode<DailyUsage>(row))
}
