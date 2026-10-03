import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { classify, newSince, poll } from '../../src/triggers/github.ts'
import { describeEvent, slackMatches } from '../../src/triggers/match.ts'
import { checkUrl, diffLines, fetchPage, pageText, privateAddress } from '../../src/triggers/watch.ts'

describe('GitHub triggers', () => {
  it('classifies the events routines can use', () => {
    expect(classify({ id: '1', type: 'IssuesEvent', actor: { login: 'mara' }, payload: { action: 'opened', issue: { number: 7, title: 'Crash', html_url: 'u', body: 'b' } } }))
      .toEqual({ id: '1', kind: 'issue.opened', summary: { by: 'mara', number: 7, title: 'Crash', url: 'u', body: 'b' } })
    expect(classify({ id: '2', type: 'PullRequestEvent', payload: { action: 'closed', pull_request: { merged: true, number: 3 } } })?.kind).toBe('pr.merged')
    expect(classify({ id: '3', type: 'PullRequestEvent', payload: { action: 'closed', pull_request: { merged: false } } })).toBeNull()
    expect(classify({ id: '4', type: 'WatchEvent', payload: {} })).toBeNull()
    expect(classify({ id: '5', type: 'PushEvent', payload: { ref: 'refs/heads/main', commits: [{ message: 'fix', author: { name: 'L' } }] } })?.summary).toMatchObject({ commits: [{ message: 'fix', author: 'L' }] })
  })

  it('sets a baseline first, then returns only newer events oldest first', () => {
    const ev = [{ id: '30', type: 'x' }, { id: '10', type: 'x' }, { id: '20', type: 'x' }]
    expect(newSince(ev, null)).toEqual([])
    expect(newSince(ev, '10').map((e) => e.id)).toEqual(['20', '30'])
  })

  it('uses ETags and explains missing repos', async () => {
    const seen: Array<Record<string, string>> = []
    const f = (async (_u: string, init: RequestInit) => {
      seen.push(init.headers as Record<string, string>)
      if ((init.headers as Record<string, string>)['if-none-match'] === '"v1"') return new Response(null, { status: 304 })
      return new Response('[]', { status: 200, headers: { etag: '"v1"' } })
    }) as unknown as typeof fetch
    expect(await poll('a/b', { fetch: f, token: 't' })).toEqual({ status: 'ok', events: [], etag: '"v1"' })
    expect(await poll('a/b', { fetch: f, etag: '"v1"' })).toEqual({ status: 'unchanged' })
    expect(seen[0]!.authorization).toBe('Bearer t')
    const missing = (async () => new Response('', { status: 404 })) as unknown as typeof fetch
    expect(await poll('a/b', { fetch: missing })).toMatchObject({ status: 'error', message: expect.stringContaining('GITHUB_TOKEN') })
  })
})

describe('page watches', () => {
  it('refuses private, loopback and Tailscale addresses', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.20.0.1', '100.100.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd12::1', '::ffff:127.0.0.1']) expect(privateAddress(ip), ip).toBe(true)
    for (const ip of ['1.1.1.1', '142.250.70.78', '2606:4700::1111']) expect(privateAddress(ip), ip).toBe(false)
    for (const u of ['http://localhost:7420/api/bootstrap', 'http://127.0.0.1/', 'file:///etc/passwd', 'http://user:pw@example.com', 'https://box.tail1.ts.net/']) expect(() => checkUrl(u), u).toThrow()
    // A name that resolves to loopback is refused at connect time.
    const server = createServer((_q, r) => r.end('secret'))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    await expect(fetchPage(`http://localtest.me:${port}/`)).rejects.toThrow()
    server.close()
  })

  it('extracts visible text and diffs it by line', () => {
    const t = pageText('<html><head><style>x{}</style><script>evil()</script></head><body><h1>Price</h1><p>$10 &amp; up</p><!-- c --></body></html>')
    expect(t).toBe('Price\n$10 & up')
    expect(diffLines('a\nb\nc', 'a\nc\nd')).toEqual({ added: ['d'], removed: ['b'] })
  })
})

describe('Slack matching', () => {
  const e = { channel: 'slack' as const, kind: 'message' as const, chatId: 'C1', chatName: 'bugs', userId: 'U1', userName: 'Mara', text: 'Checkout is broken again' }
  it('filters by channel, kind, phrase and emoji', () => {
    expect(slackMatches({ source: 'slack', on: 'message', channel: '#bugs' }, e)).toBe(true)
    expect(slackMatches({ source: 'slack', on: 'message', channel: 'general' }, e)).toBe(false)
    expect(slackMatches({ source: 'slack', on: 'phrase', phrase: 'BROKEN' }, e)).toBe(true)
    expect(slackMatches({ source: 'slack', on: 'mention' }, e)).toBe(false)
    expect(slackMatches({ source: 'slack', on: 'reaction', emoji: ':eyes:' }, { ...e, kind: 'reaction', emoji: 'eyes' })).toBe(true)
    expect(describeEvent({ source: 'slack', on: 'phrase', phrase: 'broken', channel: 'bugs' })).toBe('Slack messages containing “broken” in #bugs')
  })
})
