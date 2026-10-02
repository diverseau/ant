// Ported from hermes-agent plugins/platforms/slack/adapter.py @ 54bc5e50 (MIT, Nous Research)
import { App, LogLevel } from '@slack/bolt'
import { splitText } from './split.ts'
import type { ChannelAdapter, ChannelContext } from './types.ts'

export interface SlackMessage {
  channel?: string
  channel_type?: string
  user?: string
  text?: string
  thread_ts?: string
  subtype?: string
  bot_id?: string
  bot_profile?: unknown
  edited?: unknown
}

/** The small Bolt surface used here also lets tests supply an offline app. */
export interface SlackApp {
  init(): Promise<void>
  start(): Promise<unknown>
  stop(): Promise<unknown>
  event(name: 'message' | 'app_mention', handler: (args: { event: SlackMessage }) => Promise<void>): void
  error(handler: (error: unknown) => Promise<void>): void
  client: {
    auth: { test(): Promise<{ user_id?: string; user?: string }> }
    users: {
      info(options: { user: string }): Promise<{
        user?: { is_bot?: boolean; name?: string; real_name?: string; profile?: { display_name?: string; real_name?: string } }
      }>
    }
    chat: {
      postMessage(options: {
        channel: string; text: string; thread_ts?: string; mrkdwn: true; parse: 'none';
        link_names: false; unfurl_links: false; unfurl_media: false
      }): Promise<unknown>
    }
  }
}

export function createAdapter(token: string, deps: { app?: SlackApp } = {}): ChannelAdapter {
  if (!/^xoxb-[A-Za-z0-9-]+\|xapp-[A-Za-z0-9-]+$/.test(token)) {
    throw new Error('Slack token must be "xoxb-…|xapp-…" (bot token | app-level token with connections:write)')
  }
  const [botToken, appToken] = token.split('|')
  let context: ChannelContext | undefined
  let botId: string | undefined
  const app: SlackApp = deps.app ?? (new App({
    token: botToken, appToken, socketMode: true, deferInitialization: true,
    // SDK diagnostics can contain payloads or tokens; keep channel logs generic.
    logger: {
      debug() {}, info() {}, warn() { context?.log('Slack client warning') },
      error() { context?.log('Slack client error') },
      setLevel() {}, getLevel() { return LogLevel.ERROR }, setName() {},
    },
  }) as unknown as SlackApp)
  app.error(async () => { context?.log('Slack message handler failed') })
  app.event('message', async ({ event }) => {
    // Channel mentions arrive separately as app_mention, so never process them twice.
    if (event.channel_type === 'im') await inbound(event)
  })
  app.event('app_mention', async ({ event }) => { await inbound(event) })

  async function inbound(message: SlackMessage) {
    const ctx = context
    if (!ctx || !botId || !message.channel || !message.user || message.user === botId
      || message.bot_id || message.bot_profile || message.edited
      || (message.subtype && !['file_share', 'thread_broadcast', 'me_message'].includes(message.subtype))) return
    let mentioned = false
    const text = (message.text ?? '').replace(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g, (mention, id: string) => {
      if (id !== botId) return mention
      mentioned = true
      return ''
    }).trim()
    if (!text) return
    const user = await app.client.users.info({ user: message.user }).then(result => result.user, () => {
      if (context === ctx) ctx.log('Slack user lookup failed')
      return undefined
    })
    if (context !== ctx || user?.is_bot) return
    ctx.onMessage({
      channel: 'slack',
      // The hub preserves chatId verbatim, including a Slack thread destination.
      chatId: message.thread_ts ? `${message.channel}:${message.thread_ts}` : message.channel,
      userId: message.user,
      userName: user?.profile?.display_name || user?.profile?.real_name || user?.real_name || user?.name || message.user,
      text, direct: message.channel_type === 'im', addressed: mentioned,
    })
  }

  return {
    kind: 'slack',
    async start(ctx) {
      context = ctx
      try {
        await app.init()
        const identity = await app.client.auth.test()
        if (!identity.user_id || !identity.user) throw new Error('Slack bot identity unavailable')
        botId = identity.user_id
        await app.start()
        return { botName: identity.user }
      } catch (err) {
        context = undefined
        botId = undefined
        await app.stop().catch(() => {})
        throw err
      }
    },
    async stop() {
      context = undefined
      botId = undefined
      await app.stop()
    },
    async send(chatId, text) {
      const [channel, thread_ts] = chatId.split(':')
      for (const chunk of mrkdwnChunks(text)) {
        await app.client.chat.postMessage({
          channel, ...(thread_ts ? { thread_ts } : {}), text: chunk, mrkdwn: true, parse: 'none',
          link_names: false, unfurl_links: false, unfurl_media: false,
        })
      }
    },
    async typing() {},
  }
}

function mrkdwnChunks(text: string): string[] {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Leave room for a carried partial entity, so neither entities nor emoji are cut.
  const chunks = splitText(escaped, 3496)
  let carry = ''
  return chunks.map((chunk, i) => {
    const combined = carry + chunk
    carry = i < chunks.length - 1 ? combined.match(/&(?:a(?:m(?:p)?)?|[lg](?:t)?)?$/)?.[0] ?? '' : ''
    return combined.slice(0, combined.length - carry.length)
  })
}
