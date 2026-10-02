import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDb } from '../../src/db/index.ts'
import type { Db } from '../../src/db/index.ts'
import * as repo from '../../src/db/repos/index.ts'

let db: Db
beforeEach(() => { db = openDb(':memory:') })
afterEach(() => { db.close() })
function ant(slug: string): repo.Ant {
  return repo.createAnt(db, { slug, name: slug, label: 'Worker', description: '', color: 'coral', accessory: 'none', model: 'sonnet', effort: 'high' })
}

describe('connectors', () => {
  it('creates, gets, lists and updates configs and scopes', () => {
    const a = ant('a'), b = ant('b')
    const global = repo.createConnector(db, { name: 'Global', transport: 'http', config: { url: 'https://example.invalid' }, status: 'connected' })
    const scoped = repo.createConnector(db, { name: 'Local', transport: 'stdio', config: { command: 'test', args: ['--test'] },
      status: 'disabled', allAnts: false, antIds: [a.id] })
    expect(global).toMatchObject({ allAnts: true, antIds: [], config: { url: 'https://example.invalid' } })
    expect(repo.getConnector(db, scoped.id)).toEqual(scoped)
    expect(repo.getConnectorByName(db, 'Local')).toEqual(scoped)
    expect(repo.getConnectorByName(db, 'missing')).toBeNull()
    expect(repo.listConnectors(db)).toEqual([global, scoped])
    expect(repo.listConnectors(db, { antId: b.id })).toEqual([global])
    expect(repo.listConnectors(db, { antId: a.id })).toEqual([global, scoped])
    const updated = repo.updateConnector(db, scoped.id, { name: 'Renamed', config: { command: 'new' }, status: 'error', antIds: [b.id] })!
    expect(updated).toMatchObject({ name: 'Renamed', config: { command: 'new' }, status: 'error', antIds: [b.id], allAnts: false })
    expect(repo.setConnectorScopes(db, scoped.id, [a.id, a.id])!.antIds).toEqual([a.id])
    expect(repo.updateConnector(db, scoped.id, { allAnts: true })!.allAnts).toBe(true)
    expect(repo.listConnectors(db, { antId: b.id })).toHaveLength(2)
    expect(repo.updateConnector(db, 'missing', { status: 'error' })).toBeNull()
    expect(() => repo.createConnector(db, { name: 'Global', transport: 'http', config: {}, status: 'connected' })).toThrow()
    expect(repo.deleteConnector(db, scoped.id)).toBe(true)
    expect(repo.getConnector(db, scoped.id)).toBeNull()
    expect(db.prepare('SELECT * FROM connector_scopes WHERE connector_id = ?').all(scoped.id)).toEqual([])
    expect(repo.deleteConnector(db, scoped.id)).toBe(false)
  })

  it('rolls back both config and scopes if an invalid scope is supplied', () => {
    const a = ant('a')
    expect(() => repo.createConnector(db, { name: 'Invalid', transport: 'http', config: {}, status: 'disabled', antIds: [a.id, 'missing'] })).toThrow()
    expect(repo.listConnectors(db)).toEqual([])
    const valid = repo.createConnector(db, { name: 'Valid', transport: 'stdio', config: { command: 'original' }, status: 'connected', antIds: [a.id] })
    expect(() => repo.updateConnector(db, valid.id, { name: 'Changed', config: {}, antIds: ['missing'] })).toThrow()
    expect(repo.getConnector(db, valid.id)).toEqual(valid)
  })
})

