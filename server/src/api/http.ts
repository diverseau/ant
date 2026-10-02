import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, normalize, resolve } from 'node:path'
import { insideFolder } from '../rules/engine.ts'
import { describeTool } from '../rules/describe.ts'
import { antDataDir } from '../config.ts'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import type { AntEvent, ApprovalDecision, CreateAntInput, Health } from '@ant/shared'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Broker } from '../broker.ts'
import type { Scheduler } from '../scheduler/runtime.ts'
import type { ChannelHub } from '../channels/hub.ts'
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

export function startHttp(svc: AntService, broker: Broker, scheduler: Scheduler, channels: ChannelHub, health: () => Health) {
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
  // Attachments land in the receiving ant's inbox/ (for a colony: its lead's).
  app.post('/api/threads/:id/attachments', async (c) => {
    const thread = R.getThread(svc.db, c.req.param('id'))
    if (!thread) throw new HttpError(404, 'No such thread')
    const antId = thread.kind === 'ant' ? thread.refId : (R.getColony(svc.db, thread.refId)?.leadAntId ?? R.getColony(svc.db, thread.refId)?.memberIds[0])
    if (!antId) throw new HttpError(400, 'No ant to receive files')
    const form = await c.req.parseBody({ all: true })
    const files = ([] as unknown[]).concat(form.file ?? []).filter((f): f is File => f instanceof File)
    if (!files.length) throw new HttpError(400, 'No files')
    if (files.length > 6) throw new HttpError(400, 'Up to 6 files at a time')
    const inbox = join(svc.pathsFor(antId).folder, 'inbox')
    mkdirSync(inbox, { recursive: true })
    const saved: { name: string; path: string; bytes: number }[] = []
    for (const f of files) {
      if (f.size > 25 * 1024 * 1024) throw new HttpError(413, `${f.name} is over 25 MB`)
      const safe = basename(f.name).replace(/[^\w.\- ]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file'
      let name = safe
      for (let i = 2; existsSync(join(inbox, name)); i++) name = safe.replace(/(\.[^.]*)?$/, ` (${i})$1`)
      writeFileSync(join(inbox, name), Buffer.from(await f.arrayBuffer()))
      saved.push({ name, path: `inbox/${name}`, bytes: f.size })
    }
    return c.json({ antId, files: saved }, 201)
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

  app.get('/api/ants/:id/computer', (c) => c.json(svc.computers.state(svc.antRow(c.req.param('id')).id)))
  app.post('/api/ants/:id/computer/start', async (c) => {
    const id = svc.antRow(c.req.param('id')).id
    await svc.ensureComputer(id)
    return c.json(svc.computers.state(id))
  })
  app.post('/api/ants/:id/computer/lease', async (c) => {
    const id = svc.antRow(c.req.param('id')).id
    const b = await body(c, z.object({ holder: z.enum(['ant', 'user']) }))
    if (b.holder === 'user') await svc.ensureComputer(id)
    const was = svc.computers.lease(id)
    svc.computers.setLease(id, b.holder)
    if (was === 'user' && b.holder === 'ant') {
      svc.system(svc.antThread(id).id, `You handed the computer back`)
      broker.completeHandoffs(id)
    }
    return c.json(svc.computers.state(id))
  })

  // Teach a task: record a demonstration, then ask the ant to turn it into a skill.
  app.post('/api/ants/:id/computer/teach', async (c) => {
    const id = svc.antRow(c.req.param('id')).id
    const b = await body(c, z.object({ action: z.enum(['start', 'stop', 'cancel']), title: z.string().max(120).optional() }))
    const folder = svc.pathsFor(id).folder
    if (b.action === 'start') {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      try {
        svc.computers.startTeaching(id, join(folder, 'teach', stamp), b.title?.trim() || 'a task')
      } catch (err) {
        throw new HttpError(409, err instanceof Error ? err.message : String(err))
      }
      return c.json(svc.computers.state(id))
    }
    const rec = svc.computers.stopTeaching(id)
    if (rec && b.action === 'stop') {
      const rel = rec.dir.slice(folder.length + 1)
      const title = rec.md.split('\n')[0].replace(/^# Demonstration: /, '')
      svc.computers.setLease(id, 'ant')
      svc.system(svc.antThread(id).id, `You showed ${svc.antRow(id).name} how to ${title}`)
      svc.enqueue(id, {
        threadId: svc.antThread(id).id,
        text: `[${svc.userName}] I just showed you on your computer how to: ${title}. The recording is in ${rel}/steps.md, with screenshots next to it. Read it and look at the screenshots, then draft a skill with save_skill: when to use it, inputs, the steps, how to check it worked, what to return, and what needs my approval. Generalise where I clicked specific examples. Ask me about anything ambiguous before saving.`,
        source: 'user',
        depth: 0,
        enqueuedAt: Date.now(),
      })
    }
    return c.json(svc.computers.state(id))
  })

  app.get(
    '/ws/ants/:id/screen',
    upgradeWebSocket((c) => {
      const antId = c.req.param('id') ?? ''
      let stop: (() => void) | null = null
      return {
        async onOpen(_e, ws) {
          try {
            const id = svc.antRow(antId).id
            stop = await svc.computers.watch(id, svc.pathsFor(id).folder, svc.cdpPort(id), (f) => ws.send(JSON.stringify({ type: 'frame', ...f })))
          } catch (err) {
            ws.send(JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : String(err) }))
          }
        },
        onMessage(e) {
          try {
            void svc.computers.input(antId, JSON.parse(String(e.data))).catch(() => {})
          } catch {
            // ignore malformed input
          }
        },
        onClose() {
          stop?.()
        },
      }
    }),
  )

  // Connectors and secrets (plan §11). Secret values go in, never out.
  const reg = () => svc.registry!
  const connectorsView = () => ({ claudeAi: reg().claudeAi(), custom: reg().custom(), secrets: reg().secrets() })
  const changed = () => {
    svc.emitConnectors()
    svc.refreshIdle()
  }
  app.get('/api/connectors', (c) => c.json(connectorsView()))
  app.patch('/api/connectors/claudeai', async (c) => {
    const b = await body(c, z.object({ key: z.string(), disabledFor: z.array(z.string()) }))
    reg().setClaudeAiDisabled(b.key, b.disabledFor)
    changed()
    return c.json(connectorsView())
  })
  app.post('/api/connectors', async (c) => {
    const b = await body(
      c,
      z.object({
        name: z.string().min(1).max(40),
        transport: z.enum(['http', 'stdio']),
        url: z.string().url().optional(),
        headers: z.record(z.string(), z.string()).optional(),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
        allAnts: z.boolean().optional(),
        antIds: z.array(z.string()).optional(),
      }),
    )
    reg().addCustom(b)
    changed()
    return c.json(connectorsView(), 201)
  })
  app.patch('/api/connectors/:id', async (c) => {
    const b = await body(c, z.object({ allAnts: z.boolean(), antIds: z.array(z.string()) }))
    reg().scopeCustom(c.req.param('id'), b.allAnts, b.antIds)
    changed()
    return c.json(connectorsView())
  })
  app.delete('/api/connectors/:id', (c) => {
    reg().removeCustom(c.req.param('id'))
    changed()
    return c.json(connectorsView())
  })
  app.post('/api/secrets', async (c) => {
    const b = await body(c, z.object({ name: z.string(), description: z.string().max(300).default(''), value: z.string().min(1).max(20_000), allAnts: z.boolean().optional(), antIds: z.array(z.string()).optional() }))
    reg().addSecret(b)
    changed()
    return c.json(connectorsView(), 201)
  })
  app.patch('/api/secrets/:id', async (c) => {
    const b = await body(c, z.object({ description: z.string().max(300).optional(), value: z.string().max(20_000).optional(), allAnts: z.boolean().optional(), antIds: z.array(z.string()).optional() }))
    reg().updateSecret(c.req.param('id'), b)
    changed()
    return c.json(connectorsView())
  })
  app.delete('/api/secrets/:id', (c) => {
    reg().removeSecret(c.req.param('id'))
    changed()
    return c.json(connectorsView())
  })

  // Channels: chat with ants from Telegram / Discord / Slack.
  app.get('/api/channels', (c) => c.json(channels.statuses()))
  app.put('/api/channels/:kind', async (c) => {
    const kind = z.enum(['telegram', 'discord', 'slack']).parse(c.req.param('kind'))
    const b = await body(c, z.object({ enabled: z.boolean(), tokenSecret: z.string().min(1), allowUsers: z.array(z.string().min(1)).min(1, 'Add at least one allowed user id') }))
    await channels.configure({ kind, ...b })
    return c.json(channels.statuses())
  })
  app.delete('/api/channels/:kind', async (c) => {
    await channels.remove(z.enum(['telegram', 'discord', 'slack']).parse(c.req.param('kind')))
    return c.json(channels.statuses())
  })

  // Routines
  app.get('/api/routines', (c) => c.json(scheduler.list(c.req.query('antId'))))
  app.post('/api/routines', async (c) => {
    const b = await body(
      c,
      z.object({
        antId: z.string(),
        name: z.string().min(1).max(80),
        instruction: z.string().min(1).max(8000),
        when: z.string().max(200).default(''),
        tz: z.string().optional(),
        trigger: z.enum(['schedule', 'webhook']).optional(),
      }),
    )
    return c.json(scheduler.create(b), 201)
  })
  app.patch('/api/routines/:id', async (c) => {
    const b = await body(
      c,
      z.object({ name: z.string().min(1).max(80).optional(), instruction: z.string().min(1).max(8000).optional(), when: z.string().max(200).optional(), tz: z.string().optional(), enabled: z.boolean().optional() }),
    )
    return c.json(scheduler.update(c.req.param('id'), b))
  })
  app.delete('/api/routines/:id', (c) => {
    scheduler.delete(c.req.param('id'))
    return c.body(null, 204)
  })
  app.post('/api/routines/:id/test', (c) => {
    scheduler.fire(scheduler.get(c.req.param('id')), { trigger: 'test' })
    return c.body(null, 202)
  })
  app.get('/api/routines/:id/runs', (c) => c.json(scheduler.runs(scheduler.get(c.req.param('id')).id)))
  app.get('/api/settings', (c) => c.json(svc.settings()))
  app.patch('/api/settings', async (c) => {
    const b = await body(
      c,
      z.object({ userName: z.string().max(40).optional(), timezone: z.string().optional(), defaultModel: z.string().max(60).optional(), maxBusy: z.number().int().min(1).max(10).optional() }),
    )
    return c.json(svc.updateSettings(b))
  })
  app.put('/api/settings/timezone', async (c) => {
    const b = await body(c, z.object({ timezone: z.string().min(1) }))
    try {
      new Intl.DateTimeFormat('en', { timeZone: b.timezone })
    } catch {
      throw new HttpError(400, 'Unknown time zone')
    }
    R.setSetting(svc.db, 'timezone', b.timezone)
    return c.body(null, 204)
  })

  // Webhook trigger: 202 means the run started, not that it finished (Grok Bot semantics).
  app.post('/hooks/:id', async (c) => {
    const r = scheduler.verifyWebhook(c.req.param('id'), c.req.header('authorization'))
    const raw = await c.req.text()
    if (raw.length > 64_000) throw new HttpError(413, 'Payload too large')
    let payload: unknown = raw
    try {
      payload = raw ? JSON.parse(raw) : undefined
    } catch {
      // keep as text
    }
    scheduler.fire(r, { trigger: 'webhook', payload })
    return c.json({ started: true }, 202)
  })

  // Files an ant made, for the file card's Open. Only inside that ant's folder.
  app.get('/api/ants/:id/file', (c) => {
    const id = svc.antRow(c.req.param('id')).id
    const folder = svc.pathsFor(id).folder
    const rel = c.req.query('path') ?? ''
    const abs = resolve(folder, rel)
    if (!insideFolder(folder, abs) || !existsSync(abs) || !statSync(abs).isFile()) throw new HttpError(404, 'No such file')
    if (/(^|\/)\.|(^|\/)browser\//.test(rel)) throw new HttpError(403, 'Not shareable')
    const size = statSync(abs).size
    if (size > 20 * 1024 * 1024) throw new HttpError(413, 'File too large to preview')
    const type = MIME[extname(abs).toLowerCase()] ?? (TEXT_EXT.test(abs) ? 'text/plain; charset=utf-8' : 'application/octet-stream')
    return c.body(readFileSync(abs), 200, {
      'content-type': type,
      'content-disposition': `${c.req.query('download') ? 'attachment' : 'inline'}; filename="${basename(abs).replace(/"/g, '')}"`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    })
  })

  app.get('/api/ants/:id/snapshots/:msg', (c) => {
    const id = svc.antRow(c.req.param('id')).id
    const msg = c.req.param('msg').replace(/\.jpg$/, '')
    if (!/^[\w-]+$/.test(msg)) throw new HttpError(400, 'Bad id')
    const file = join(antDataDir(svc.cfg, id), 'snapshots', `${msg}.jpg`)
    if (!existsSync(file)) throw new HttpError(404, 'No snapshot')
    return c.body(readFileSync(file), 200, { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' })
  })

  app.get('/api/search', (c) => {
    const q = (c.req.query('q') ?? '').slice(0, 200)
    if (q.trim().length < 2) return c.json([])
    return c.json(
      R.searchMessages(svc.db, q, { limit: 20 }).map((r) => ({
        threadId: r.message.threadId,
        messageId: r.message.id,
        author: r.message.author,
        at: r.message.createdAt,
        snippet: r.snippet.replace(/<mark>/g, '\u0001').replace(/<\/mark>/g, '\u0002'),
      })),
    )
  })

  app.get('/api/ants/:id/rules', (c) => {
    const id = svc.antRow(c.req.param('id')).id
    return c.json(
      R.listRules(svc.db, { antId: id }).map((r) => ({
        id: r.id,
        pattern: r.pattern,
        label: describeTool(r.pattern, {}).title,
        behaviour: r.behaviour,
        scope: r.scope,
        createdAt: r.createdAt,
      })),
    )
  })
  app.delete('/api/rules/:id', (c) => {
    if (!R.deleteRule(svc.db, c.req.param('id'))) throw new HttpError(404, 'No such rule')
    // Allow rules are baked into each ant's generated settings; regenerate on next turn.
    svc.refreshIdle()
    return c.body(null, 204)
  })

  app.get('/api/ants/:id/skills', (c) => c.json(svc.skills.list(svc.pathsFor(svc.antRow(c.req.param('id')).id).folder)))
  app.delete('/api/ants/:id/skills/:name', (c) => {
    const id = svc.antRow(c.req.param('id')).id
    const scope = c.req.query('scope') === 'colony' ? 'colony' : 'ant'
    if (!svc.skills.remove(svc.pathsFor(id).folder, c.req.param('name'), scope)) throw new HttpError(404, 'No such skill')
    if (scope === 'colony') for (const a of R.listAnts(svc.db)) svc.skills.sync(svc.pathsFor(a.id).folder)
    svc.emit({ type: 'skills.updated' })
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

const TEXT_EXT = /\.(md|txt|csv|tsv|log|ts|tsx|js|jsx|py|rb|go|rs|java|c|h|cpp|sh|yaml|yml|toml|ini|xml|sql|svelte|vue|css|scss)$/i

const MIME: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.json': 'application/json',
}
