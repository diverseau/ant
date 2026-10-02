import type { SQLInputValue } from 'node:sqlite'
import { tx } from '../index.ts'
import type { Db } from '../index.ts'
import { newId } from '../ids.ts'
import { decode, encodeJson, getRow, insert, limitValue, patchRow } from './_shared.ts'
import { bumpThread } from './threads.ts'

export interface Message {
  id: string
  threadId: string
  author: string
  kind: string
  payload: unknown
  text: string
  runId: string | null
  createdAt: number
  updatedAt: number
}
export type InsertMessageInput = Pick<Message, 'threadId' | 'author' | 'kind' | 'payload'> & Partial<Pick<Message, 'text' | 'runId'>>
export interface MessageSearchResult { message: Message; snippet: string }

export function insertMessage(db: Db, input: InsertMessageInput): Message {
  return tx(db, () => {
    const id = newId('message')
    const now = Date.now()
    insert(db, 'messages', { id, thread_id: input.threadId, author: input.author, kind: input.kind,
      payload: encodeJson(input.payload), text: input.text ?? '', run_id: input.runId ?? null,
      created_at: now, updated_at: now })
    bumpThread(db, input.threadId, now)
    return getMessage(db, id)!
  })
}

export function updateMessage(db: Db, id: string, patch: Partial<Pick<Message, 'payload' | 'text'>>): Message | null {
  patchRow(db, 'messages', id, patch, { payload: 'payload', text: 'text' }, ['payload'])
  return getMessage(db, id)
}

export function getMessage(db: Db, id: string): Message | null {
  return getRow<Message>(db, 'messages', id, ['payload'])
}

// An id cursor preserves messages sharing a millisecond; numeric cursors exclude that timestamp.
export function listMessages(db: Db, threadId: string, options: { before?: string | number; limit?: number } = {}): Message[] {
  let cursor = ''
  const args: SQLInputValue[] = [threadId]
  if (typeof options.before === 'number') {
    cursor = 'AND created_at < ?'
    args.push(options.before)
  } else if (options.before !== undefined) {
    cursor = `AND (created_at, rowid) < (SELECT created_at, rowid FROM messages WHERE id = ? AND thread_id = ?)`
    args.push(options.before, threadId)
  }
  args.push(limitValue(options.limit ?? 50))
  return db.prepare(`SELECT * FROM messages WHERE thread_id = ? ${cursor} ORDER BY created_at DESC, rowid DESC LIMIT ?`)
    .all(...args).reverse().map(row => decode<Message>(row, ['payload']))
}

export function searchMessages(db: Db, query: string, options: { threadId?: string; limit?: number } = {}): MessageSearchResult[] {
  const limit = limitValue(options.limit ?? 20)
  const terms = query.match(/[\p{L}\p{N}_]+/gu) ?? []
  if (!terms.length || limit === 0) return []
  const match = terms.map(term => `"${term}"`).join(' AND ')
  const args: SQLInputValue[] = [match]
  if (options.threadId !== undefined) args.push(options.threadId)
  args.push(limit)
  return db.prepare(`SELECT messages.*, snippet(messages_fts, 0, '<mark>', '</mark>', '…', 24) AS search_snippet
    FROM messages_fts JOIN messages ON messages.rowid = messages_fts.rowid
    WHERE messages_fts MATCH ? ${options.threadId !== undefined ? 'AND messages.thread_id = ?' : ''}
    ORDER BY messages_fts.rank, messages.created_at DESC, messages.rowid DESC LIMIT ?`).all(...args)
    .map(row => {
      const { search_snippet, ...message } = row
      return { message: decode<Message>(message, ['payload']), snippet: String(search_snippet) }
    })
}
