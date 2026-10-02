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
  | { type: 'notice'; level: 'info' | 'warn' | 'error'; text: string }
