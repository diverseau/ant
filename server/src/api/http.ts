import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import type { AntEvent, ApprovalDecision, CreateAntInput, Health } from '@ant/shared'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Broker } from '../broker.ts'
import * as R from '../db/repos/index.ts'
import { toMessage } from '../mappers.ts'
import { HttpError, type AntService } from '../service.ts'

const WEB_DIST = fileURLToPath(new URL('../../../web/dist/', import.meta.url))
const ALLOWED_ORIGINS = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/

const colors = z.enum(['coral', 'purple', 'yellow', 'green', 'blue'])
const accessories = z.enum(['none', 'satchel', 'leaf', 'wrench', 'glasses'])
const createAnt = z.object({
  name: z.string().min(1).max(40),
  label: z.string().max(40).optional(),
  description: z.string().max(4000),
  color: colors,
  accessory: accessories,
  model: z.string().optional(),
})
const patchAnt = createAnt.partial().extend({ status: z.enum(['idle', 'paused']).optional() })

export function startHttp(svc: AntService, broker: Broker, health: () => Health) {
  const app = new Hono()
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  // Local-only service: refuse cross-site requests from other origins in the browser.
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin')
    if (origin && !ALLOWED_ORIGINS.test(origin)) return c.json({ error: 'Forbidden origin' }, 403)
    await next()
  })

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400)
    if (err instanceof z.ZodError) return c.json({ error: err.issues.map((i) => i.message).join('; ') }, 400)
    console.error(err)
    return c.json({ error: 'Internal error' }, 500)
  })

  const body = async <T>(c: Context, schema: z.ZodType<T>): Promise<T> => schema.parse(await c.req.json().catch(() => ({})))

  app.get('/api/health', (c) => c.json(health()))
  app.get('/api/bootstrap', (c) => c.json(svc.bootstrap(health())))

  app.post('/api/ants', async (c) => c.json(svc.createAnt((await body(c, createAnt)) as CreateAntInput), 201))
  app.patch('/api/ants/:id', async (c) => c.json(svc.updateAnt(c.req.param('id'), await body(c, patchAnt))))
  app.delete('/api/ants/:id', (c) => {
    svc.deleteAnt(c.req.param('id'))
    return c.body(null, 204)
  })

  app.post('/api/colonies', async (c) => {
    const b = await body(c, z.object({ name: z.string().max(60), memberIds: z.array(z.string()).min(2) }))
    return c.json(svc.createColony(b.name, b.memberIds), 201)
  })

  app.get('/api/threads/:id/messages', (c) => {
    const before = c.req.query('before')
    return c.json(R.listMessages(svc.db, c.req.param('id'), { before, limit: 50 }).map(toMessage))
  })
  app.post('/api/threads/:id/messages', async (c) => {
    const b = await body(c, z.object({ text: z.string().min(1).max(50_000) }))
    svc.sendFromUser(c.req.param('id'), b.text)
    return c.body(null, 202)
  })
  app.post('/api/threads/:id/stop', (c) => {
    svc.stopThread(c.req.param('id'))
    return c.body(null, 202)
  })
  app.post('/api/threads/:id/read', (c) => {
    svc.markRead(c.req.param('id'))
    return c.body(null, 204)
  })
  app.patch('/api/threads/:id', async (c) => {
    const b = await body(c, z.object({ pinned: z.boolean().optional() }))
    const t = R.updateThread(svc.db, c.req.param('id'), { ...(b.pinned !== undefined && { pinned: b.pinned }) })
    if (!t) throw new HttpError(404, 'No such thread')
    return c.body(null, 204)
  })

  app.post('/api/approvals/:id', async (c) => {
    const b = await body(c, z.object({ decision: z.enum(['once', 'always', 'deny']) }))
    broker.decide(c.req.param('id'), b.decision as ApprovalDecision)
    return c.body(null, 204)
  })

  app.post('/api/messages/:id/draft', async (c) => {
    const b = await body(c, z.object({ action: z.enum(['send', 'discard']), body: z.string().max(50_000).optional() }))
    const m = R.getMessage(svc.db, c.req.param('id'))
    if (!m || m.kind !== 'draft') throw new HttpError(404, 'No such draft')
    const p = m.payload as { to: string; subject?: string; body: string; channel: string; state?: string }
    if (p.state) throw new HttpError(409, 'Draft already handled')
    const finalBody = b.body ?? p.body
    svc.patch(m.id, { state: b.action === 'send' ? 'sent' : 'discarded', body: finalBody })
    if (b.action === 'send') {
      broker.grantSend(m.author)
      svc.enqueue(m.author, {
        threadId: m.threadId,
        text: `[${svc.userName}] Approved. Send this ${p.channel === 'slack' ? 'Slack message' : 'email'} to ${p.to} now, exactly as written below, then confirm in one line. If you have no tool that can send it, say so.\n\n${p.subject ? `Subject: ${p.subject}\n\n` : ''}${finalBody}`,
        source: 'user',
        depth: 0,
        enqueuedAt: Date.now(),
      })
    }
    return c.body(null, 204)
  })

  app.get('/api/usage', (c) => {
    const to = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
    return c.json({ windows: R.getSetting(svc.db, 'usage.windows', null), days: R.usageRange(svc.db, from, to) })
  })

  app.get(
    '/ws',
    upgradeWebSocket(() => {
      let off: (() => void) | null = null
      return {
        onOpen(_e, ws) {
          const send = (e: AntEvent) => ws.send(JSON.stringify(e))
          svc.bus.on('event', send)
          off = () => svc.bus.off('event', send)
        },
        onClose() {
          off?.()
        },
      }
    }),
  )

  // Production: serve the built web app from the same origin.
  app.get('*', (c) => {
    if (!existsSync(WEB_DIST)) return c.text('Ant web app not built. Run `npm -w ant-web run build`, or use the Vite dev server.', 404)
    const rel = normalize(c.req.path).replace(/^(\.\.[/\\])+/, '')
    let file = join(WEB_DIST, rel)
    if (!file.startsWith(WEB_DIST) || !existsSync(file) || rel === '/') file = join(WEB_DIST, 'index.html')
    return c.body(readFileSync(file), 200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  })

  const server = serve({ fetch: app.fetch, port: svc.cfg.port, hostname: svc.cfg.host })
  injectWebSocket(server)
  return server
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.json': 'application/json',
}
