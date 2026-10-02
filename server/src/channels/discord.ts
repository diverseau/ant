// Ported from hermes-agent plugins/platforms/telegram/adapter.py @ 54bc5e50 (MIT, Nous Research)
import { ChannelType, Client, Events, GatewayIntentBits, Partials } from 'discord.js'
import { splitText } from './split.ts'
import type { ChannelAdapter, ChannelContext } from './types.ts'

export interface DiscordMessage {
  author: { id: string; bot: boolean; displayName: string }
  member: { displayName: string } | null
  content: string
  channelId: string
  channel: { type: ChannelType }
  editedTimestamp: number | null
  mentions: { users: { has(id: string): boolean } }
  reference: { messageId?: string | null } | null
  fetchReference(): Promise<{ author: { id: string } }>
}

export interface DiscordClient {
  user: { id: string; username: string } | null
  on(event: 'messageCreate', handler: (message: DiscordMessage) => void): unknown
  on(event: 'error', handler: (error: Error) => void): unknown
  once(event: 'clientReady', handler: () => void): unknown
  off(event: 'messageCreate', handler: (message: DiscordMessage) => void): unknown
  off(event: 'error', handler: (error: Error) => void): unknown
  off(event: 'clientReady', handler: () => void): unknown
  login(token: string): Promise<string>
  destroy(): Promise<void>
  channels: { fetch(id: string): Promise<unknown> }
}

interface SendChannel {
  send(options: { content: string; allowedMentions: { parse: [] } }): Promise<unknown>
  sendTyping(): Promise<unknown>
}

export function createAdapter(token: string, deps: { client?: DiscordClient } = {}): ChannelAdapter {
  const client: DiscordClient = deps.client ?? new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel],
  })
  let context: ChannelContext | undefined
  let ready: (() => void) | undefined
  const error = () => context?.log('Discord client error')
  const receive = (message: DiscordMessage) => {
    void inbound(message).catch(() => context?.log('Discord message handler failed'))
  }
  async function inbound(message: DiscordMessage) {
    const ctx = context
    const bot = client.user
    if (!ctx || !bot || message.author.bot || message.author.id === bot.id || message.editedTimestamp !== null || !message.content.trim()) return
    const mentioned = message.mentions.users.has(bot.id)
    let replied = false
    if (!mentioned && message.reference?.messageId) {
      // Deleted/inaccessible reply targets should not discard an otherwise valid DM.
      replied = await message.fetchReference().then(m => m.author.id === bot.id, () => false)
    }
    if (context !== ctx) return
    const text = message.content.replace(new RegExp(`<@!?${bot.id}>`, 'g'), '').trim()
    if (!text) return
    ctx.onMessage({
      channel: 'discord', chatId: message.channelId, userId: message.author.id,
      userName: message.member?.displayName ?? message.author.displayName, text,
      direct: message.channel.type === ChannelType.DM, addressed: mentioned || replied,
    })
  }
  async function channel(chatId: string): Promise<SendChannel> {
    const found = await client.channels.fetch(chatId)
    if (!found || typeof found !== 'object' || !('send' in found) || typeof found.send !== 'function'
      || !('sendTyping' in found) || typeof found.sendTyping !== 'function') throw new Error('Discord channel is not a text channel')
    return found as SendChannel
  }
  function detach() {
    context = undefined
    client.off(Events.MessageCreate, receive)
    client.off(Events.Error, error)
    if (ready) client.off(Events.ClientReady, ready)
    ready = undefined
  }

  return {
    kind: 'discord',
    async start(ctx) {
      context = ctx
      client.on(Events.MessageCreate, receive)
      client.on(Events.Error, error)
      const connected = new Promise<void>(resolve => {
        ready = resolve
        client.once(Events.ClientReady, ready)
      })
      try {
        await client.login(token)
        await connected
        if (!client.user) throw new Error('Discord bot identity unavailable')
        return { botName: client.user.username }
      } catch (err) {
        detach()
        await client.destroy()
        throw err
      }
    },
    async stop() {
      detach()
      await client.destroy()
    },
    async send(chatId, text) {
      const chunks = splitText(text, 2000)
      if (!chunks.length) return
      const target = await channel(chatId)
      for (const content of chunks) await target.send({ content, allowedMentions: { parse: [] } })
    },
    async typing(chatId) { await (await channel(chatId)).sendTyping() },
  }
}
