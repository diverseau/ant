export type AntColor = 'coral' | 'purple' | 'yellow' | 'green' | 'blue'
export type Accessory = 'none' | 'satchel' | 'leaf' | 'wrench' | 'glasses'
export type AntStatus = 'idle' | 'working' | 'attention' | 'paused'

export interface Ant {
  id: string
  slug?: string
  model?: string
  name: string
  label?: string
  description: string
  color: AntColor
  accessory: Accessory
  status: AntStatus
  /** Live status line set by the ant while it works. */
  activity?: string
}

export interface Colony {
  id: string
  name: string
  memberIds: string[]
}

/** A sidebar entry: a 1:1 chat with an ant, or a colony. */
export interface Thread {
  id: string
  kind: 'ant' | 'colony'
  /** ant id for 1:1, colony id for colonies */
  refId: string
  unread: number
  pinned: boolean
  updatedAt: number
  messages: Message[]
}

export type Author = 'user' | 'system' | string // string = ant id

interface Base {
  id: string
  author: Author
  at: number
}

export interface TextMessage extends Base {
  kind: 'text'
  text: string
  streaming?: boolean
}

export interface ComputerMessage extends Base {
  kind: 'computer'
  title: string
  text: string
  state: 'working' | 'needs-you' | 'done'
  site: string
  /** A screenshot was saved when the turn ended (live mode). */
  snapshot?: boolean
}

export interface ChecklistMessage extends Base {
  kind: 'checklist'
  items: { service: string; result: string; detail?: string; ok: boolean }[]
}

export interface ApprovalMessage extends Base {
  kind: 'approval'
  action: string
  detail: string
  connector: string
  approvalId?: string
  behaviour?: 'ask' | 'handoff'
  expiresAt?: number
  decision?: 'once' | 'always' | 'deny' | 'expired'
}

export interface DraftMessage extends Base {
  kind: 'draft'
  channel: 'email' | 'slack'
  to: string
  subject?: string
  body: string
  state?: 'sent' | 'discarded'
}

export interface SystemMessage extends Base {
  kind: 'system'
  text: string
}

export interface RoutineMessage extends Base {
  kind: 'routine'
  name: string
  result: 'succeeded' | 'failed' | 'running'
}

export interface ToolMessage extends Base {
  kind: 'tool'
  toolUseId: string
  name: string
  /** Short human summary, e.g. "Ran npm test" or "Read src/app.ts". */
  title: string
  detail?: string
  state: 'running' | 'ok' | 'error' | 'denied'
  durationMs?: number
}

export interface FileMessage extends Base {
  kind: 'file'
  path: string
  name: string
  bytes?: number
}

export interface ErrorMessage extends Base {
  kind: 'error'
  text: string
  detail?: string
}

export type Message =
  | TextMessage
  | ToolMessage
  | FileMessage
  | ErrorMessage
  | ComputerMessage
  | ChecklistMessage
  | ApprovalMessage
  | DraftMessage
  | SystemMessage
  | RoutineMessage

export interface Skill {
  id: string
  name: string
  description: string
}

export interface Connector {
  id: string
  name: string
  description: string
  installed: boolean
  hue: number
}
