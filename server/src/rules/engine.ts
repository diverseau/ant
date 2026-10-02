// Decides what happens to a tool call that reached the permission broker (plan §4).
// Claude Code already allowed everything in the generated settings; whatever arrives here
// is something the CLI would have asked about.
import { isAbsolute, relative, resolve } from 'node:path'

export type Behaviour = 'allow' | 'ask' | 'handoff' | 'deny'

export interface Rule {
  pattern: string
  behaviour: Behaviour
  /** Optional substring the JSON-encoded input must contain. */
  inputContains?: string
}

export interface Verdict {
  behaviour: Behaviour
  reason: string
}

const READ_VERBS = /(^|_)(get|list|search|read|fetch|find|query|lookup|describe|view|download|retrieve|count|check|status)(_|$)/i
const SEND_VERBS = /(^|_)(send|reply|forward|post|publish|create|update|delete|remove|trash|archive|move|share|invite|transfer|pay|purchase|buy|book|cancel|submit|upload|write|set|add|apply|merge|deploy)(_|$)/i
const MONEY = /(pay|purchase|buy|checkout|billing|invoice_pay|transfer|wire)/i

export function globMatch(pattern: string, name: string): boolean {
  const re = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
  return re.test(name)
}

export function insideFolder(folder: string, path: string): boolean {
  const abs = isAbsolute(path) ? path : resolve(folder, path)
  const rel = relative(folder, abs)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** User/admin rules first (most specific wins: deny > handoff > ask > allow among matches), then defaults. */
export function decide(toolName: string, input: unknown, ctx: { folder: string; rules: Rule[] }): Verdict {
  const encoded = JSON.stringify(input ?? {})
  const matching = ctx.rules.filter((r) => globMatch(r.pattern, toolName) && (!r.inputContains || encoded.includes(r.inputContains)))
  for (const b of ['deny', 'handoff', 'ask', 'allow'] as const) {
    if (matching.some((r) => r.behaviour === b)) return { behaviour: b, reason: 'rule' }
  }
  return defaults(toolName, input, ctx.folder)
}

function defaults(toolName: string, input: unknown, folder: string): Verdict {
  const i = (input ?? {}) as Record<string, unknown>

  if (['Write', 'Edit', 'NotebookEdit', 'MultiEdit'].includes(toolName)) {
    const p = String(i.file_path ?? i.notebook_path ?? '')
    if (p && insideFolder(folder, p)) return { behaviour: 'allow', reason: 'inside own folder' }
    return { behaviour: 'ask', reason: 'writes outside its folder' }
  }

  if (toolName === 'Bash') {
    // Sandboxed Bash only reaches here when the floors flagged it or it wants to leave the sandbox.
    return { behaviour: 'ask', reason: i.dangerouslyDisableSandbox ? 'wants to run outside the sandbox' : 'flagged as risky' }
  }

  if (toolName.startsWith('mcp__')) {
    const action = toolName.split('__').slice(2).join('__')
    if (MONEY.test(action)) return { behaviour: 'handoff', reason: 'involves money' }
    if (SEND_VERBS.test(action)) return { behaviour: 'ask', reason: 'changes or sends something' }
    if (READ_VERBS.test(action)) return { behaviour: 'allow', reason: 'read-only' }
    return { behaviour: 'ask', reason: 'unrecognised connector action' }
  }

  if (toolName === 'WebFetch' || toolName === 'WebSearch') return { behaviour: 'allow', reason: 'web read' }

  return { behaviour: 'ask', reason: 'not covered by a rule' }
}
