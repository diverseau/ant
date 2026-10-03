// Models, effort levels and permission modes an ant can run with. Ids are the ones the
// `claude` CLI accepts for --model; capabilities come from Claude Code 2.1's model table.

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type PermissionMode = 'supervised' | 'edits' | 'auto' | 'full'

export interface ModelInfo {
  id: string
  name: string
  family: 'opus' | 'sonnet' | 'fable' | 'haiku'
  isNew?: boolean
  legacy?: boolean
  /** What Claude Code uses when no effort is set; absent when the model has no effort control. */
  defaultEffort?: Effort
  fast?: boolean
}

export const MODELS: ModelInfo[] = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', family: 'opus', isNew: true, defaultEffort: 'medium', fast: true },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', family: 'sonnet', isNew: true, defaultEffort: 'medium' },
  { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', family: 'fable', defaultEffort: 'high' },
  { id: 'claude-opus-5', name: 'Claude Opus 5', family: 'opus', defaultEffort: 'high', fast: true },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', family: 'sonnet', defaultEffort: 'high' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', family: 'haiku' },
  { id: 'claude-fable-5', name: 'Claude Fable 5', family: 'fable', legacy: true, defaultEffort: 'high' },
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', family: 'opus', legacy: true, defaultEffort: 'high', fast: true },
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', family: 'opus', legacy: true, defaultEffort: 'xhigh' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', family: 'opus', legacy: true, defaultEffort: 'high', fast: true },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', family: 'sonnet', legacy: true, defaultEffort: 'high' },
  { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', family: 'opus', legacy: true, defaultEffort: 'high' },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', family: 'sonnet', legacy: true },
]

/** CLI aliases always resolve to the newest model of the family. */
const ALIASES: Record<string, string> = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  fable: 'claude-fable-5-1',
  haiku: 'claude-haiku-4-5',
}

export function modelInfo(id: string | undefined): ModelInfo {
  const key = ALIASES[id ?? ''] ?? id ?? ''
  return (
    MODELS.find((m) => m.id === key || key.startsWith(`${m.id}-`)) ?? {
      id: key,
      name: key || 'Default model',
      family: /opus/.test(key) ? 'opus' : /haiku/.test(key) ? 'haiku' : /fable/.test(key) ? 'fable' : 'sonnet',
    }
  )
}

export const EFFORTS: Array<{ id: Effort; label: string }> = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Max' },
]

export const PERMISSION_MODES: Array<{ id: PermissionMode; label: string; note: string }> = [
  { id: 'supervised', label: 'Supervised', note: 'Ask before commands and file changes.' },
  { id: 'edits', label: 'Auto-accept edits', note: 'Auto-approve edits in its folder and sandboxed commands, ask before other actions.' },
  { id: 'auto', label: 'Auto', note: 'Claude reviews each action and approves routine ones. Haiku still asks.' },
  { id: 'full', label: 'Full access', note: 'Allow commands and edits anywhere in your home without prompts.' },
]

export const DEFAULT_PERMISSION_MODE: PermissionMode = 'edits'
