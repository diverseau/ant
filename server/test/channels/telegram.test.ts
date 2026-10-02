import type { Message } from 'grammy/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAdapter, type TelegramClient } from '../../src/channels/telegram.ts'
import type { ChannelAdapter, InboundMessage } from '../../src/channels/types.ts'

class FakeTelegram implements TelegramClient {
  botInfo = { id: 99, username: 'ant_bot' }
  handler?: (ctx: { message?: Message }) => void
  error?: (error: unknown) => void
  finish?: () => void
  init = vi.fn(async () => {})
  on(filter: 'message:text', handler: (ctx: { message?: Message }) => void) {
    expect(filter).toBe('message:text')
    this.handler = handler
  }
  catch(handler: (error: unknown) => void) { this.error = handler }
  start = vi.fn((options: { allowed_updates: ['message']; onStart: () => void }) => {
    const polling = new Promise<void>(resolve => { this.finish = resolve })
    options.onStart()
    return polling
  })
  stop = vi.fn(async () => { this.finish?.() })
  api = {
    sendMessage: vi.fn(async (_chatId: string, _text: string) => {}),
    sendChatAction: vi.fn(async (_chatId: string, _action: 'typing') => {}),
  }
  emit(overrides: Partial<Message.TextMessage> = {}) {
    const message: Message.TextMessage = {
      message_id: 1, date: 1, chat: { id: -123, type: 'group', title: 'Crew' },
      from: { id: 7, is_bot: false, first_name: 'Ada', last_name: 'Lovelace', username: 'ada' },
      text: 'Hello', ...overrides,
    }
    this.handler?.({ message })
  }
}

let client: FakeTelegram
let adapter: ChannelAdapter
let messages: InboundMessage[]
let log: ReturnType<typeof vi.fn<(message: string) => void>>
beforeEach(async () => {
  client = new FakeTelegram()
  adapter = createAdapter('test-token', { client })
  messages = []
  log = vi.fn()
  expect(await adapter.start({ onMessage: m => messages.push(m), log })).toEqual({ botName: 'ant_bot' })
})
afterEach(async () => { await adapter.stop() })

