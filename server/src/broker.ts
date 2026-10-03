// Permission broker (plan §4): turns Claude Code permission prompts and ants' own
// request_approval calls into approval cards, and waits for the user.
import { execFile } from 'node:child_process'
import { dirname } from 'node:path'
import type { ApprovalDecision } from '@ant/shared'
import * as R from './db/repos/index.ts'
import { describeTool } from './rules/describe.ts'
import { decide, type Rule } from './rules/engine.ts'
import { HttpError, type AntService } from './service.ts'

const UNATTENDED_TTL = 10 * 60_000
export const SEND_TOOL = /(^|_)(send|reply|forward|post|create_draft|draft)(_|$)/i

type Waiter = (d: ApprovalDecision) => void

export class Broker {
  private waiters = new Map<string, Waiter>()
  /** One-shot allowance after the user presses Send on a draft, bound to the approved text. */
  private sendGrants = new Map<string, { until: number; fingerprint: string }>()
  private svc: AntService
  private sweeper: NodeJS.Timeout

  constructor(svc: AntService) {
    this.svc = svc
    this.sweeper = setInterval(() => this.expire(), 15_000)
    // Approvals can't survive an antd restart: the tool call that asked is gone.
    for (const a of R.listApprovals(svc.db, { status: 'pending' })) this.finalise(a.id, 'expired')
  }

  rulesFor(antId: string): Rule[] {
    return R.listRules(this.svc.db, { antId }).map((r) => ({
      pattern: r.pattern,
      behaviour: r.behaviour,
      inputContains: r.note?.startsWith('input:') ? r.note.slice(6) : undefined,
    }))
  }

  /** Handler for the `permission` tool (Claude Code's --permission-prompt-tool). */
  async permission(antId: string, p: { tool_name?: string; input?: unknown }) {
    const tool = String(p.tool_name ?? '')
    const input = p.input ?? {}
    // Ant's own API/UI is off-limits: reaching it would let an ant approve itself.
    if (targetsSelf(JSON.stringify(input), this.svc.cfg.selfPorts)) {
      return { behavior: 'deny', message: "That address is Ant's own control panel, which ants can't access. Don't retry." }
    }
    const folder = this.svc.pathsFor(antId).folder
    const verdict = decide(tool, input, { folder, rules: this.rulesFor(antId) })

    if (verdict.behaviour === 'ask' && SEND_TOOL.test(tool) && this.consumeSendGrant(antId, input)) {
      return { behavior: 'allow', updatedInput: input }
    }
    if (verdict.behaviour === 'allow') return { behavior: 'allow', updatedInput: input }
    if (verdict.behaviour === 'deny') return { behavior: 'deny', message: `Ant blocked this (${verdict.reason}). Don't retry; tell ${this.svc.userName} what you needed.` }

    const d = describeTool(tool, input, folder)
    const decision = await this.ask(antId, {
      toolName: tool,
      input,
      behaviour: verdict.behaviour === 'handoff' ? 'handoff' : 'ask',
      action: d.title,
      detail: [verdict.reason && capitalise(verdict.reason), d.detail].filter(Boolean).join(' · '),
      connector: d.connector,
    })
    if (decision === 'once' || decision === 'always') return { behavior: 'allow', updatedInput: input }
    return {
      behavior: 'deny',
      message:
        decision === 'expired'
          ? `${this.svc.userName} didn't answer in time, so this wasn't done. Report what you were trying to do.`
          : verdict.behaviour === 'handoff'
            ? `This needs ${this.svc.userName} to do it personally. Stop and explain what they need to do.`
            : `${this.svc.userName} said no. Don't retry; continue without it or ask what they'd prefer.`,
    }
  }

  /** Handler for the ant's own `request_approval` tool. */
  async requestApproval(antId: string, p: { action?: string; detail?: string; risk?: string }) {
    const decision = await this.ask(antId, {
      toolName: 'request_approval',
      input: p,
      behaviour: 'ask',
      action: String(p.action ?? 'Approval needed'),
      detail: String(p.detail ?? ''),
      connector: 'Ant',
    })
    if (decision === 'once' || decision === 'always') return `Approved by ${this.svc.userName}. Go ahead.`
    if (decision === 'expired') return `No answer from ${this.svc.userName} in time. Don't do it; report back instead.`
    return `${this.svc.userName} declined. Don't do it.`
  }

  /** The ant needs the user at the browser (sign-in, 2FA, CAPTCHA, payment). Resolves when they hand back. */
  async requestHandoff(antId: string, reason: string): Promise<string> {
    const svc = this.svc
    const threadId = svc.threadForAnt(antId)
    await svc.ensureComputer(antId).catch(() => {})
    const approval = R.createApproval(svc.db, { antId, threadId, toolName: 'request_handoff', input: { reason }, behaviour: 'handoff', expiresAt: null })
    const msg = svc.insert(threadId, antId, 'approval', {
      approvalId: approval.id,
      action: reason || 'Needs you on the computer',
      detail: 'Open the computer, take over, and press I\'m done when finished.',
      connector: 'Computer',
      behaviour: 'handoff',
    })
    R.setApprovalMessage(svc.db, approval.id, msg.id)
    svc.setStatus(antId, 'attention')
    svc.emit({ type: 'notice', level: 'warn', text: `${R.getAnt(svc.db, antId)?.name ?? 'An ant'} needs you on its computer` })
    desktopNotify(R.getAnt(svc.db, antId)?.name ?? 'An ant', `Needs you on its computer: ${reason}`)
    const decision = await new Promise<ApprovalDecision>((resolve) => this.waiters.set(approval.id, resolve))
    if (decision === 'deny') return `${svc.userName} declined to take over. Continue without it or explain what's blocked.`
    return `${svc.userName} finished on the computer and handed it back. Check the page state and carry on.`
  }

