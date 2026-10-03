// IPC handlers behind the `ant` MCP server's tools (plan §5).
import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { MemoryStore } from './memory/store.ts'
import { SEND_TOOL, targetsSelf, type Broker } from './broker.ts'
import type { Scheduler } from './scheduler/runtime.ts'
import * as R from './db/repos/index.ts'
import { toAnt } from './mappers.ts'
import { insideFolder } from './rules/engine.ts'
import type { AntService } from './service.ts'
import { evaluateFloors } from './rules/floors.ts'

type P = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function registerTools(svc: AntService, broker: Broker, scheduler: Scheduler) {
  const ipc = svc.ipc

  ipc.on('permission', (antId, p) => broker.permission(antId, p as { tool_name?: string; input?: unknown }))
  ipc.on('request_approval', (antId, p) => broker.requestApproval(antId, p as P))

  // PreToolUse floors (plan §4). Hardline patterns land with the rules-patterns port.
  ipc.on('pretool', (antId, p) => floors.check(svc, antId, p))
  ipc.on('request_handoff', (antId, p) => broker.requestHandoff(antId, str(p.reason)))

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

  // Helper ants (plan §6): an ant may propose a new specialist; the user approves it.
  ipc.on('create_ant', async (antId, p) => {
    const name = str(p.name).trim().slice(0, 40)
    const job = str(p.job).trim().slice(0, 40)
    const instructions = str(p.instructions).trim()
    if (!name || !instructions) return 'A helper needs a name and instructions.'
    const ok = await broker.requestApproval(antId, { action: `Hatch a new ant: ${name}${job ? ` (${job})` : ''}`, detail: instructions.slice(0, 300), risk: 'medium' })
    if (!/^Approved/.test(ok)) return `Not created: ${ok}`
    const colors = ['coral', 'purple', 'yellow', 'green', 'blue'] as const
    try {
      const ant = svc.createAnt({ name, label: job || undefined, description: instructions, color: colors[R.listAnts(svc.db).length % colors.length], accessory: 'none' })
      return `Hatched ${ant.name}. Use message_ant to give it work.`
    } catch (err) {
      return `Not created: ${err instanceof Error ? err.message : String(err)}`
    }
  })
  ipc.on('post_to_colony', (antId, p) => svc.postToColony(antId, str(p.colony), str(p.text)))

  ipc.on('memory', (antId, p) => memory(svc, antId, p))

  // Skills (plan §9): saved through antd because .claude/skills is write-protected for ants.
  ipc.on('save_skill', async (antId, p) => {
    const folder = svc.pathsFor(antId).folder
    const shared = p.shared === true
    const input = {
      name: str(p.name).trim(),
      description: str(p.description).trim(),
      body: str(p.body),
      files: Array.isArray(p.files) ? (p.files as P[]).map((f) => ({ path: str(f.path), content: str(f.content) })) : undefined,
    }
    if (shared) {
      const ok = await broker.requestApproval(antId, { action: `Share the skill "${input.name}" with every ant`, detail: input.description, risk: 'medium' })
      if (!/^Approved/.test(ok)) return `Not shared: ${ok}`
    }
    const r = svc.skills.save(folder, input, shared ? 'colony' : 'ant')
    if (!r.ok) return `Skill not saved:\n- ${r.errors.join('\n- ')}`
    if (shared) for (const a of R.listAnts(svc.db)) svc.skills.sync(svc.pathsFor(a.id).folder)
    svc.system(svc.threadForAnt(antId), `${R.getAnt(svc.db, antId)?.name ?? 'An ant'} saved the skill /${input.name}${shared ? ' for the whole colony' : ''}`)
    svc.emit({ type: 'skills.updated' })
    return `Saved /${input.name}.${r.warnings.length ? ` Warnings: ${r.warnings.join('; ')}` : ''} It's available from your next session; the user can run it with /${input.name}.`
  })
  ipc.on('delete_skill', (antId, p) => {
    const ok = svc.skills.remove(svc.pathsFor(antId).folder, str(p.name), 'ant')
    if (ok) svc.emit({ type: 'skills.updated' })
    return ok ? `Deleted /${str(p.name)}.` : `You have no skill called ${str(p.name)} (colony skills can only be removed by the user).`
  })

  // Routines (plan §8): created by asking the ant in chat.
  const routineErr = (err: unknown) => `Not saved: ${err instanceof Error ? err.message : String(err)}`
  ipc.on('schedule_routine', (antId, p) => {
    try {
      const { routine, key } = scheduler.create({ antId, name: str(p.name), instruction: str(p.instruction), when: str(p.when), tz: str(p.tz) || undefined, trigger: p.webhook ? 'webhook' : 'schedule' })
      if (key) return `Saved webhook routine "${routine.name}". POST to ${routine.webhookUrl} with header "Authorization: Bearer ${key}" (shown once; tell the user to store it). JSON bodies are passed to you.`
      return `Saved routine "${routine.name}": ${routine.when}. Next run ${routine.nextRunAt ? new Date(routine.nextRunAt).toLocaleString('en-AU', { timeZone: routine.tz }) : 'never'}. It doesn't run now; the user can press Test to try it.`
    } catch (err) {
      return routineErr(err)
    }
  })
  ipc.on('list_routines', (antId) => {
    const list = scheduler.list(antId)
    return list.length ? list.map((r) => `- ${r.name} · ${r.enabled ? 'active' : 'paused'} · ${r.when} · ${r.instruction.slice(0, 100)}`).join('\n') : 'No routines yet.'
  })
  ipc.on('edit_routine', (antId, p) => {
    const r = scheduler.findByName(antId, str(p.name))
    if (!r) return `You have no routine called ${str(p.name)}.`
    try {
      const v = scheduler.update(r.id, {
        ...(p.instruction !== undefined && { instruction: str(p.instruction) }),
        ...(p.when !== undefined && { when: str(p.when) }),
        ...(p.enabled !== undefined && { enabled: p.enabled === true }),
      })
      return `Updated "${v.name}": ${v.enabled ? v.when : 'paused'}.`
    } catch (err) {
      return routineErr(err)
    }
  })
  ipc.on('delete_routine', (antId, p) => {
    const r = scheduler.findByName(antId, str(p.name))
    if (!r) return `You have no routine called ${str(p.name)}.`
    scheduler.delete(r.id)
    return `Deleted "${r.name}".`
  })

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
    svc.alert({ title: ant?.name ?? 'Ant', body: text, url: `/?thread=${svc.threadForAnt(antId)}` }, true)
    if (!process.env.ANT_NO_DESKTOP_NOTIFY) execFile('notify-send', ['-a', 'Ant', `-u`, p.urgency === 'high' ? 'critical' : 'normal', ant?.name ?? 'Ant', text], () => {})
    return 'Notified.'
  })
}

