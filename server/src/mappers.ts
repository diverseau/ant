// Database rows → shared domain objects sent to the web app.
import type { Accessory, Ant, AntColor, AntStatus, Colony, Effort, Message, PermissionMode, Thread } from '@ant/shared'
import type * as R from './db/repos/index.ts'

export function toAnt(row: R.Ant): Ant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    label: row.label || undefined,
    description: row.description,
    color: row.color as AntColor,
    accessory: row.accessory as Accessory,
    status: row.status as AntStatus,
    model: row.model,
    effort: row.effort as Effort | '',
    fast: row.fast,
    permissionMode: row.permissionMode as PermissionMode,
  }
}

export function toColony(row: R.Colony): Colony {
  return { id: row.id, name: row.name, memberIds: row.memberIds, leadAntId: row.leadAntId }
}

export function toMessage(row: R.Message): Message {
  const payload = (row.payload ?? {}) as Record<string, unknown>
  const base = { ...payload, id: row.id, author: row.author, at: row.createdAt, kind: row.kind }
  return (row.kind === 'text' || row.kind === 'system' || row.kind === 'error' ? { ...base, text: row.text } : base) as Message
}

export function toThread(row: R.Thread, messages: R.Message[] = []): Thread {
  return {
    id: row.id,
    kind: row.kind,
    refId: row.refId,
    unread: row.unread,
    pinned: row.pinned,
    updatedAt: row.updatedAt,
    messages: messages.map(toMessage),
  }
}

export function toThreadSummary(row: R.Thread): Omit<Thread, 'messages'> {
  const { messages: _m, ...rest } = toThread(row)
  return rest
}