describe('Telegram adapter', () => {
  it('initializes identity and starts message-only long polling without waiting for it to finish', () => {
    expect(client.init).toHaveBeenCalledOnce()
    expect(client.start).toHaveBeenCalledWith({ allowed_updates: ['message'], onStart: expect.any(Function) })
    expect(client.stop).not.toHaveBeenCalled()
  })

  it('maps ids, display names, private chats and unaddressed group messages', () => {
    client.emit()
    client.emit({ chat: { id: 123, type: 'private', first_name: 'Ada' } })
    expect(messages).toEqual([
      { channel: 'telegram', chatId: '-123', userId: '7', userName: 'Ada Lovelace', text: 'Hello', direct: false, addressed: false },
      { channel: 'telegram', chatId: '123', userId: '7', userName: 'Ada Lovelace', text: 'Hello', direct: true, addressed: false },
    ])
  })

  it('uses UTF-16 entity offsets, strips only its own mentions, and compares handles without case', () => {
    client.emit({
      text: '😀 @ANT_BOT hi @other_bot',
      entities: [{ type: 'mention', offset: 3, length: 8 }, { type: 'mention', offset: 15, length: 10 }],
    })
    expect(messages[0]).toMatchObject({ text: '😀  hi @other_bot', addressed: true })
  })

  it('normalizes Telegram group command suffixes and named text mentions', () => {
    client.emit({ text: '/ants@ant_bot', entities: [{ type: 'bot_command', offset: 0, length: 13 }] })
    client.emit({ text: 'Ant hello', entities: [{ type: 'text_mention', offset: 0, length: 3, user: { id: 99, is_bot: true, first_name: 'Ant' } }] })
    expect(messages.map(m => [m.text, m.addressed])).toEqual([['/ants', true], ['hello', true]])
  })

  it('accepts entity-less mentions, but does not address email substrings, longer handles or code entities', () => {
    client.emit({ text: '@ant_bot hello @ant_bot' })
    client.emit({ text: 'person@ant_bot.example @ant_bot_extra' })
    client.emit({ text: '@ant_bot', entities: [{ type: 'code', offset: 0, length: 8 }] })
    expect(messages.map(m => [m.text, m.addressed])).toEqual([
      ['hello', true], ['person@ant_bot.example @ant_bot_extra', false], ['@ant_bot', false],
    ])
  })

  it('recognizes replies to itself and ignores replies to another bot', () => {
    client.emit({ reply_to_message: { message_id: 2, date: 1, chat: { id: -123, type: 'group', title: 'Crew' }, from: { id: 99, is_bot: true, first_name: 'Ant' }, reply_to_message: undefined } })
    client.emit({ reply_to_message: { message_id: 3, date: 1, chat: { id: -123, type: 'group', title: 'Crew' }, from: { id: 88, is_bot: true, first_name: 'Other' }, reply_to_message: undefined } })
    expect(messages.map(m => m.addressed)).toEqual([true, false])
  })

  it('ignores all bots, its own echoes, edited messages, missing senders and empty messages', () => {
    client.emit({ from: { id: 8, is_bot: true, first_name: 'Other bot' }, text: '@ant_bot Hello' })
    client.emit({ from: { id: 99, is_bot: false, first_name: 'Self' } })
    client.emit({ edit_date: 2 })
    client.emit({ from: undefined })
    client.emit({ text: ' \n' })
    client.emit({ text: '@ant_bot', entities: [{ type: 'mention', offset: 0, length: 8 }] })
    client.handler?.({})
    expect(messages).toEqual([])
  })

  it('sends ordered plain-text chunks up to 4096 units and supports public usernames', async () => {
    const text = 'Paragraph\n\n' + '😀'.repeat(3000)
    await adapter.send('@public_chat', text)
    const calls = client.api.sendMessage.mock.calls
    expect(calls.length).toBeGreaterThan(1)
    expect(calls.every(([id, chunk]) => id === '@public_chat' && chunk.length <= 4096 && chunk.isWellFormed())).toBe(true)
    expect(calls.map(([, chunk]) => chunk).join('')).toBe(text)
    await adapter.send('-123', '')
    expect(client.api.sendMessage).toHaveBeenCalledTimes(calls.length)
    await adapter.typing?.('-123')
    expect(client.api.sendChatAction).toHaveBeenCalledWith('-123', 'typing')
  })

  it('propagates send failures and does not send remaining chunks', async () => {
    client.api.sendMessage.mockRejectedValueOnce(new Error('send failed'))
    await expect(adapter.send('-123', 'x'.repeat(5000))).rejects.toThrow('send failed')
    expect(client.api.sendMessage).toHaveBeenCalledOnce()
  })

  it('awaits the polling task on stop, disables inbound messages, and tolerates repeated stop', async () => {
    let finishStop: (() => void) | undefined
    client.stop.mockImplementationOnce(async () => { await new Promise<void>(resolve => { finishStop = resolve }) })
    let stopped = false
    const stopping = adapter.stop().then(() => { stopped = true })
    finishStop?.()
    await Promise.resolve()
    expect(stopped).toBe(false)
    client.emit()
    expect(messages).toEqual([])
    client.finish?.()
    await stopping
    expect(stopped).toBe(true)
    await adapter.stop()
  })

  it('logs handler failures without leaking platform error details', () => {
    client.error?.(new Error('secret platform URL'))
    expect(log).toHaveBeenCalledWith('Telegram message handler failed')
  })

  it('cleans up a failed initialization and propagates the failure', async () => {
    await adapter.stop()
    const failed = new FakeTelegram()
    failed.init.mockRejectedValueOnce(new Error('invalid token'))
    const other = createAdapter('test-token', { client: failed })
    await expect(other.start({ onMessage: vi.fn(), log })).rejects.toThrow('invalid token')
    expect(failed.start).not.toHaveBeenCalled()
    expect(failed.stop).toHaveBeenCalledOnce()
  })

  it('rejects a polling setup failure instead of hanging startup', async () => {
    await adapter.stop()
    const failed = new FakeTelegram()
    failed.start.mockImplementationOnce(async () => { throw new Error('polling setup failed') })
    const other = createAdapter('test-token', { client: failed })
    await expect(other.start({ onMessage: vi.fn(), log })).rejects.toThrow('polling setup failed')
    expect(failed.stop).toHaveBeenCalledOnce()
  })
})
