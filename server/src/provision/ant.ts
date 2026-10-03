// Creates and refreshes an ant's folder, its generated CLAUDE.md, and the settings and
// MCP config antd passes to `claude` (plan §2; spike 3b: allow rules only work via --settings).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Ant, PermissionMode } from '@ant/shared'
import { antDataDir, type Config } from '../config.ts'

export interface AntPaths {
  folder: string
  claudeMd: string
  memory: string
  workspace: string
  dataDir: string
  settings: string
  mcpConfig: string
}

export interface ProvisionContext {
  userName: string
  roster: Array<{ name: string; label?: string; description: string; self: boolean }>
  colonies: Array<{ name: string; members: string[] }>
  memoryBlock: string
  userBlock: string
  /** Extra permission rules granted by the user ("Always allow"). */
  grants: string[]
  network: 'open' | 'allowlist'
  allowedDomains: string[]
  /** Custom MCP connectors scoped to this ant. */
  extraMcp: Record<string, unknown>
  /** Tool deny rules, e.g. claude.ai connectors switched off for this ant. */
  extraDeny: string[]
  /** Connectors and secrets the ant can use, for CLAUDE.md. */
  toolsBlock: string
  /** Every ant's Chromium debugging port: shell access would hand over that browser and its logins. */
  cdpPorts: number[]
  /** How much the ant may do without asking (composer permissions picker). Default 'edits'. */
  permissionMode?: PermissionMode
  /** Fast mode (Opus; billed as extra usage on subscriptions). */
  fast?: boolean
}

const ANT_MCP_MAIN = fileURLToPath(new URL('../../../packages/ant-mcp/src/main.ts', import.meta.url))
const ANT_HOOK = fileURLToPath(new URL('../../../packages/ant-mcp/src/hook.ts', import.meta.url))
const PLAYWRIGHT_MCP = fileURLToPath(new URL('../../../node_modules/@playwright/mcp/cli.js', import.meta.url))

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
  return s || 'ant'
}

export function antPaths(cfg: Config, ant: Pick<Ant, 'id'> & { slug: string }): AntPaths {
  const folder = join(cfg.antHome, ant.slug)
  const dataDir = antDataDir(cfg, ant.id)
  return {
    folder,
    claudeMd: join(folder, 'CLAUDE.md'),
    memory: join(folder, 'memory', 'MEMORY.md'),
    workspace: join(folder, 'workspace'),
    dataDir,
    settings: join(dataDir, 'settings.json'),
    mcpConfig: join(dataDir, 'mcp.json'),
  }
}

/** Folders that never belong to an ant: credentials and Ant's own state. */
export function credentialDenies(cfg: Config): string[] {
  const h = homedir()
  const abs = (p: string) => `//${p.replace(/^\//, '')}/**`
  return [
    abs(join(h, '.ssh')),
    abs(join(h, '.gnupg')),
    abs(join(h, '.aws')),
    abs(join(h, '.config', 'gcloud')),
    abs(join(h, '.docker')),
    abs(join(h, '.kube')),
    abs(join(h, '.password-store')),
    abs(join(h, '.codex')),
    abs(join(h, '.hermes')),
    abs(join(h, '.mozilla')),
    abs(join(h, '.config', 'chromium')),
    abs(join(h, '.config', 'google-chrome')),
    abs(join(h, '.local', 'share', 'keyrings')),
    abs(cfg.dataDir),
  ].concat([`//${join(h, '.claude', '.credentials.json').slice(1)}`, `//${join(h, '.claude.json').slice(1)}`])
}

