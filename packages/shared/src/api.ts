// Contract between antd and the web app: REST payloads and WebSocket events.
import type { Accessory, Ant, AntColor, ApprovalMessage, Colony, Message, Thread } from './domain.ts'

export type ThreadSummary = Omit<Thread, 'messages'>

export interface Bootstrap {
  user: { name: string; plan: string }
  ants: Ant[]
  colonies: Colony[]
  threads: Thread[]
  usage: UsageWindows | null
  health: Health
  routines: RoutineView[]
  settings: Settings
}

export interface Settings {
  userName: string
  timezone: string
  /** Model alias for new ants: sonnet, opus, haiku… */
  defaultModel: string
  /** How many ants may work at the same time. */
  maxBusy: number
}

export interface Health {
  claude: { found: boolean; version?: string; loggedIn: boolean; authMethod?: string; plan?: string }
  sandbox: { ok: boolean; missing: string[] }
  computer: { chromium: boolean }
  antHome: string
  version: string
}

export interface UsageWindows {
  status: string
  fiveHour?: { utilization: number; resetsAt: number }
  sevenDay?: { utilization: number; resetsAt: number }
  updatedAt: number
}

export interface ComputerState {
  antId: string
  running: boolean
  url: string | null
  title: string | null
  /** Who drives the browser: the ant, or the user after "Take over". */
  lease: 'ant' | 'user'
  /** Present while the user is teaching a task by demonstration. */
  teaching?: { title: string; steps: number; startedAt: number }
}

export interface RoutineView {
  id: string
  antId: string
  name: string
  instruction: string
  /** Human description, e.g. "Weekdays at 9:00 AM · Australia/Sydney". */
  when: string
  tz: string
  trigger: 'schedule' | 'webhook'
  enabled: boolean
  nextRunAt: number | null
  lastRunAt: number | null
  lastStatus: RoutineRunView['status'] | null
  /** Present for webhook routines: POST here with `Authorization: Bearer <key>`. */
  webhookUrl?: string
}

export interface RoutineRunView {
  id: string
  routineId: string
  status: 'running' | 'succeeded' | 'failed' | 'skipped' | 'expired'
  startedAt: number
  endedAt: number | null
  output: string | null
}

export interface CreateRoutineInput {
  antId: string
  name: string
  instruction: string
  /** Natural language or cron: "every weekday at 9am", "every 2 hours", "0 9 * * 1-5". Ignored for webhooks. */
  when: string
  tz?: string
  trigger?: 'schedule' | 'webhook'
}

export interface ClaudeAiConnector {
  /** Display name, e.g. "Gmail". */
  name: string
  /** Server name the CLI reports, e.g. "claude.ai Gmail". */
  key: string
  status: 'connected' | 'needs-auth' | 'error'
  /** Ants this connector is switched off for. */
  disabledFor: string[]
}

export interface CustomConnector {
  id: string
  name: string
  transport: 'http' | 'stdio'
  url?: string
  command?: string
  args?: string[]
  allAnts: boolean
  antIds: string[]
  status: string
}

export interface SecretView {
  id: string
  /** Environment variable name, e.g. GITHUB_TOKEN. Values are never sent to the web app. */
  name: string
  description: string
  allAnts: boolean
  antIds: string[]
  updatedAt: number
}

export interface ChannelStatus {
  kind: 'telegram' | 'discord' | 'slack'
  enabled: boolean
  connected: boolean
  botName: string | null
  error: string | null
  allowUsers: string[]
}

export interface ConnectorsView {
  claudeAi: ClaudeAiConnector[]
  custom: CustomConnector[]
  secrets: SecretView[]
}

export interface RuleView {
  id: string
  /** Tool name pattern, e.g. mcp__claude_ai_Gmail__send_message or Write. */
  pattern: string
  /** Human label for the tool, e.g. "Gmail: send message". */
  label: string
  behaviour: 'allow' | 'ask' | 'handoff' | 'deny'
  scope: 'global' | 'ant'
  createdAt: number
}

export interface SkillView {
  name: string
  description: string
  /** An ant's own skill, or one shared with the whole colony. */
  scope: 'ant' | 'colony'
}

export interface SearchHit {
  threadId: string
  messageId: string
  author: string
  at: number
  /** Text around the match; matched terms are wrapped in \u0001…\u0002 markers, never HTML. */
  snippet: string
}

export interface CreateAntInput {
  name: string
  label?: string
  description: string
  color: AntColor
  accessory: Accessory
  model?: string
}

export interface SendInput {
  text: string
}

export type ApprovalDecision = NonNullable<ApprovalMessage['decision']>

export type AntEvent =
  | { type: 'message.created'; threadId: string; message: Message }
  | { type: 'message.updated'; threadId: string; message: Message }
  | { type: 'message.delta'; threadId: string; messageId: string; text: string }
  | { type: 'thread.updated'; thread: ThreadSummary }
  | { type: 'thread.deleted'; threadId: string }
  | { type: 'ant.updated'; ant: Ant }
  | { type: 'colony.updated'; colony: Colony }
  | { type: 'typing'; threadId: string; antId: string | null }
  | { type: 'usage'; usage: UsageWindows }
  | { type: 'computer'; state: ComputerState }
  | { type: 'routine.updated'; routine: RoutineView }
  | { type: 'routine.deleted'; routineId: string }
  | { type: 'connectors.updated'; connectors: ConnectorsView }
  | { type: 'skills.updated' }
  | { type: 'notice'; level: 'info' | 'warn' | 'error'; text: string }