  /** Called when the user hands the computer back: completes any open hand-off. */
  completeHandoffs(antId: string) {
    for (const a of R.listApprovals(this.svc.db, { status: 'pending', antId })) {
      // An explicit hand-off is done; a tool that needed the user is now theirs, so it's not run.
      if (a.toolName === 'request_handoff') this.finalise(a.id, 'once')
      else if (a.behaviour === 'handoff') this.finalise(a.id, 'deny')
    }
  }

  private ask(
    antId: string,
    a: { toolName: string; input: unknown; behaviour: 'ask' | 'handoff'; action: string; detail: string; connector: string },
  ): Promise<ApprovalDecision> {
    const svc = this.svc
    const turn = svc.currentTurn(antId)
    const threadId = svc.threadForAnt(antId)
    const unattended = !turn || turn.source !== 'user'
    const expiresAt = unattended ? Date.now() + UNATTENDED_TTL : null
    const approval = R.createApproval(svc.db, { antId, threadId, toolName: a.toolName, input: a.input, behaviour: a.behaviour, expiresAt })
    const msg = svc.insert(threadId, antId, 'approval', {
      approvalId: approval.id,
      action: a.action,
      detail: a.detail,
      connector: a.connector,
      behaviour: a.behaviour,
      ...(expiresAt && { expiresAt }),
    })
    R.setApprovalMessage(svc.db, approval.id, msg.id)
    svc.setStatus(antId, 'attention')
    // Nobody may be watching an unattended run: tell the desktop, it expires in 10 minutes.
    if (unattended) desktopNotify(R.getAnt(svc.db, antId)?.name ?? 'An ant', `Needs your approval: ${a.action}`)
    return new Promise((resolve) => this.waiters.set(approval.id, resolve))
  }

  /** The user decided on an approval card. */
  decide(approvalId: string, decision: ApprovalDecision) {
    const a = R.getApproval(this.svc.db, approvalId)
    if (!a) throw new HttpError(404, 'No such approval')
    if (a.status !== 'pending') throw new HttpError(409, 'Already decided')
    if (decision === 'always' && !['request_approval', 'request_handoff'].includes(a.toolName)) {
      R.addRule(this.svc.db, { scope: 'ant', antId: a.antId, pattern: a.toolName, behaviour: 'allow', source: 'user', note: scopeNote(a.toolName, a.input) })
    }
    this.finalise(approvalId, decision)
  }

  private finalise(approvalId: string, decision: ApprovalDecision) {
    const a = R.decideApproval(this.svc.db, approvalId, decision)
    if (!a) return
    if (a.messageId) this.svc.patch(a.messageId, { decision })
    const waiter = this.waiters.get(approvalId)
    this.waiters.delete(approvalId)
    waiter?.(decision)
    const stillPending = R.listApprovals(this.svc.db, { status: 'pending', antId: a.antId }).length
    const ant = R.getAnt(this.svc.db, a.antId)
    if (ant && ant.status === 'attention' && !stillPending) {
      this.svc.setStatus(a.antId, this.svc.currentTurn(a.antId) ? 'working' : 'idle')
    }
  }

  private expire() {
    for (const id of R.expireDue(this.svc.db, Date.now())) {
      const a = R.getApproval(this.svc.db, id)
      if (a?.messageId) this.svc.patch(a.messageId, { decision: 'expired' })
      const waiter = this.waiters.get(id)
      this.waiters.delete(id)
      waiter?.('expired')
    }
  }

  grantSend(antId: string, body: string) {
    this.sendGrants.set(antId, { until: Date.now() + 5 * 60_000, fingerprint: fingerprint(body) })
  }

  /** Only the message the user approved may go out without asking again. */
  private consumeSendGrant(antId: string, input: unknown): boolean {
    const g = this.sendGrants.get(antId)
    if (!g || g.until < Date.now()) return false
    if (!normalise(JSON.stringify(input ?? {}).replace(/\\n/g, ' ')).includes(g.fingerprint)) return false
    this.sendGrants.delete(antId)
    return true
  }

  shutdown() {
    clearInterval(this.sweeper)
  }
}

/**
 * "Always allow" must not widen into "allow everything this tool can do": file writes are
 * scoped to the directory, shell commands to the exact command. Connector actions stay per
 * action (e.g. Gmail send), which is what the user means by "always".
 */
function scopeNote(tool: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const p = String(i.file_path ?? i.notebook_path ?? '')
    if (p) return `input:${JSON.stringify(dirname(p) + '/').slice(1, -1)}`
  }
  if (tool === 'Bash' && typeof i.command === 'string') return `input:${JSON.stringify(i.command).slice(1, -1)}`
  return 'Always allowed from chat'
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Whitespace/case-insensitive leading chunk of a message, to match it inside tool input. */
function fingerprint(text: string): string {
  return normalise(text).slice(0, 60)
}

export function targetsSelf(text: string, ports: number[]): boolean {
  return ports.some((p) => new RegExp(`(localhost|127\\.\\d+\\.\\d+\\.\\d+|0\\.0\\.0\\.0|\\[::1\\]|::1)[:/]+${p}\\b`).test(text))
}

function desktopNotify(title: string, body: string) {
  if (process.env.ANT_NO_DESKTOP_NOTIFY) return
  execFile('notify-send', ['-a', 'Ant', '-u', 'critical', title, body], () => {})
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
