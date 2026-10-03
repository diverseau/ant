// GitHub event triggers by polling the repo's event feed: no public URL or webhook needed.
// Conditional requests (ETag) keep idle polls cheap; a GITHUB_TOKEN secret unlocks private repos.
import type { GitHubEvent } from '@ant/shared'

export const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/

export interface RawEvent {
  id: string
  type: string
  actor?: { login?: string }
  payload?: Record<string, any>
}

export interface Matched {
  id: string
  kind: GitHubEvent
  summary: Record<string, unknown>
}

const clip = (s: unknown, n = 1500) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '…' : s) : undefined)

/** Recognise the events routines can trigger on, with a compact summary for the ant. */
export function classify(e: RawEvent): Matched | null {
  const p = e.payload ?? {}
  const by = e.actor?.login
  switch (e.type) {
    case 'IssuesEvent':
      if (p.action !== 'opened') return null
      return { id: e.id, kind: 'issue.opened', summary: { by, number: p.issue?.number, title: p.issue?.title, url: p.issue?.html_url, body: clip(p.issue?.body) } }
    case 'PullRequestEvent': {
      const pr = p.pull_request ?? {}
      const s = { by, number: pr.number ?? p.number, title: pr.title, url: pr.html_url, branch: pr.head?.ref, body: clip(pr.body) }
      if (p.action === 'opened') return { id: e.id, kind: 'pr.opened', summary: s }
      if (p.action === 'closed' && pr.merged) return { id: e.id, kind: 'pr.merged', summary: s }
      return null
    }
    case 'PushEvent':
      return {
        id: e.id,
        kind: 'push',
        summary: { by, ref: p.ref, commits: (p.commits ?? []).slice(0, 20).map((c: any) => ({ message: clip(c.message, 300), author: c.author?.name })) },
      }
    case 'IssueCommentEvent':
    case 'PullRequestReviewCommentEvent':
      if (p.action !== 'created') return null
      return { id: e.id, kind: 'comment', summary: { by, on: p.issue?.title ?? p.pull_request?.title, url: p.comment?.html_url, body: clip(p.comment?.body) } }
    case 'ReleaseEvent':
      if (p.action !== 'published') return null
      return { id: e.id, kind: 'release', summary: { by, tag: p.release?.tag_name, name: p.release?.name, url: p.release?.html_url, notes: clip(p.release?.body) } }
    default:
      return null
  }
}

export type PollResult = { status: 'unchanged' } | { status: 'ok'; events: RawEvent[]; etag: string | null } | { status: 'error'; message: string }

export async function poll(repo: string, opts: { etag?: string | null; token?: string | null; fetch?: typeof fetch } = {}): Promise<PollResult> {
  const f = opts.fetch ?? fetch
  try {
    const r = await f(`https://api.github.com/repos/${repo}/events?per_page=50`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'ant-routines',
        'x-github-api-version': '2022-11-28',
        ...(opts.etag && { 'if-none-match': opts.etag }),
        ...(opts.token && { authorization: `Bearer ${opts.token}` }),
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (r.status === 304) return { status: 'unchanged' }
    if (r.status === 401) return { status: 'error', message: 'GitHub rejected the GITHUB_TOKEN secret. Replace it in Connectors → Secrets.' }
    if (r.status === 404) return { status: 'error', message: `GitHub can't see ${repo}. For a private repo, add a GITHUB_TOKEN secret.` }
    if (r.status === 403 || r.status === 429) return { status: 'error', message: 'GitHub rate limit reached; a GITHUB_TOKEN secret raises it.' }
    if (!r.ok) return { status: 'error', message: `GitHub answered ${r.status}` }
    return { status: 'ok', events: (await r.json()) as RawEvent[], etag: r.headers.get('etag') }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

/** Events newer than the last one seen, oldest first. The first poll only sets the baseline. */
export function newSince(events: RawEvent[], lastId: string | null): RawEvent[] {
  if (lastId === null) return []
  const fresh = events.filter((e) => BigInt(e.id) > BigInt(lastId))
  return fresh.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
}
