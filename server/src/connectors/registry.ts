// Connectors (plan §11): claude.ai connectors the CLI loads for the user's account (spike 4),
// plus custom MCP servers added in Ant. Both can be scoped per ant, unlike Grok Bot's
// account-wide plugins.
import type { ClaudeAiConnector, CustomConnector, SecretView } from '@ant/shared'
import type { Db } from '../db/index.ts'
import * as R from '../db/repos/index.ts'
import { HttpError } from '../service.ts'
import { isReservedName, SECRET_NAME, type Vault } from '../secrets/vault.ts'

/** "claude.ai Google Calendar" → "claude_ai_Google_Calendar", the CLI's MCP server key. */
export const serverKey = (name: string) => name.replace(/[^A-Za-z0-9_-]/g, '_')

interface Discovered {
  name: string
  status: string
}

export class Registry {
  private db: Db
  private vault: Vault

  constructor(db: Db, vault: Vault) {
    this.db = db
    this.vault = vault
  }

  /* ---------- claude.ai connectors ---------- */

  noteDiscovered(servers: { name: string; status: string; source?: string }[]): boolean {
    const found = servers.filter((s) => s.source === 'claudeai')
    if (!found.length) return false
    const prev = R.getSetting<Discovered[]>(this.db, 'connectors.claudeai', [])
    const next = new Map(prev.map((d) => [d.name, d]))
    for (const s of found) next.set(s.name, { name: s.name, status: s.status })
    const list = [...next.values()].sort((a, b) => a.name.localeCompare(b.name))
    const changed = JSON.stringify(list) !== JSON.stringify(prev)
    if (changed) R.setSetting(this.db, 'connectors.claudeai', list)
    return changed
  }

  claudeAi(): ClaudeAiConnector[] {
    const ants = R.listAnts(this.db)
    return R.getSetting<Discovered[]>(this.db, 'connectors.claudeai', []).map((d) => ({
      name: d.name.replace(/^claude\.ai\s+/, ''),
      key: d.name,
      status: d.status === 'connected' ? 'connected' : d.status === 'needs-auth' ? 'needs-auth' : 'error',
      disabledFor: ants.filter((a) => this.claudeAiOff(a.id).includes(d.name)).map((a) => a.id),
    }))
  }

  claudeAiOff(antId: string): string[] {
    return R.getSetting<string[]>(this.db, `ant.${antId}.claudeaiOff`, [])
  }

  setClaudeAiDisabled(key: string, disabledFor: string[]) {
    for (const a of R.listAnts(this.db)) {
      const off = new Set(this.claudeAiOff(a.id))
      if (disabledFor.includes(a.id)) off.add(key)
      else off.delete(key)
      R.setSetting(this.db, `ant.${a.id}.claudeaiOff`, [...off])
    }
  }

  /* ---------- custom MCP connectors ---------- */

  custom(): CustomConnector[] {
    return R.listConnectors(this.db).map((c) => {
      const cfg = (c.config ?? {}) as { url?: string; command?: string; args?: string[] }
      return { id: c.id, name: c.name, transport: c.transport, url: cfg.url, command: cfg.command, args: cfg.args, allAnts: c.allAnts, antIds: c.antIds, status: c.status }
    })
  }

