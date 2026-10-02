import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Registry, serverKey } from '../../src/connectors/registry.ts'
import { openDb, type Db } from '../../src/db/index.ts'
import * as R from '../../src/db/repos/index.ts'
import { Vault } from '../../src/secrets/vault.ts'
import { HttpError } from '../../src/service.ts'

let dir: string
let db: Db
let reg: Registry
let a: R.Ant
let b: R.Ant

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ant-reg-'))
  db = openDb(':memory:')
  // Force the file key so tests never touch the real keyring.
  process.env.PATH_BACKUP = process.env.PATH
  process.env.PATH = '/nonexistent'
  reg = new Registry(db, new Vault(dir))
  process.env.PATH = process.env.PATH_BACKUP
  const mk = (slug: string) => R.createAnt(db, { slug, name: slug, label: '', description: '', color: 'blue', accessory: 'none', model: 'haiku', effort: '' })
  a = mk('alpha')
  b = mk('beta')
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('Vault', () => {
  it('round-trips and authenticates ciphertext', () => {
    const v = new Vault(dir)
    const blob = v.encrypt('s3cret')
    expect(Buffer.from(blob).toString('utf8')).not.toContain('s3cret')
    expect(v.decrypt(blob)).toBe('s3cret')
    const tampered = Buffer.from(blob)
    tampered[tampered.length - 1] ^= 1
    expect(() => v.decrypt(tampered)).toThrow()
  })
})

describe('Registry', () => {
  it('scopes secrets to ants and never lists values', () => {
    reg.addSecret({ name: 'github_token', description: 'GitHub', value: 'ghp_x', antIds: [a.id] })
    expect(reg.secrets()[0]).toMatchObject({ name: 'GITHUB_TOKEN', antIds: [a.id] })
    expect(JSON.stringify(reg.secrets())).not.toContain('ghp_x')
    expect(reg.forAnt(a.id).env).toEqual({ GITHUB_TOKEN: 'ghp_x' })
    expect(reg.forAnt(b.id).env).toEqual({})
    expect(reg.forAnt(a.id).toolsBlock).toContain('$GITHUB_TOKEN')
    expect(() => reg.addSecret({ name: 'PATH', description: '', value: 'x' })).toThrow(HttpError)
    expect(() => reg.addSecret({ name: 'bad name', description: '', value: 'x' })).toThrow(HttpError)
  })

  it('switches claude.ai connectors off per ant with deny rules', () => {
    expect(reg.noteDiscovered([{ name: 'claude.ai Google Calendar', status: 'connected', source: 'claudeai' }, { name: 'ant', status: 'connected', source: 'dynamic' }])).toBe(true)
    expect(reg.claudeAi()).toEqual([{ name: 'Google Calendar', key: 'claude.ai Google Calendar', status: 'connected', disabledFor: [] }])
    reg.setClaudeAiDisabled('claude.ai Google Calendar', [b.id])
    expect(reg.forAnt(b.id).deny).toEqual(['mcp__claude_ai_Google_Calendar'])
    expect(reg.forAnt(a.id).deny).toEqual([])
    expect(serverKey('claude.ai Gmail')).toBe('claude_ai_Gmail')
  })

  it('adds custom MCP connectors to scoped ants only', () => {
    reg.addCustom({ name: 'Linear', transport: 'http', url: 'https://mcp.linear.app/mcp', allAnts: false, antIds: [b.id] })
    expect(reg.forAnt(b.id).mcpServers).toEqual({ linear: { type: 'http', url: 'https://mcp.linear.app/mcp', headers: {} } })
    expect(reg.forAnt(a.id).mcpServers).toEqual({})
    expect(() => reg.addCustom({ name: 'browser', transport: 'stdio', command: 'x' })).toThrow(HttpError)
  })
})
