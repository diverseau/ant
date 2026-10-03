import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, normalize, resolve } from 'node:path'
import { insideFolder } from '../rules/engine.ts'
import { describeTool } from '../rules/describe.ts'
import { antDataDir } from '../config.ts'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import type { AntEvent, AntTemplate, ApprovalDecision, CreateAntInput, Health, UsageWindows } from '@ant/shared'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Broker } from '../broker.ts'
import type { Scheduler } from '../scheduler/runtime.ts'
import type { ChannelHub } from '../channels/hub.ts'
import * as R from '../db/repos/index.ts'
import { toMessage } from '../mappers.ts'
import { HttpError, type AntService } from '../service.ts'
import { probeUsage } from '../usage/probe.ts'
import { activity } from '../activity.ts'
import { exportAnt, importAnt } from '../templates.ts'
import { MemoryStore } from '../memory/store.ts'
import { Auth, LOCAL_HOSTS, SESSION_COOKIE, hostOf } from '../auth/auth.ts'
import { remoteStatus, setTailscale } from '../auth/remote.ts'
import { deleteCookie, setCookie } from 'hono/cookie'
import { LogoCache } from '../connectors/logos.ts'
import { MAX_AUDIO_BYTES, transcribe } from '../dictation/transcribe.ts'

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
const eventSpec = z.discriminatedUnion('source', [
  z.object({ source: z.literal('github'), repo: z.string().max(200), events: z.array(z.enum(['issue.opened', 'pr.opened', 'pr.merged', 'push', 'comment', 'release'])).max(6) }),
  z.object({ source: z.literal('slack'), on: z.enum(['mention', 'message', 'phrase', 'reaction']), channel: z.string().max(80).optional(), phrase: z.string().max(200).optional(), emoji: z.string().max(60).optional() }),
  z.object({ source: z.literal('watch'), url: z.string().max(2000), everyMinutes: z.number().int(), contains: z.string().max(200).optional() }),
])
const patchAnt = createAnt.partial().extend({
  status: z.enum(['idle', 'paused']).optional(),
  model: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,60}$/).optional(),
  effort: z.enum(['', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  fast: z.boolean().optional(),
  permissionMode: z.enum(['supervised', 'edits', 'auto', 'full']).optional(),
  muted: z.boolean().optional(),
  hidden: z.boolean().optional(),
})

