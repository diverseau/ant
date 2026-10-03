// Ant templates: an ant's profile, skills, routines and rules as one JSON file, for export,
// import and duplicate (Grok's "Duplicate" and shareable Bot templates). History, memory, files,
// browser logins and secrets never leave.
import type { AntTemplate, EventSpec } from '@ant/shared'
import * as R from './db/repos/index.ts'
import type { Scheduler } from './scheduler/runtime.ts'
import type { Schedule } from './scheduler/schedule.ts'
import { HttpError, type AntService } from './service.ts'

export function exportAnt(svc: AntService, scheduler: Scheduler, antId: string): AntTemplate {
  const a = svc.antRow(antId)
  const folder = svc.pathsFor(antId).folder
  return {
    format: 'ant-template',
    version: 1,
    ant: {
      name: a.name, label: a.label, description: a.description, color: a.color, accessory: a.accessory,
      model: a.model, effort: a.effort, fast: a.fast, permissionMode: a.permissionMode,
    },
    skills: svc.skills.list(folder).filter((s) => s.scope === 'ant').flatMap((s) => {
      const full = svc.skills.read(folder, s.name, 'ant')
      return full ? [{ name: full.name, description: full.description, body: full.body }] : []
    }),
    routines: scheduler.list(antId)
      // Webhook routines carry a secret key, so they don't travel.
      .filter((r) => r.trigger !== 'webhook')
      .map((r) => ({ name: r.name, instruction: r.instruction, trigger: r.trigger, ...(r.trigger === 'schedule' ? { when: scheduleText(svc, r.id) ?? '' } : { event: r.event }), tz: r.tz, enabled: r.enabled })),
    rules: R.listRules(svc.db, { antId })
      .filter((r) => r.scope === 'ant' && r.source === 'user')
      .map((r) => ({ pattern: r.pattern, behaviour: r.behaviour, label: r.label ?? r.pattern, ...(r.note?.startsWith('input:') && { inputContains: r.note.slice(6) }) })),
    guidance: R.getSetting<string[]>(svc.db, `guidance.${antId}`, []),
  }
}

/** A schedule as text the schedule parser reads back: cron as-is, intervals in minutes. */
function scheduleText(svc: AntService, routineId: string): string | null {
  const s = R.getRoutine(svc.db, routineId)?.schedule as Schedule | null
  if (!s) return null
  if (s.kind === 'cron') return s.expr
  if (s.kind === 'interval') return `every ${s.minutes} minutes`
  // One-off runs that already happened can't be recreated.
  return Date.parse(s.runAt) > Date.now() ? s.runAt : null
}

export function importAnt(svc: AntService, scheduler: Scheduler, t: AntTemplate, name?: string): { antId: string; skipped: string[] } {
  if (t?.format !== 'ant-template' || t.version !== 1 || !t.ant?.name) throw new HttpError(400, 'Not an Ant template file.')
  let base = (name ?? t.ant.name).trim().slice(0, 40)
  for (let i = 2; svc.findAntByName(base); i++) base = `${(name ?? t.ant.name).trim().slice(0, 36)} ${i}`
  const ant = svc.createAnt({ name: base, label: t.ant.label, description: t.ant.description, color: t.ant.color as never, accessory: t.ant.accessory as never, model: t.ant.model })
  svc.updateAnt(ant.id, {
    ...(t.ant.effort !== undefined && { effort: t.ant.effort as never }),
    ...(t.ant.fast !== undefined && { fast: t.ant.fast }),
    ...(t.ant.permissionMode && { permissionMode: t.ant.permissionMode as never }),
  })
  const folder = svc.pathsFor(ant.id).folder
  const skipped: string[] = []
  for (const s of t.skills ?? []) {
    const r = svc.skills.save(folder, { name: s.name, description: s.description, body: s.body }, 'ant')
    if (!r.ok) skipped.push(`skill ${s.name}: ${r.errors.join(' ')}`)
  }
  for (const r of t.routines ?? []) {
    try {
      const { routine } = scheduler.create({ antId: ant.id, name: r.name, instruction: r.instruction, when: r.when ?? '', tz: r.tz, trigger: r.trigger, ...(r.event && { event: r.event as EventSpec }) })
      if (r.enabled === false) scheduler.update(routine.id, { enabled: false })
    } catch (err) {
      skipped.push(`routine ${r.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  for (const rule of t.rules ?? []) {
    if (!/^[\w*|.-]+$/.test(rule.pattern) || !['allow', 'ask', 'handoff', 'deny'].includes(rule.behaviour)) continue
    R.addRule(svc.db, { scope: 'ant', antId: ant.id, pattern: rule.pattern, behaviour: rule.behaviour, source: 'user', label: rule.label, ...(rule.inputContains && { note: `input:${rule.inputContains}` }) })
  }
  if (t.guidance?.length) R.setSetting(svc.db, `guidance.${ant.id}`, t.guidance.slice(0, 30).map(String))
  svc.emit({ type: 'skills.updated' })
  return { antId: ant.id, skipped }
}
