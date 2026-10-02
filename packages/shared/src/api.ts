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
  settings: { timezone: string }
}

export interface Health {
  claude: { found: boolean; version?: string; loggedIn: boolean; authMethod?: string }
  sandbox: { ok: boolean; missing: string[] }
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
  | { type: 'notice'; level: 'info' | 'warn' | 'error'; text: string }