describe('secrets', () => {
  it('stores opaque ciphertext bytes, gets, lists, updates and deletes scoped secrets', () => {
    const a = ant('a'), b = ant('b')
    const bytes = new Uint8Array([0, 255, 128, 1, 42])
    const secret = repo.createSecret(db, { name: 'TEST', description: 'Encrypted fixture', ciphertext: bytes, antIds: [a.id] })
    expect(secret).toMatchObject({ allAnts: false, antIds: [a.id], ciphertext: bytes })
    expect(secret.ciphertext).toBeInstanceOf(Uint8Array)
    expect(db.prepare('SELECT typeof(ciphertext) AS type FROM secrets WHERE id = ?').get(secret.id)!.type).toBe('blob')
    bytes[0] = 99
    expect(repo.getSecret(db, secret.id)!.ciphertext[0]).toBe(0)
    expect(repo.getSecretByName(db, 'TEST')).toEqual(secret)
    expect(repo.getSecretByName(db, 'missing')).toBeNull()
    expect(repo.listSecrets(db)).toEqual([secret])
    expect(repo.listSecrets(db, { antId: b.id })).toEqual([])
    expect(repo.listSecrets(db, { antId: a.id })).toEqual([secret])
    const updated = repo.updateSecret(db, secret.id, { description: 'New description', ciphertext: new Uint8Array([3, 4]), allAnts: true })!
    expect(updated).toMatchObject({ description: 'New description', ciphertext: new Uint8Array([3, 4]), allAnts: true })
    expect(repo.listSecrets(db, { antId: b.id })).toEqual([updated])
    expect(repo.setSecretScopes(db, secret.id, [b.id, b.id])!.antIds).toEqual([b.id])
    expect(repo.updateSecret(db, 'missing', { description: 'No' })).toBeNull()
    expect(() => repo.createSecret(db, { name: 'TEST', description: '', ciphertext: new Uint8Array() })).toThrow()
    expect(repo.deleteSecret(db, secret.id)).toBe(true)
    expect(repo.getSecret(db, secret.id)).toBeNull()
    expect(db.prepare('SELECT * FROM secret_scopes WHERE secret_id = ?').all(secret.id)).toEqual([])
    expect(repo.deleteSecret(db, secret.id)).toBe(false)
  })

  it('rolls back metadata, ciphertext and scopes on an invalid scope', () => {
    const a = ant('a')
    expect(() => repo.createSecret(db, { name: 'Invalid', description: '', ciphertext: new Uint8Array([1]), antIds: ['missing'] })).toThrow()
    expect(repo.listSecrets(db)).toEqual([])
    const original = repo.createSecret(db, { name: 'Valid', description: '', ciphertext: new Uint8Array([1]), antIds: [a.id] })
    expect(() => repo.updateSecret(db, original.id, { description: 'Changed', ciphertext: new Uint8Array([2]), antIds: ['missing'] })).toThrow()
    expect(repo.getSecret(db, original.id)).toEqual(original)
  })

  it('cascades ant deletion through membership and both scope tables', () => {
    const a = ant('a'), b = ant('b')
    const colony = repo.createColony(db, { name: 'Team', memberIds: [a.id, b.id], leadAntId: b.id })
    const connector = repo.createConnector(db, { name: 'Scoped', transport: 'http', config: {}, status: 'connected', allAnts: false, antIds: [a.id, b.id] })
    const secret = repo.createSecret(db, { name: 'Scoped', description: '', ciphertext: new Uint8Array(), antIds: [a.id, b.id] })
    db.prepare('DELETE FROM ants WHERE id = ?').run(a.id)
    expect(repo.getColony(db, colony.id)!.memberIds).toEqual([b.id])
    expect(repo.getConnector(db, connector.id)!.antIds).toEqual([b.id])
    expect(repo.getSecret(db, secret.id)!.antIds).toEqual([b.id])
  })
})

describe('usage and settings', () => {
  it('accumulates usage per date and ant and queries inclusive ordered ranges', () => {
    repo.addUsage(db, { date: '2026-10-01', antId: 'a', costUsd: 0.25, tokens: 100 })
    const accumulated = repo.addUsage(db, { date: '2026-10-01', antId: 'a', costUsd: 0.5, tokens: 200 })
    expect(accumulated).toEqual({ date: '2026-10-01', antId: 'a', costUsd: 0.75, tokens: 300, runs: 2 })
    const other = repo.addUsage(db, { date: '2026-10-01', antId: 'b', costUsd: 1, tokens: 25 })
    const later = repo.addUsage(db, { date: '2026-10-02', antId: 'a', costUsd: 0, tokens: 0 })
    repo.addUsage(db, { date: '2026-09-30', antId: 'a', costUsd: 3, tokens: 30 })
    repo.addUsage(db, { date: '2026-10-03', antId: 'a', costUsd: 4, tokens: 40 })
    expect(repo.usageRange(db, '2026-10-01', '2026-10-02')).toEqual([accumulated, other, later])
    expect(repo.usageRange(db, '2026-10-01', '2026-10-01')).toEqual([accumulated, other])
    expect(repo.usageRange(db, '2027-01-01', '2027-01-02')).toEqual([])
  })

  it('returns fallbacks for missing settings, round trips JSON and upserts existing keys', () => {
    const fallback = { tz: 'UTC', enabled: false }
    expect(repo.getSetting(db, 'prefs', fallback)).toBe(fallback)
    repo.setSetting(db, 'prefs', { tz: 'Australia/Perth', enabled: true })
    expect(repo.getSetting(db, 'prefs', fallback)).toEqual({ tz: 'Australia/Perth', enabled: true })
    repo.setSetting(db, 'prefs', fallback)
    expect(repo.getSetting(db, 'prefs', fallback)).toEqual(fallback)
    repo.setSetting(db, 'null', null)
    repo.setSetting(db, 'false', false)
    repo.setSetting(db, 'zero', 0)
    repo.setSetting(db, 'array', [1, 'two', null])
    expect(repo.getSetting<unknown>(db, 'null', 'fallback')).toBeNull()
    expect(repo.getSetting(db, 'false', true)).toBe(false)
    expect(repo.getSetting(db, 'zero', 99)).toBe(0)
    expect(repo.getSetting<unknown>(db, 'array', [])).toEqual([1, 'two', null])
    expect(() => repo.setSetting(db, 'invalid', undefined)).toThrow(TypeError)
    expect(db.prepare("SELECT count(*) AS n FROM settings WHERE key = 'prefs'").get()!.n).toBe(1)
  })
})