/* ---------- floors ---------- */

export const floors = {
  /** Hardline command floors + (later) the computer lease (plan §4). */
  async check(svc: AntService, antId: string, p: P): Promise<{ action: 'block' | 'ask' | 'pass'; message?: string }> {
    const tool = str(p.tool_name)
    // Full access and auto mode skip Ant's permission prompt, so these hold here in every mode.
    // (Shell commands are covered by the sandbox's network deny; the browser by CDP interception.)
    if ((tool === 'WebFetch' || tool === 'mcp__browser__browser_navigate') && targetsSelf(JSON.stringify(p.tool_input ?? {}), svc.cfg.selfPorts)) {
      return { action: 'block', message: "That address is Ant's own control panel, which ants can't access. Don't retry." }
    }
    const mode = R.getAnt(svc.db, antId)?.permissionMode
    if ((mode === 'full' || mode === 'auto') && /^mcp__/.test(tool) && !/^mcp__(ant|browser)__/.test(tool) && SEND_TOOL.test(tool)) {
      // Sends go through the approval card, where an approved draft's text is let through.
      return { action: 'ask', message: 'Sends a message on your behalf' }
    }
    if (tool.startsWith('mcp__browser__')) {
      // Fail closed while the user drives: they may be typing a password (Hermes lease rule).
      if (svc.computers.lease(antId) === 'user') return { action: 'block', message: `${svc.userName} is using your browser right now. Wait for them to hand it back; you'll get a message.` }
      try {
        await svc.ensureComputer(antId)
      } catch (err) {
        return { action: 'block', message: `Your browser couldn't start: ${err instanceof Error ? err.message : String(err)}` }
      }
      const risky = riskyBrowserAction(tool, (p.tool_input ?? {}) as P)
      if (risky) return { action: 'ask', message: risky }
    }
    if (p.tool_name === 'Bash') {
      const input = (p.tool_input ?? {}) as P
      const v = evaluateFloors(str(input.command), { cwd: svc.pathsFor(antId).folder, home: process.env.HOME })
      if (v.action === 'block') return { action: 'block', message: `Blocked by Ant: ${v.message}` }
      // Medium findings are file writes outside the folder, which the OS sandbox already blocks.
      const serious = v.action === 'ask' ? v.matches.filter((m) => m.severity !== 'medium') : []
      if (serious.length) return { action: 'ask', message: serious.map((m) => m.title).join(', ') }
    }
    return { action: 'pass' }
  },
}

const RISKY_CLICK = /\b(buy|purchase|pay|place order|checkout|check out|confirm order|subscribe|send|submit|delete|remove|transfer|publish|post|sign up|book now|reserve)\b/i

/** Browser clicks aren't classifiable by tool name; look at what's being clicked (plan §4). */
function riskyBrowserAction(tool: string, input: P): string | null {
  if (!/browser_(click|press_key|type|fill_form|select_option|file_upload)/.test(tool)) return null
  const text = [input.element, input.ref, input.text, input.key, JSON.stringify(input.fields ?? '')].map(str).join(' ')
  if (tool.endsWith('file_upload')) return 'Uploading a file to a website'
  if (/press_key|type/.test(tool) && !/enter|submit/i.test(text + str(input.submit))) return null
  const m = text.match(RISKY_CLICK)
  return m ? `Browser action that may have real-world effect ("${m[0]}")` : null
}

/* ---------- memory ---------- */

function memory(svc: AntService, antId: string, p: P): string {
  const store = new MemoryStore({ memoryPath: svc.pathsFor(antId).memory, userPath: join(svc.cfg.antHome, 'USER.md') })
  const target = p.target === 'user' ? 'user' : 'memory'
  const text = str(p.text).trim()
  const old = str(p.old_text).trim()
  const r = p.op === 'add' ? store.add(target, text) : p.op === 'replace' ? store.replace(target, old, text) : store.remove(target, old)
  return r.ok ? `${r.message} (${r.usage})` : `Not saved: ${r.error}`
}
