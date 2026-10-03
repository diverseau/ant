// The Activity view: what's running, what's waiting on the user, and what just happened, across
// every ant (Dots' Activity / Scheduled tabs, Grok's per-Bot tasks in one place).
import type { ActivityView } from '@ant/shared'
import * as R from './db/repos/index.ts'
import type { AntService } from './service.ts'

export function activity(svc: AntService, limit = 40): ActivityView {
  const db = svc.db
  const ants = R.listAnts(db)
  const working = ants
    .map((a) => ({ a, turn: svc.currentTurn(a.id) }))
    .filter((x) => x.turn)
    .map(({ a, turn }) => {
      const run = R.listRuns(db, { antId: a.id, limit: 1 })[0]
      return { antId: a.id, threadId: turn!.threadId, source: turn!.source, status: svc.activityOf(a.id) ?? null, startedAt: run?.startedAt ?? Date.now() }
    })
  const waiting = R.listApprovals(db, { status: 'pending' }).map((ap) => {
    const card = db.prepare("SELECT id, payload FROM messages WHERE kind = 'approval' AND json_extract(payload, '$.approvalId') = ? LIMIT 1").get(ap.id) as
      | { id: string; payload: string }
      | undefined
    const p = card ? (JSON.parse(card.payload) as { action?: string }) : {}
    return { antId: ap.antId, threadId: ap.threadId, messageId: card?.id ?? null, action: p.action ?? ap.toolName, behaviour: ap.behaviour, createdAt: ap.createdAt }
  })
  const reply = db.prepare("SELECT text FROM messages WHERE run_id = ? AND kind = 'text' AND author != 'user' ORDER BY created_at DESC, rowid DESC LIMIT 1")
  const routineOf = db.prepare('SELECT r.name FROM routine_runs rr JOIN routines r ON r.id = rr.routine_id WHERE rr.run_id = ? LIMIT 1')
  const recent = (db.prepare("SELECT * FROM runs WHERE status != 'running' AND status != 'queued' ORDER BY created_at DESC, rowid DESC LIMIT ?").all(limit) as Array<Record<string, unknown>>)
    .map((r) => ({
      id: String(r.id),
      antId: String(r.ant_id),
      threadId: (r.thread_id as string | null) ?? null,
      trigger: r.trigger as ActivityView['recent'][number]['trigger'],
      status: r.status as ActivityView['recent'][number]['status'],
      startedAt: Number(r.started_at ?? r.created_at),
      endedAt: (r.ended_at as number | null) ?? null,
      costUsd: Number(r.cost_usd ?? 0),
      routine: (routineOf.get(String(r.id)) as { name: string } | undefined)?.name ?? null,
      summary: ((reply.get(String(r.id)) as { text: string } | undefined)?.text ?? (r.error as string | null) ?? '').replace(/[*_`#>]+/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 220),
    }))
  return { working, waiting, recent }
}
