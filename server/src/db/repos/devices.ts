import type { Db } from '../index.ts'
import { newId } from '../ids.ts'
import { decode } from './_shared.ts'

export interface Device {
  id: string
  name: string
  tokenHash: string
  userAgent: string
  createdAt: number
  lastSeenAt: number
}

export function createDevice(db: Db, input: { name: string; tokenHash: string; userAgent: string }): Device {
  const id = newId('device')
  const now = Date.now()
  db.prepare('INSERT INTO devices (id, name, token_hash, user_agent, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, input.name, input.tokenHash, input.userAgent, now, now)
  return getDevice(db, id)!
}

export function getDevice(db: Db, id: string): Device | null {
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(id)
  return row ? decode<Device>(row) : null
}

export function listDevices(db: Db): Device[] {
  return db.prepare('SELECT * FROM devices ORDER BY last_seen_at DESC').all().map((r) => decode<Device>(r))
}

export function touchDevice(db: Db, id: string, at = Date.now()): void {
  db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(at, id)
}

export function renameDevice(db: Db, id: string, name: string): void {
  db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(name, id)
}

export function deleteDevice(db: Db, id: string): boolean {
  return Number(db.prepare('DELETE FROM devices WHERE id = ?').run(id).changes) > 0
}

export function addPairingCode(db: Db, codeHash: string, expiresAt: number): void {
  db.prepare('DELETE FROM pairing_codes WHERE expires_at < ?').run(Date.now())
  db.prepare('INSERT OR REPLACE INTO pairing_codes (code_hash, expires_at, created_at) VALUES (?, ?, ?)').run(codeHash, expiresAt, Date.now())
}

/** Single use: a valid code is deleted as it's redeemed. */
export function redeemPairingCode(db: Db, codeHash: string): boolean {
  const r = db.prepare('DELETE FROM pairing_codes WHERE code_hash = ? AND expires_at >= ?').run(codeHash, Date.now())
  return Number(r.changes) > 0
}

export interface PushSubscriptionRow {
  endpoint: string
  deviceId: string | null
  keys: { p256dh: string; auth: string }
  createdAt: number
}

export function savePushSubscription(db: Db, s: { endpoint: string; deviceId: string | null; keys: { p256dh: string; auth: string } }): void {
  db.prepare('INSERT OR REPLACE INTO push_subscriptions (endpoint, device_id, keys, created_at) VALUES (?, ?, ?, ?)')
    .run(s.endpoint, s.deviceId, JSON.stringify(s.keys), Date.now())
}

export function listPushSubscriptions(db: Db): PushSubscriptionRow[] {
  return db.prepare('SELECT * FROM push_subscriptions').all().map((r) => decode<PushSubscriptionRow>(r, ['keys']))
}

export function deletePushSubscription(db: Db, endpoint: string): void {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint)
}