export function startHttp(svc: AntService, broker: Broker, scheduler: Scheduler, channels: ChannelHub, health: () => Health) {
  const app = new Hono()
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  // Refuse cross-site requests (Origin) and DNS rebinding (Host). Remote host names come from
  // ANT_ALLOWED_HOSTS or Settings → Remote access. Then: this computer is trusted; every other
  // device needs a paired session (auth/auth.ts).
  const auth = new Auth(svc.db)
  const deviceOf = new WeakMap<Request, string>()
  const OPEN = new Set(['/api/auth/status', '/api/auth/pair'])
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin')
    const host = hostOf(c)
    const extraHosts = auth.allowedHosts()
    const hostOk = LOCAL_HOSTS.has(host) || extraHosts.includes(host)
    // Webhooks are called by other machines when Ant is exposed; they carry their own key.
    if (!hostOk && !c.req.path.startsWith('/hooks/')) return c.json({ error: 'Forbidden host' }, 403)
    if (origin && !ALLOWED_ORIGINS.test(origin)) {
      let originHost = ''
      try {
        originHost = new URL(origin).hostname.toLowerCase()
      } catch {}
      if (!extraHosts.includes(originHost)) return c.json({ error: 'Forbidden origin' }, 403)
    }
    const p = c.req.path
    if ((p.startsWith('/api/') || p === '/ws' || p.startsWith('/ws/')) && !OPEN.has(p) && !auth.trusted(c)) {
      const d = auth.device(c)
      if (!d) return c.json({ error: 'Pair this device to use Ant', code: 'auth' }, 401)
      deviceOf.set(c.req.raw, d.id)
    }
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

  /* ---------- devices and remote access ---------- */

  app.get('/api/auth/status', (c) => {
    const trusted = auth.trusted(c)
    const d = trusted ? null : auth.device(c)
    return c.json({ trusted, authenticated: trusted || !!d, device: d ? { id: d.id, name: d.name } : null })
  })

  app.post('/api/auth/pair', async (c) => {
    const b = await body(c, z.object({ code: z.string().max(40), name: z.string().max(60).optional() }))
    const r = auth.pair(b.code, b.name ?? '', c.req.header('user-agent') ?? '')
    if ('error' in r) return c.json({ error: r.error }, r.status)
    setCookie(c, SESSION_COOKIE, r.cookieValue, auth.cookieOptions(c))
    svc.emit({ type: 'notice', level: 'info', text: `${r.device.name} was paired with Ant.` })
    return c.json({ device: { id: r.device.id, name: r.device.name } })
  })

  app.post('/api/auth/logout', (c) => {
    const id = deviceOf.get(c.req.raw)
    if (id) auth.revoke(id)
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.body(null, 204)
  })

  app.post('/api/auth/pairing-code', (c) => c.json({ ...auth.newPairingCode(), urls: remoteStatus(svc, auth).urls }))

  app.get('/api/auth/devices', (c) => {
    const current = deviceOf.get(c.req.raw)
    return c.json(R.listDevices(svc.db).map((d) => ({ id: d.id, name: d.name, userAgent: d.userAgent, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt, current: d.id === current })))
  })

  app.delete('/api/auth/devices/:id', (c) => {
    if (!auth.revoke(c.req.param('id'))) throw new HttpError(404, 'No such device')
    return c.body(null, 204)
  })

  app.get('/api/remote', (c) => c.json(remoteStatus(svc, auth)))

  /* ---------- push notifications ---------- */

  const pushSub = z.object({ endpoint: z.string().url().max(2000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) })
  app.get('/api/push/key', (c) => c.json({ publicKey: svc.push!.publicKey() }))
  app.post('/api/push/subscribe', async (c) => {
    svc.push!.subscribe(deviceOf.get(c.req.raw) ?? null, await body(c, pushSub))
    return c.body(null, 204)
  })
  app.post('/api/push/unsubscribe', async (c) => {
    svc.push!.unsubscribe((await body(c, z.object({ endpoint: z.string().max(2000) }))).endpoint)
    return c.body(null, 204)
  })
  app.post('/api/push/test', async (c) => {
    const b = await body(c, z.object({ endpoint: z.string().max(2000) }))
    const sent = await svc.push!.send({ title: 'Ant', body: 'Notifications work on this device.', url: '/' }, [b.endpoint])
    if (!sent) throw new HttpError(502, 'The push service refused the test notification')
    return c.body(null, 204)
  })

  app.post('/api/remote/tailscale', async (c) => {
    if (!auth.trusted(c)) throw new HttpError(403, 'Change remote access from the computer Ant runs on')
    const b = await body(c, z.object({ enabled: z.boolean() }))
    await setTailscale(svc, b.enabled)
    return c.json(remoteStatus(svc, auth))
  })
  app.get('/api/bootstrap', (c) => c.json(svc.bootstrap(health())))

  app.post('/api/ants', async (c) => c.json(svc.createAnt((await body(c, createAnt)) as CreateAntInput), 201))
  app.patch('/api/ants/:id', async (c) => c.json(svc.updateAnt(c.req.param('id'), await body(c, patchAnt))))
  // Templates: export an ant to a file, import one, or duplicate (export + import in one step).
  app.get('/api/ants/:id/export', (c) => {
    const t = exportAnt(svc, scheduler, svc.antRow(c.req.param('id')).id)
    return c.json(t, 200, { 'content-disposition': `attachment; filename="${t.ant.name.replace(/[^\w.-]+/g, '-')}.ant.json"` })
  })
  app.post('/api/ants/import', async (c) => {
    const b = (await c.req.json().catch(() => null)) as { template?: AntTemplate; name?: string } | null
    if (!b?.template) throw new HttpError(400, 'Not an Ant template file.')
    return c.json(importAnt(svc, scheduler, b.template, b.name), 201)
  })
  app.post('/api/ants/:id/duplicate', (c) => {
    const id = svc.antRow(c.req.param('id')).id
    const t = exportAnt(svc, scheduler, id)
    return c.json(importAnt(svc, scheduler, t, `${t.ant.name} copy`), 201)
  })

  app.delete('/api/ants/:id', (c) => {
    svc.deleteAnt(c.req.param('id'))
    return c.body(null, 204)
  })

  app.post('/api/colonies', async (c) => {
    const b = await body(c, z.object({ name: z.string().max(60), memberIds: z.array(z.string()).min(2) }))
    return c.json(svc.createColony(b.name, b.memberIds), 201)
  })

  app.patch('/api/colonies/:id', async (c) => {
    const b = await body(c, z.object({ name: z.string().trim().min(1).max(60).optional(), memberIds: z.array(z.string()).optional(), leadAntId: z.string().optional() }))
    return c.json(svc.updateColony(c.req.param('id'), b))
  })
  app.delete('/api/colonies/:id', (c) => {
    svc.deleteColony(c.req.param('id'))
    return c.body(null, 204)
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

  // Secure secret card: the value goes into the vault and the ant gets it as an env var.
  app.post('/api/messages/:id/secret', async (c) => {
    const b = await body(c, z.object({ value: z.string().min(1).max(20_000).optional(), decline: z.boolean().optional() }))
    const m = R.getMessage(svc.db, c.req.param('id'))
    if (!m || m.kind !== 'secret') throw new HttpError(404, 'No such request')
    const p = m.payload as { name: string; description: string; state?: string }
    if (p.state) throw new HttpError(409, 'Already answered')
    const antId = m.author
    if (b.decline || !b.value) {
      svc.patch(m.id, { state: 'declined' })
      svc.enqueue(antId, { threadId: m.threadId, text: `[${svc.userName}] I declined to give you ${p.name}. Carry on without it, or tell me what you can't do.`, source: 'user', depth: 0, enqueuedAt: Date.now() })
      return c.body(null, 204)
    }
    const reg = svc.registry!
    const existing = reg.secrets().find((s) => s.name === p.name)
    if (existing) reg.updateSecret(existing.id, { value: b.value, antIds: [...new Set([...existing.antIds, antId])] })
    else reg.addSecret({ name: p.name, description: p.description || `Requested by ${R.getAnt(svc.db, antId)?.name ?? 'an ant'}`, value: b.value, antIds: [antId] })
    svc.patch(m.id, { state: 'saved' })
    // A fresh process gets the new environment variable.
    svc.refreshIdle()
    svc.enqueue(antId, { threadId: m.threadId, text: `[${svc.userName}] I saved ${p.name} for you. It's in your environment as $${p.name}. Carry on.`, source: 'user', depth: 0, enqueuedAt: Date.now() })
    return c.body(null, 204)
  })

  // 👍/👎 on an ant's reply (kept on the message; 👎 feedback itself is sent as a chat message).
  app.post('/api/messages/:id/rating', async (c) => {
    const b = await body(c, z.object({ rating: z.enum(['up', 'down']).nullable() }))
    const m = R.getMessage(svc.db, c.req.param('id'))
    if (!m || m.kind !== 'text' || m.author === 'user') throw new HttpError(404, 'No such reply')
    svc.patch(m.id, { rating: b.rating })
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
      broker.grantSend(m.author, finalBody)
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
      const deviceId = deviceOf.get(c.req.raw)
      let stop: (() => void) | null = null
      let untrack = () => {}
      return {
        async onOpen(_e, ws) {
          untrack = auth.trackSocket(deviceId, () => ws.close(4001, 'Device removed'))
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
          untrack()
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
        trigger: z.enum(['schedule', 'webhook', 'event', 'watch']).optional(),
        event: eventSpec.optional(),
      }),
    )
    return c.json(scheduler.create(b), 201)
  })
  app.patch('/api/routines/:id', async (c) => {
    const b = await body(
      c,
      z.object({ name: z.string().min(1).max(80).optional(), instruction: z.string().min(1).max(8000).optional(), when: z.string().max(200).optional(), tz: z.string().optional(), enabled: z.boolean().optional(), event: eventSpec.optional() }),
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
        label: r.label ?? (r.note?.startsWith('input:') ? `${r.pattern === 'Bash' ? 'Run' : r.pattern} · ${r.note.slice(6).replace(/\\"/g, '"').slice(0, 80)}` : describeTool(r.pattern, {}).title),
        written: r.source === 'user' && !!r.label,
        behaviour: r.behaviour,
        scope: r.scope,
        createdAt: r.createdAt,
      })),
    )
  })
  // Rules written in the app (Details → Rules → Add rule).
  app.post('/api/rules', async (c) => {
    const b = await body(c, z.object({
      antId: z.string().nullable(),
      pattern: z.string().min(1).max(400).regex(/^[\w*|.-]+$/, 'Tool patterns use letters, digits, _, -, . and * (| between alternatives)'),
      behaviour: z.enum(['allow', 'ask', 'handoff', 'deny']),
      inputContains: z.string().max(300).optional(),
      label: z.string().min(1).max(120),
    }))
    if (b.antId) svc.antRow(b.antId)
    const contains = b.inputContains?.trim()
    const rule = R.addRule(svc.db, {
      scope: b.antId ? 'ant' : 'global', antId: b.antId, pattern: b.pattern, behaviour: b.behaviour, source: 'user', label: b.label.trim(),
      ...(contains && { note: `input:${JSON.stringify(contains).slice(1, -1)}` }),
    })
    // Allow rules become part of the generated settings on the next session.
    if (b.behaviour === 'allow') svc.refreshIdle()
    return c.json({ id: rule.id }, 201)
  })

  // Plain-language rules: written into the ant's CLAUDE.md, so it follows them as instructions.
  app.get('/api/ants/:id/guidance', (c) => {
    const id = svc.antRow(c.req.param('id')).id
    return c.json({ ant: R.getSetting<string[]>(svc.db, `guidance.${id}`, []), all: R.getSetting<string[]>(svc.db, 'guidance.global', []) })
  })
  app.put('/api/ants/:id/guidance', async (c) => {
    const id = svc.antRow(c.req.param('id')).id
    const b = await body(c, z.object({ ant: z.array(z.string().min(1).max(500)).max(30).optional(), all: z.array(z.string().min(1).max(500)).max(30).optional() }))
    if (b.ant) R.setSetting(svc.db, `guidance.${id}`, b.ant.map((s) => s.trim()).filter(Boolean))
    if (b.all) R.setSetting(svc.db, 'guidance.global', b.all.map((s) => s.trim()).filter(Boolean))
    svc.refreshIdle()
    return c.body(null, 204)
  })

  app.delete('/api/rules/:id', (c) => {
    if (!R.deleteRule(svc.db, c.req.param('id'))) throw new HttpError(404, 'No such rule')
    // Allow rules are baked into each ant's generated settings; regenerate on next turn.
    svc.refreshIdle()
    return c.body(null, 204)
  })

  app.get('/api/ants/:id/skills', (c) => c.json(svc.skills.list(svc.pathsFor(svc.antRow(c.req.param('id')).id).folder)))
  // Skill manager (Details → Skills): read, write, share with the colony. Ants pick up changes on
  // their next session.
  const skillChanged = (scope: 'ant' | 'colony') => {
    if (scope === 'colony') for (const a of R.listAnts(svc.db)) svc.skills.sync(svc.pathsFor(a.id).folder)
    svc.emit({ type: 'skills.updated' })
    svc.refreshIdle()
  }
  app.get('/api/ants/:id/skills/:name', (c) => {
    const folder = svc.pathsFor(svc.antRow(c.req.param('id')).id).folder
    const s = svc.skills.read(folder, c.req.param('name'), c.req.query('scope') === 'colony' ? 'colony' : 'ant')
    if (!s) throw new HttpError(404, 'No such skill')
    return c.json(s)
  })
  app.put('/api/ants/:id/skills/:name', async (c) => {
    const folder = svc.pathsFor(svc.antRow(c.req.param('id')).id).folder
    const b = await body(c, z.object({ description: z.string().min(1).max(1024), body: z.string().min(1).max(60_000), scope: z.enum(['ant', 'colony']) }))
    const r = svc.skills.save(folder, { name: c.req.param('name'), description: b.description, body: b.body }, b.scope)
    if (!r.ok) throw new HttpError(400, r.errors.join(' '))
    skillChanged(b.scope)
    return c.json({ warnings: r.warnings })
  })
  app.post('/api/ants/:id/skills/:name/share', (c) => {
    const folder = svc.pathsFor(svc.antRow(c.req.param('id')).id).folder
    const r = svc.skills.share(folder, c.req.param('name'))
    if (!r.ok) throw new HttpError(400, r.errors.join(' '))
    skillChanged('colony')
    return c.body(null, 204)
  })
  app.delete('/api/ants/:id/skills/:name', (c) => {
    const id = svc.antRow(c.req.param('id')).id
    const scope = c.req.query('scope') === 'colony' ? 'colony' : 'ant'
    if (!svc.skills.remove(svc.pathsFor(id).folder, c.req.param('name'), scope)) throw new HttpError(404, 'No such skill')
    if (scope === 'colony') for (const a of R.listAnts(svc.db)) svc.skills.sync(svc.pathsFor(a.id).folder)
    svc.emit({ type: 'skills.updated' })
    return c.body(null, 204)
  })

  // Composer mic: the raw recording in the body, transcribed locally.
  app.post('/api/dictation', async (c) => {
    if (Number(c.req.header('content-length') ?? 0) > MAX_AUDIO_BYTES) throw new HttpError(413, 'Recording too long')
    const audio = Buffer.from(await c.req.arrayBuffer())
    if (!audio.length) throw new HttpError(400, 'No audio')
    if (audio.length > MAX_AUDIO_BYTES) throw new HttpError(413, 'Recording too long')
    try {
      return c.json({ text: await transcribe(svc.cfg, audio) })
    } catch (err) {
      throw new HttpError(502, `Dictation failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  const logos = new LogoCache(svc.cfg.dataDir)
  app.get('/api/logos/:domain', async (c) => {
    const png = await logos.get(c.req.param('domain'))
    if (!png) return c.body(null, 404, { 'cache-control': 'no-store' })
    return c.body(new Uint8Array(png), 200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800' })
  })

  app.get('/api/activity', (c) => c.json(activity(svc)))

  // Memory (Details → Memory): the ant's own notes and the shared profile of the user, entry by
  // entry, through the same store (limits and injection screening) the ant's memory tool uses.
  const memStore = (antId: string) => new MemoryStore({ memoryPath: svc.pathsFor(antId).memory, userPath: join(svc.cfg.antHome, 'USER.md') })
  app.get('/api/ants/:id/memory', (c) => {
    const st = memStore(svc.antRow(c.req.param('id')).id)
    return c.json({ memory: st.read('memory'), user: st.read('user'), limits: { memory: 2200, user: 1375 } })
  })
  app.post('/api/ants/:id/memory', async (c) => {
    const id = svc.antRow(c.req.param('id')).id
    const b = await body(c, z.object({ target: z.enum(['memory', 'user']), op: z.enum(['add', 'replace', 'remove']), text: z.string().max(2200).default(''), old: z.string().max(2200).optional() }))
    const st = memStore(id)
    const r = b.op === 'add' ? st.add(b.target, b.text) : b.op === 'replace' ? st.replace(b.target, b.old ?? '', b.text) : st.remove(b.target, b.old ?? '')
    if (!r.ok) throw new HttpError(400, r.error)
    // Memory is snapshotted into each session's instructions; USER.md is shared by every ant.
    svc.refreshIdle()
    return c.json({ memory: st.read('memory'), user: st.read('user') })
  })

  app.get('/api/usage', (c) => {
    const to = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
    return c.json({ windows: R.getSetting(svc.db, 'usage.windows', null), days: R.usageRange(svc.db, from, to) })
  })

  // Refresh button: one /usage probe at a time, shared by concurrent clicks.
  let probing: Promise<UsageWindows> | null = null
  app.post('/api/usage/refresh', async (c) => {
    probing ??= probeUsage(svc.cfg, R.getSetting<UsageWindows | null>(svc.db, 'usage.windows', null)).finally(() => (probing = null))
    let usage: UsageWindows
    try {
      usage = await probing
    } catch (err) {
      throw new HttpError(502, err instanceof Error ? err.message : 'Usage check failed')
    }
    R.setSetting(svc.db, 'usage.windows', usage)
    svc.emit({ type: 'usage', usage })
    return c.json(usage)
  })

  app.get(
    '/ws',
    upgradeWebSocket((c) => {
      const deviceId = deviceOf.get(c.req.raw)
      let off: (() => void) | null = null
      let visible = false
      const setVisible = (v: boolean) => {
        if (v !== visible) svc.visibleClients += v ? 1 : -1
        visible = v
      }
      return {
        onMessage(e) {
          try {
            const m = JSON.parse(String(e.data)) as { type?: string; visible?: unknown }
            if (m.type === 'presence') setVisible(m.visible === true)
          } catch {
            // ignore malformed frames
          }
        },
        onOpen(_e, ws) {
          const send = (e: AntEvent) => ws.send(JSON.stringify(e))
          svc.bus.on('event', send)
          const untrack = auth.trackSocket(deviceId, () => ws.close(4001, 'Device removed'))
          off = () => {
            svc.bus.off('event', send)
            untrack()
            setVisible(false)
          }
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
  '.webmanifest': 'application/manifest+json',
}