export function settingsFor(cfg: Config, paths: AntPaths, ctx: ProvisionContext, others: string[]) {
  const own = `//${paths.folder.slice(1)}/**`
  const denies = credentialDenies(cfg)
  // Other ants' browser profiles hold their logins.
  for (const o of others) denies.push(`//${join(o, 'browser').slice(1)}/**`)
  const mode = ctx.permissionMode ?? 'edits'
  const osPaths = denies.map((d) => d.replace(/^\/\//, '/').replace(/\/\*\*$/, ''))
  return {
    ...(ctx.fast && { fastMode: true }),
    permissions: {
      allow: [
        'Read',
        'Glob',
        'Grep',
        // Supervised ants ask before every file change, even in their own folder.
        ...(mode === 'supervised' ? [] : [`Edit(${own})`]),
        'WebSearch',
        ...(ctx.network === 'open' ? ['WebFetch(domain:*)'] : ['WebFetch', ...ctx.allowedDomains.map((d) => `WebFetch(domain:${d})`)]),
        'mcp__ant__*',
        'mcp__browser__*',
        'TodoWrite',
        'Task',
        'Skill',
        ...ctx.grants,
      ],
      deny: [...denies.map((d) => `Read(${d})`), ...denies.map((d) => `Edit(${d})`), ...ctx.extraDeny],
    },
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: mode !== 'supervised',
      // Full access runs without prompts, so a command must never leave the sandbox: that
      // keeps the network deny below (Ant's own API) in force.
      ...(mode === 'full' && { allowUnsandboxedCommands: false }),
      // Inside the Ant container there are no privileged namespaces for bubblewrap; the
      // container is the outer boundary (Claude Code sandboxing docs, "Linux sandbox strength").
      ...(process.env.ANT_IN_CONTAINER === '1' && { enableWeakerNestedSandbox: true }),
      filesystem: {
        denyRead: osPaths,
        // Full access may write anywhere in the user's home except credentials and Ant's data.
        ...(mode === 'full' && { allowWrite: [homedir()], denyWrite: osPaths }),
      },
      network: {
        ...(ctx.network === 'allowlist' && { allowedDomains: ctx.allowedDomains, strictAllowlist: true }),
        // Shell commands must not reach antd's API (an ant could approve itself).
        deniedDomains: selfHosts([...cfg.selfPorts, ...ctx.cdpPorts]),
      },
    },
    autoMemoryEnabled: false,
    includeCoAuthoredBy: false,
    hooks: {
      PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: `node ${ANT_HOOK}`, timeout: 30 }] }],
    },
  }
}

/** host:port entries for every loopback spelling of Ant's own ports. */
export function selfHosts(ports: number[]): string[] {
  return ports.flatMap((p) => ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '*.localhost'].map((h) => `${h}:${p}`))
}

export function mcpConfigFor(cfg: Config, token: string, paths: AntPaths, cdpPort: number, extra: Record<string, unknown> = {}) {
  return {
    mcpServers: {
      ...extra,
      ant: { command: 'node', args: [ANT_MCP_MAIN], env: { ANT_SOCKET: cfg.socketPath, ANT_TOKEN: token } },
      // The ant's own Chromium, started on demand by antd (PreToolUse hook) and shared with
      // the user's take-over view.
      browser: {
        command: 'node',
        args: [PLAYWRIGHT_MCP, '--cdp-endpoint', `http://127.0.0.1:${cdpPort}`, '--output-dir', join(paths.workspace, 'browser')],
      },
    },
  }
}

