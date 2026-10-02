// Ported from hermes-agent plugins/platforms/telegram/adapter.py @ 54bc5e50 (MIT, Nous Research)
import { Bot } from 'grammy'
import type { Message, UserFromGetMe } from 'grammy/types'
import { splitText } from './split.ts'
import type { ChannelAdapter, ChannelContext } from './types.ts'

/** The small grammY surface used here also lets tests supply an offline client. */
export interface TelegramClient {
  botInfo: Pick<UserFromGetMe, 'id' | 'username'>
  init(): Promise<void>
  on(filter: 'message:text', handler: (ctx: { message?: Message }) => void): unknown
  catch(handler: (error: unknown) => void): void
  start(options: { allowed_updates: ['message']; onStart: () => void }): Promise<void>
  stop(): Promise<void>
  api: {
    sendMessage(chatId: string, text: string): Promise<unknown>
    sendChatAction(chatId: string, action: 'typing'): Promise<unknown>
  }
}

export function createAdapter(token: string, deps: { client?: TelegramClient } = {}): ChannelAdapter {
  const client: TelegramClient = deps.client ?? new Bot(token)
  let context: ChannelContext | undefined
  let polling: Promise<void> | undefined
  client.catch(() => context?.log('Telegram message handler failed'))
  client.on('message:text', ({ message }) => {
    if (!context || !message || !('text' in message) || message.edit_date) return
    const user = message.from
    const bot = client.botInfo
    if (!user || user.is_bot || user.id === bot.id) return
    const { text, mentioned } = cleanMention(message, bot)
    if (!text.trim()) return
    context.onMessage({
      channel: 'telegram', chatId: String(message.chat.id), userId: String(user.id),
      userName: [user.first_name, user.last_name].filter(Boolean).join(' '), text,
      direct: message.chat.type === 'private',
      addressed: mentioned || message.reply_to_message?.from?.id === bot.id,
    })
  })

  return {
    kind: 'telegram',
    async start(ctx) {
      context = ctx
      try {
        await client.init()
        await new Promise<void>((resolve, reject) => {
          polling = client.start({ allowed_updates: ['message'], onStart: resolve }).catch(err => {
            context?.log('Telegram polling failed')
            reject(err)
          })
        })
        return { botName: client.botInfo.username }
      } catch (err) {
        context = undefined
        await client.stop().catch(() => {})
        await polling
        throw err
      }
    },
    async stop() {
      context = undefined
      try { await client.stop() } finally { await polling }
    },
    async send(chatId, text) {
      for (const chunk of splitText(text, 4096)) await client.api.sendMessage(chatId, chunk)
    },
    async typing(chatId) { await client.api.sendChatAction(chatId, 'typing') },
  }
}

function cleanMention(message: Message, bot: TelegramClient['botInfo']) {
  const ranges: Array<{ offset: number; length: number }> = []
  const expected = `@${bot.username.toLowerCase()}`
  const raw = message.text ?? ''
  // Telegram entities use UTF-16 offsets, exactly like JS string slices.
  for (const entity of message.entities ?? []) {
    const span = raw.slice(entity.offset, entity.offset + entity.length)
    if (entity.type === 'mention' && span.toLowerCase() === expected) ranges.push(entity)
    if (entity.type === 'text_mention' && entity.user.id === bot.id) ranges.push(entity)
    if (entity.type === 'bot_command' && span.toLowerCase().endsWith(expected)) {
      ranges.push({ offset: entity.offset + span.length - expected.length, length: expected.length })
    }
  }
  // Entity-less messages still need a bounded handle match, never a substring in an email.
  if (!message.entities?.length) {
    const pattern = new RegExp(`(?<![A-Za-z0-9_\x60/])@${bot.username}(?![A-Za-z0-9_])`, 'gi')
    for (const match of raw.matchAll(pattern)) ranges.push({ offset: match.index, length: match[0].length })
  }
  let text = raw
  for (const range of ranges.sort((a, b) => b.offset - a.offset)) {
    text = text.slice(0, range.offset) + text.slice(range.offset + range.length)
  }
  return { text: text.trim(), mentioned: ranges.length > 0 }
}