  addCustom(input: { name: string; transport: 'http' | 'stdio'; url?: string; headers?: Record<string, string>; command?: string; args?: string[]; env?: Record<string, string>; allAnts?: boolean; antIds?: string[] }) {
    const name = input.name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    if (!name || ['ant', 'browser'].includes(name)) throw new HttpError(400, 'Pick another name for this connector.')
    if (R.getConnectorByName(this.db, name)) throw new HttpError(409, `A connector called ${name} already exists.`)
    if (input.transport === 'http' && !/^https?:\/\//.test(input.url ?? '')) throw new HttpError(400, 'An HTTP connector needs a URL.')
    if (input.transport === 'stdio' && !input.command?.trim()) throw new HttpError(400, 'A local connector needs a command.')
    const config = input.transport === 'http' ? { url: input.url, headers: input.headers ?? {} } : { command: input.command!.trim(), args: input.args ?? [], env: input.env ?? {} }
    return R.createConnector(this.db, { name, transport: input.transport, config, status: 'configured', allAnts: input.allAnts ?? true, antIds: input.antIds ?? [] })
  }

  scopeCustom(id: string, allAnts: boolean, antIds: string[]) {
    if (!R.getConnector(this.db, id)) throw new HttpError(404, 'No such connector')
    R.updateConnector(this.db, id, { allAnts })
    R.setConnectorScopes(this.db, id, antIds)
  }

  removeCustom(id: string) {
    if (!R.deleteConnector(this.db, id)) throw new HttpError(404, 'No such connector')
  }

  /* ---------- secrets ---------- */

  secrets(): SecretView[] {
    return R.listSecrets(this.db).map((s) => ({ id: s.id, name: s.name, description: s.description, allAnts: s.allAnts, antIds: s.antIds, updatedAt: s.updatedAt }))
  }

  addSecret(input: { name: string; description: string; value: string; allAnts?: boolean; antIds?: string[] }) {
    const name = input.name.trim().toUpperCase()
    if (!SECRET_NAME.test(name)) throw new HttpError(400, 'Use an environment-variable style name, like GITHUB_TOKEN.')
    if (isReservedName(name)) throw new HttpError(400, `${name} is reserved.`)
    if (R.getSecretByName(this.db, name)) throw new HttpError(409, `A secret called ${name} already exists.`)
    if (!input.value) throw new HttpError(400, 'A secret needs a value.')
    return R.createSecret(this.db, { name, description: input.description.trim(), ciphertext: this.vault.encrypt(input.value), allAnts: input.allAnts ?? false, antIds: input.antIds ?? [] })
  }

  updateSecret(id: string, patch: { description?: string; value?: string; allAnts?: boolean; antIds?: string[] }) {
    if (!R.getSecret(this.db, id)) throw new HttpError(404, 'No such secret')
    R.updateSecret(this.db, id, {
      ...(patch.description !== undefined && { description: patch.description.trim() }),
      ...(patch.value && { ciphertext: this.vault.encrypt(patch.value) }),
      ...(patch.allAnts !== undefined && { allAnts: patch.allAnts }),
    })
    if (patch.antIds) R.setSecretScopes(this.db, id, patch.antIds)
  }

  removeSecret(id: string) {
    if (!R.deleteSecret(this.db, id)) throw new HttpError(404, 'No such secret')
  }

  /* ---------- per-ant view used by provisioning ---------- */

  forAnt(antId: string) {
    const off = this.claudeAiOff(antId)
    const mcpServers: Record<string, unknown> = {}
    for (const c of R.listConnectors(this.db, { antId })) {
      const cfg = (c.config ?? {}) as { url?: string; headers?: Record<string, string>; command?: string; args?: string[]; env?: Record<string, string> }
      mcpServers[c.name] = c.transport === 'http' ? { type: 'http', url: cfg.url, headers: cfg.headers ?? {} } : { command: cfg.command, args: cfg.args ?? [], env: cfg.env ?? {} }
    }
    const env: Record<string, string> = {}
    const secretLines: string[] = []
    for (const s of R.listSecrets(this.db, { antId })) {
      try {
        env[s.name] = this.vault.decrypt(s.ciphertext)
        secretLines.push(`- \`$${s.name}\`${s.description ? `: ${s.description}` : ''}`)
      } catch {
        // Undecryptable (key changed): skip rather than leak garbage.
      }
    }
    const connectorLines = [
      ...this.claudeAi()
        .filter((c) => !off.includes(c.key) && c.status === 'connected')
        .map((c) => `- ${c.name} (claude.ai connector)`),
      ...Object.keys(mcpServers).map((n) => `- ${n} (MCP server)`),
    ]
    return {
      mcpServers,
      deny: off.map((key) => `mcp__${serverKey(key)}`),
      env,
      toolsBlock: [
        connectorLines.length ? `Connectors:\n${connectorLines.join('\n')}` : '',
        secretLines.length ? `Secrets available as environment variables in your shell (never print, log or send their values):\n${secretLines.join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    }
  }
}