export function claudeMdFor(ant: Ant, paths: AntPaths, ctx: ProvisionContext): string {
  const others = ctx.roster.filter((r) => !r.self)
  const roster = others.length
    ? others.map((r) => `- **${r.name}**${r.label ? ` (${r.label})` : ''}: ${firstLine(r.description)}`).join('\n')
    : '- You are the only ant so far.'
  const colonies = ctx.colonies.length ? ctx.colonies.map((c) => `- ${c.name}: ${c.members.join(', ')}`).join('\n') : '- None yet.'
  return `<!-- Generated by Ant. Edits here are overwritten; change ${ant.name} in the Ant app instead. -->
# You are ${ant.name}, an ant in ${ctx.userName}'s colony
${ant.label ? `Job: ${ant.label}\n` : ''}
${ant.description.trim()}

## Your home
- Your folder is \`${paths.folder}\`. Read, write and delete freely inside it. Put work you produce in \`workspace/\`; files ${ctx.userName} gives you arrive in \`inbox/\`.
- You may READ files anywhere else on this computer unless access is blocked.
- Do NOT create, change, move or delete anything outside your folder unless ${ctx.userName} explicitly asked for that exact change. If you're unsure, ask first with the \`request_approval\` tool. ${ctx.permissionMode === 'full' ? `You have full access, so nothing will stop such a write: the care is yours.` : `Ant will also ask ${ctx.userName} before any such write.`}
- Never try to read credentials, keys, cookies or other ants' browser profiles.

## How to work with ${ctx.userName}
- Messages from ${ctx.userName} start with \`[${ctx.userName}]\`. Messages from other ants start with \`[From <name>]\` or \`[Reply from <name>]\`. Scheduled work starts with \`[Routine: <name>]\`.
- Lead with the outcome. Say what you did, what you assumed, and what is waiting on ${ctx.userName}.
- Use \`report_checklist\` for multi-step results and \`share_file\` to show files you made.
- Anything that would be sent to a person (email, Slack, DM) goes through \`present_draft\`. Never send it another way.
- Before purchases, payments, deletions, publishing, or any browser action with real-world effect, call \`request_approval\` and wait.
- Use \`set_status\` for a short live status while you work on something long.
- When you've worked out a repeatable process, offer to save it with \`save_skill\` so ${ctx.userName} can rerun it with /name.
- You have your own browser (the \`browser_*\` tools). Logins you make there persist. When a site needs ${ctx.userName} to sign in, pass 2FA or a CAPTCHA, or enter payment details, call \`request_handoff\` and wait; never ask for passwords in chat.

## The colony
${roster}

Colonies:
${colonies}

- Use \`message_ant\` to delegate to or ask another ant; their reply comes back to you as a new message. Use \`post_to_colony\` to speak in a colony chat.
- One owner per task. Don't redo another ant's work; ask them.

## Memory
Use the \`memory\` tool to keep durable facts and preferences (not task progress). This is what you remembered as of this session:

${ctx.memoryBlock || '_Nothing yet._'}

${ctx.toolsBlock ? `## Tools you have\n${ctx.toolsBlock}\n\n` : ''}${ctx.userBlock ? `## About ${ctx.userName}\n${ctx.userBlock}\n` : ''}`
}

function firstLine(s: string): string {
  const line = s.trim().split('\n')[0] ?? ''
  return line.length > 160 ? line.slice(0, 159) + '…' : line
}

/** Create the folder layout (idempotent) and write generated files. */
export function provisionAnt(cfg: Config, ant: Ant & { slug: string }, ctx: ProvisionContext, token: string, otherFolders: string[], cdpPort: number): AntPaths {
  const paths = antPaths(cfg, ant)
  for (const d of [paths.folder, join(paths.folder, 'memory'), paths.workspace, join(paths.folder, 'inbox'), join(paths.folder, 'browser'), join(paths.folder, '.claude', 'skills'), paths.dataDir]) {
    mkdirSync(d, { recursive: true, mode: d === paths.dataDir ? 0o700 : 0o755 })
  }
  if (!existsSync(paths.memory)) writeFileSync(paths.memory, '')
  writeFileSync(paths.claudeMd, claudeMdFor(ant, paths, ctx))
  writeFileSync(paths.settings, JSON.stringify(settingsFor(cfg, paths, ctx, otherFolders), null, 2), { mode: 0o600 })
  writeFileSync(paths.mcpConfig, JSON.stringify(mcpConfigFor(cfg, token, paths, cdpPort, ctx.extraMcp), null, 2), { mode: 0o600 })
  return paths
}

export function readIfExists(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}
