import { EventEmitter } from 'node:events'
import { ChannelType, Events } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAdapter, type DiscordClient, type DiscordMessage } from '../../src/channels/discord.ts'
import type { ChannelAdapter, InboundMessage } from '../../src/channels/types.ts'

class FakeDiscord extends EventEmitter implements DiscordClient {
  user: DiscordClient['user'] = null
  target = {
    send: vi.fn(async (_options: { content: string; allowedMentions: { parse: [] } }) => {}),
    sendTyping: vi.fn(async () => {}),
  }
  channels = { fetch: vi.fn(async (_id: string): Promise<unknown> => this.target) }
  login = vi.fn(async (_token: string) => {
    this.user = { id: '99', username: 'ant_bot' }
    this.emit(Events.ClientReady)
    return 'test-token'
  })
  destroy = vi.fn(async () => { this.user = null })
}

function message(overrides: Partial<DiscordMessage> = {}): DiscordMessage {
  return {
    author: { id: '7', bot: false, displayName: 'Ada Lovelace' }, member: null,
    content: 'Hello', channelId: '123:456', channel: { type: ChannelType.GuildText }, editedTimestamp: null,
    mentions: { users: { has: () => false } }, reference: null,
    fetchReference: vi.fn(async () => ({ author: { id: '88' } })), ...overrides,
  }
}

let client: FakeDiscord
let adapter: ChannelAdapter
let messages: InboundMessage[]
let log: ReturnType<typeof vi.fn<(message: string) => void>>
beforeEach(async () => {
  client = new FakeDiscord()
  adapter = createAdapter('test-token', { client })
  messages = []
  log = vi.fn()
  expect(await adapter.start({ onMessage: m => messages.push(m), log })).toEqual({ botName: 'ant_bot' })
})
afterEach(async () => { await adapter.stop() })

