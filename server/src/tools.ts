// IPC handlers behind the `ant` MCP server's tools (plan §5).
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, resolve } from 'node:path'
import type { Broker } from './broker.ts'
import * as R from './db/repos/index.ts'
import { toAnt } from './mappers.ts'
import { insideFolder } from './rules/engine.ts'
import type { AntService } from './service.ts'
import { evaluateFloors } from './rules/floors.ts'

type P = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function registerTools(svc: AntService, broker: Broker) {
  const ipc = svc.ipc

  ipc.on('permission', (antId, p) => broker.permission(antId, p as { tool_name?: string; input?: unknown }))
  ipc.on('request_approval', (antId, p) => broker.requestApproval(antId, p as P))

  // PreToolUse floors (plan §4). Hardline patterns land with the rules-patterns port.
  ipc.on('pretool', (antId, p) => floors.check(svc, antId, p))

  ipc.on('report_checklist', (antId, p) => {
    const items = Array.isArray(p.items) ? p.items : []
    svc.insert(svc.threadForAnt(antId), antId, 'checklist', {
      items: items.slice(0, 20).map((i: P) => ({ service: str(i.service), result: str(i.result), detail: str(i.detail) || undefined, ok: i.ok !== false })),
    })
    return 'Shown to the user.'
  })

  ipc.on('present_draft', (antId, p) => {
    svc.insert(svc.threadForAnt(antId), antId, 'draft', {
      channel: p.channel === 'slack' ? 'slack' : 'email',
      to: str(p.to),
      subject: str(p.subject) || undefined,
      body: str(p.body),
    })
    return `Draft shown to ${svc.userName}. Nothing has been sent. If they press Send you'll get a message telling you to send it; until then, don't send it any other way.`
  })

  ipc.on('set_status', (antId, p) => {
    svc.setActivity(antId, str(p.text).slice(0, 80))
    return 'ok'
  })

  ipc.on('list_ants', (antId) => {
    const ants = R.listAnts(svc.db).map((a) => {
      const ant = toAnt(a)
      return `- ${a.name}${a.id === antId ? ' (you)' : ''}${a.label ? ` · ${a.label}` : ''} · ${ant.status}: ${a.description.split('\n')[0].slice(0, 140)}`
    })
    const colonies = R.listColonies(svc.db)
      .filter((c) => c.memberIds.includes(antId))
      .map((c) => `- ${c.name}: ${c.memberIds.map((m) => R.getAnt(svc.db, m)?.name).join(', ')}`)
    return `Ants:\n${ants.join('\n')}\n\nYour colonies:\n${colonies.join('\n') || '- none'}`
  })

  ipc.on('message_ant', (antId, p) => svc.messageAnt(antId, str(p.to), str(p.text)))
  ipc.on('post_to_colony', (antId, p) => svc.postToColony(antId, str(p.colony), str(p.text)))

  ipc.on('memory', (antId, p) => memory(svc, antId, p))

  ipc.on('share_file', (antId, p) => {
    const folder = svc.pathsFor(antId).folder
    const raw = str(p.path)
    const path = isAbsolute(raw) ? raw : resolve(folder, raw)
    if (!insideFolder(folder, path)) return 'You can only share files from your own folder.'
    if (!existsSync(path)) return `No file at ${raw}.`
    const st = statSync(path)
    if (!st.isFile()) return `${raw} is not a file.`
    svc.insert(svc.threadForAnt(antId), antId, 'file', { path: path.slice(folder.length + 1), name: basename(path), bytes: st.size })
    return 'Shown to the user.'
  })

  ipc.on('notify', (antId, p) => {
    const ant = R.getAnt(svc.db, antId)
    const text = str(p.text).slice(0, 200)
    svc.emit({ type: 'notice', level: p.urgency === 'high' ? 'warn' : 'info', text: `${ant?.name ?? 'An ant'}: ${text}` })
    execFile('notify-send', ['-a', 'Ant', `-u`, p.urgency === 'high' ? 'critical' : 'normal', ant?.name ?? 'Ant', text], () => {})
    return 'Notified.'
  })
}

/* ---------- floors ---------- */

export const floors = {
  /** Hardline command floors + (later) the computer lease (plan §4). */
  check(svc: AntService, antId: string, p: P): { action: 'block' | 'ask' | 'pass'; message?: string } {
    if (p.tool_name === 'Bash') {
      const input = (p.tool_input ?? {}) as P
      const v = evaluateFloors(str(input.command), { cwd: svc.pathsFor(antId).folder, home: process.env.HOME })
      if (v.action === 'block') return { action: 'block', message: `Blocked by Ant: ${v.message}` }
      if (v.action === 'ask') return { action: 'ask', message: v.matches.map((m) => m.title).join(', ') }
    }
    return { action: 'pass' }
  },
}

/* ---------- memory (simple store until the Hermes port lands) ---------- */

const DELIM = '\n§\n'

function memory(svc: AntService, antId: string, p: P): string {
  const file = svc.pathsFor(antId).memory
  const entries = (existsSync(file) ? readFileSync(file, 'utf8') : '')
    .split(DELIM)
    .map((e) => e.trim())
    .filter(Boolean)
  const text = str(p.text).trim()
  const old = str(p.old_text).trim()
  const save = (list: string[]) => writeFileSync(file, list.join(DELIM) + (list.length ? '\n' : ''))
  if (p.op === 'add') {
    if (!text) return 'Nothing to add.'
    if (entries.includes(text)) return 'Already remembered.'
    if ([...entries, text].join(DELIM).length > 2200) return 'Memory is full (2,200 chars). Replace or remove an entry first.'
    save([...entries, text])
    return 'Remembered.'
  }
  const idx = entries.findIndex((e) => e === old) >= 0 ? entries.findIndex((e) => e === old) : entries.findIndex((e) => old && e.includes(old))
  if (idx < 0) return `No memory entry contains "${old}".`
  if (p.op === 'remove') {
    entries.splice(idx, 1)
    save(entries)
    return 'Forgotten.'
  }
  if (!text) return 'Nothing to replace with.'
  entries[idx] = text
  save(entries)
  return 'Updated.'
}
