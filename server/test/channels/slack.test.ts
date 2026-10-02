import { describe, expect, it } from 'vitest'
import { createAdapter, type SlackApp, type SlackMessage } from '../../src/channels/slack.ts'
import type { InboundMessage } from '../../src/channels/types.ts'

function fakeApp() {
  const handlers = new Map<string, (args: { event: SlackMessage }) => Promise<void>>()
  const posted: Array<{ channel: string; text: string; thread_ts?: string }> = []
  const app: SlackApp = {
    init: async () => {},
    start: async () => {},
    stop: async () => {},
    event: (name, h) => void handlers.set(name, h),
    error: () => {},
    client: {
      auth: { test: async () => ({ user_id: 'UBOT', user: 'antbot' }) },
      users: { info: async ({ user }) => ({ user: { is_bot: user === 'UOTHERBOT', profile: { display_name: user === 'U1' ? 'Leon' : 'Someone' } } }) },
      chat: { postMessage: async (o) => void posted.push(o) },
    },
  }
  return { app, handlers, posted }
}

const TOKEN = 'xoxb-1-abc|xapp-1-def'

describe('slack adapter', () => {
  it('rejects malformed tokens', () => {
    expect(() => createAdapter('xoxb-only')).toThrow(/xoxb-…\|xapp-…/)
  })

  it('routes DMs and mentions, strips the mention, ignores bots and edits', async () => {
    const f = fakeApp()
    const got: InboundMessage[] = []
    const a = createAdapter(TOKEN, { app: f.app })
    expect(await a.start({ onMessage: (m) => got.push(m), log: () => {} })).toEqual({ botName: 'antbot' })
    await f.handlers.get('message')!({ event: { channel: 'D1', channel_type: 'im', user: 'U1', text: 'hello' } })
    await f.handlers.get('app_mention')!({ event: { channel: 'C1', channel_type: 'channel', user: 'U1', text: '<@UBOT> status?', thread_ts: '123.4' } })
    await f.handlers.get('message')!({ event: { channel: 'C1', channel_type: 'channel', user: 'U1', text: '<@UBOT> dup' } })
    await f.handlers.get('message')!({ event: { channel: 'D1', channel_type: 'im', user: 'U1', text: 'x', bot_id: 'B1' } })
    await f.handlers.get('message')!({ event: { channel: 'D1', channel_type: 'im', user: 'U1', text: 'x', edited: {} } })
    await f.handlers.get('message')!({ event: { channel: 'D1', channel_type: 'im', user: 'UOTHERBOT', text: 'x' } })
    expect(got).toEqual([
      { channel: 'slack', chatId: 'D1', userId: 'U1', userName: 'Leon', text: 'hello', direct: true, addressed: false },
      { channel: 'slack', chatId: 'C1:123.4', userId: 'U1', userName: 'Leon', text: 'status?', direct: false, addressed: true },
    ])
    await a.stop()
  })

  it('replies in threads, escapes and splits long text', async () => {
    const f = fakeApp()
    const a = createAdapter(TOKEN, { app: f.app })
    await a.start({ onMessage: () => {}, log: () => {} })
    await a.send('C1:123.4', 'a < b & c')
    await a.send('D1', 'x'.repeat(8000))
    expect(f.posted[0]).toMatchObject({ channel: 'C1', thread_ts: '123.4', text: 'a &lt; b &amp; c' })
    expect(f.posted.slice(1).length).toBeGreaterThan(1)
    expect(f.posted.slice(1).every((p) => p.text.length <= 3500 && !p.thread_ts)).toBe(true)
    await a.stop()
  })
})