describe('Discord adapter', () => {
  it('logs in and maps ids, display names, DMs and unaddressed guild messages', () => {
    expect(client.login).toHaveBeenCalledWith('test-token')
    client.emit(Events.MessageCreate, message())
    client.emit(Events.MessageCreate, message({ member: { displayName: 'Guild Ada' } }))
    client.emit(Events.MessageCreate, message({ channel: { type: ChannelType.DM } }))
    expect(messages).toEqual([
      { channel: 'discord', chatId: '123:456', userId: '7', userName: 'Ada Lovelace', text: 'Hello', direct: false, addressed: false },
      { channel: 'discord', chatId: '123:456', userId: '7', userName: 'Guild Ada', text: 'Hello', direct: false, addressed: false },
      { channel: 'discord', chatId: '123:456', userId: '7', userName: 'Ada Lovelace', text: 'Hello', direct: true, addressed: false },
    ])
  })

  it('strips both user mention forms, leaves other mentions intact and ignores mention-only text', () => {
    const mentions = { users: { has: (id: string) => id === '99' } }
    client.emit(Events.MessageCreate, message({ content: '<@99> hi <@!99> <@88>', mentions }))
    client.emit(Events.MessageCreate, message({ content: '<@99>', mentions }))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ text: 'hi  <@88>', addressed: true })
  })

  it('fetches reply authors rather than assuming any reference addresses the bot', async () => {
    const own = message({ reference: { messageId: '1' }, fetchReference: vi.fn(async () => ({ author: { id: '99' } })) })
    const other = message({ reference: { messageId: '2' } })
    client.emit(Events.MessageCreate, own)
    client.emit(Events.MessageCreate, other)
    await vi.waitFor(() => expect(messages).toHaveLength(2))
    expect(own.fetchReference).toHaveBeenCalledOnce()
    expect(messages.map(m => m.addressed)).toEqual([true, false])
  })

  it('keeps a DM when its replied-to message has been deleted', async () => {
    client.emit(Events.MessageCreate, message({
      channel: { type: ChannelType.DM }, reference: { messageId: 'gone' },
      fetchReference: vi.fn(async () => { throw new Error('Unknown Message') }),
    }))
    await vi.waitFor(() => expect(messages).toHaveLength(1))
    expect(messages[0]).toMatchObject({ direct: true, addressed: false })
  })

  it('ignores other bots, its own echoes, blank messages and edits', () => {
    client.emit(Events.MessageCreate, message({ author: { id: '88', bot: true, displayName: 'Bot' } }))
    client.emit(Events.MessageCreate, message({ author: { id: '99', bot: false, displayName: 'Self' } }))
    client.emit(Events.MessageCreate, message({ content: ' \n' }))
    client.emit(Events.MessageCreate, message({ editedTimestamp: 1 }))
    client.emit(Events.MessageUpdate, message(), message({ content: 'Edited' }))
    expect(messages).toEqual([])
  })

  it('sends ordered chunks within 2000 units without pinging users, and shows typing', async () => {
    const text = '@everyone <@7>\n\n' + '😀'.repeat(2000)
    await adapter.send('123:456', text)
    const calls = client.target.send.mock.calls.map(([options]) => options)
    expect(calls.length).toBeGreaterThan(1)
    expect(calls.map(c => c.content).join('')).toBe(text)
    for (const options of calls) {
      expect(options.content.length).toBeLessThanOrEqual(2000)
      expect(options.content.isWellFormed()).toBe(true)
      expect(options.allowedMentions).toEqual({ parse: [] })
    }
    expect(client.channels.fetch).toHaveBeenCalledExactlyOnceWith('123:456')
    await adapter.send('123:456', '')
    expect(client.target.send).toHaveBeenCalledTimes(calls.length)
    await adapter.typing?.('123:456')
    expect(client.target.sendTyping).toHaveBeenCalledOnce()
  })

  it('rejects missing or non-text channels and stops sending after a failed chunk', async () => {
    client.channels.fetch.mockResolvedValueOnce(null)
    await expect(adapter.send('missing', 'Hello')).rejects.toThrow('not a text channel')
    client.channels.fetch.mockResolvedValueOnce({ type: ChannelType.GuildVoice })
    await expect(adapter.typing?.('voice')).rejects.toThrow('not a text channel')
    client.target.send.mockRejectedValueOnce(new Error('send failed'))
    await expect(adapter.send('123:456', 'x'.repeat(4000))).rejects.toThrow('send failed')
    expect(client.target.send).toHaveBeenCalledOnce()
  })

  it('disconnects, removes its listeners, and discards replies still being fetched', async () => {
    let resolve: ((value: { author: { id: string } }) => void) | undefined
    const pending = new Promise<{ author: { id: string } }>(done => { resolve = done })
    client.emit(Events.MessageCreate, message({ reference: { messageId: '1' }, fetchReference: () => pending }))
    await adapter.stop()
    resolve?.({ author: { id: '99' } })
    await pending
    await Promise.resolve()
    client.emit(Events.MessageCreate, message())
    expect(messages).toEqual([])
    expect(client.destroy).toHaveBeenCalledOnce()
    expect(client.listenerCount(Events.MessageCreate)).toBe(0)
    expect(client.listenerCount(Events.ClientReady)).toBe(0)
    expect(client.listenerCount(Events.Error)).toBe(0)
    await adapter.stop()
  })

  it('logs client errors without exposing platform error details', () => {
    client.emit(Events.Error, new Error('secret platform URL'))
    expect(log).toHaveBeenCalledWith('Discord client error')
  })

  it('waits for Gateway readiness even if login resolves earlier', async () => {
    await adapter.stop()
    const delayed = new FakeDiscord()
    delayed.login.mockImplementationOnce(async () => 'test-token')
    const other = createAdapter('test-token', { client: delayed })
    let started = false
    const starting = other.start({ onMessage: vi.fn(), log }).then(result => { started = true; return result })
    await Promise.resolve()
    expect(started).toBe(false)
    delayed.user = { id: '99', username: 'ant_bot' }
    delayed.emit(Events.ClientReady)
    expect(await starting).toEqual({ botName: 'ant_bot' })
    await other.stop()
  })

  it('destroys the client and removes listeners after login failure', async () => {
    await adapter.stop()
    const failed = new FakeDiscord()
    failed.login.mockRejectedValueOnce(new Error('invalid token'))
    const other = createAdapter('test-token', { client: failed })
    await expect(other.start({ onMessage: vi.fn(), log })).rejects.toThrow('invalid token')
    expect(failed.destroy).toHaveBeenCalledOnce()
    expect(failed.eventNames()).toEqual([])
  })
})
