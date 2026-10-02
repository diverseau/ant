import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as R from '../../src/db/repos/index.ts'
import { TURN_COST_USD } from '../fake-claude/scenarios.ts'
import { createHarness, toolCommand, waitFor, type Harness } from './helpers.ts'

let h: Harness
let cleanup: (() => Promise<void>) | undefined
beforeEach(async () => {
  // Only the broker/reaper clock is virtual. Stream reads, polling and child
  // processes use real timers so expiry can be tested without waiting ten minutes.
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  cleanup = undefined
  h = await createHarness()
  cleanup = h.close
})
afterEach(async () => {
  try { await cleanup?.() } finally { vi.useRealTimers() }
})

describe('antd through fake claude and real ant-mcp', () => {
  it('provisions the folder and private settings/MCP config with credential denies', () => {
    const a = h.ant()
    for (const path of [a.paths.folder, a.paths.workspace, a.paths.claudeMd, a.paths.settings, a.paths.mcpConfig]) expect(existsSync(path)).toBe(true)
    expect(readFileSync(a.paths.claudeMd, 'utf8')).toContain('# You are A,')
    const settings = JSON.parse(readFileSync(a.paths.settings, 'utf8'))
    expect(settings.permissions.allow).toContain(`Edit(/${a.paths.folder}/**)`)
    for (const name of ['.ssh', '.gnupg', '.aws', '.codex', '.hermes', '.claude/.credentials.json']) {
      expect(settings.permissions.deny.some((rule: string) => rule.startsWith('Read(') && rule.includes(`/${name}`))).toBe(true)
      expect(settings.permissions.deny.some((rule: string) => rule.startsWith('Edit(') && rule.includes(`/${name}`))).toBe(true)
    }
    expect(settings.sandbox.enabled).toBe(true)
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain('/ant-mcp/src/hook.ts')
    const config = JSON.parse(readFileSync(a.paths.mcpConfig, 'utf8'))
    expect(config.mcpServers.ant).toMatchObject({ command: 'node', env: { ANT_SOCKET: h.cfg.socketPath } })
    expect(config.mcpServers.ant.args[0]).toContain('/ant-mcp/src/main.ts')
    expect(statSync(a.paths.settings).mode & 0o777).toBe(0o600)
    expect(statSync(h.cfg.socketPath).mode & 0o777).toBe(0o600)
  })

  it('persists streamed text, toggles typing, and records per-turn cost deltas', async () => {
    const a = h.ant()
    h.svc.sendFromUser(a.threadId, 'say:Hello from the fake!')
    await h.finished(a.id)
    h.svc.sendFromUser(a.threadId, 'say:Second turn')
    const runs = await h.finished(a.id, 2)
    const texts = h.messages(a.threadId).filter((m) => m.author === a.id && m.kind === 'text')
    expect(texts.map((m) => m.text)).toEqual(['Hello from the fake!', 'Second turn'])
    expect(texts.map((m) => m.payload)).toEqual([{ streaming: false }, { streaming: false }])
    expect(texts.map((m) => m.runId)).toEqual(runs.map((r) => r.id))
    const deltas = h.events.filter((e) => e.type === 'message.delta')
    expect(deltas.map((e) => e.text).join('')).toBe('Hello from the fake!Second turn')
    expect(deltas.length).toBeGreaterThan(2)
    expect(h.events.filter((e) => e.type === 'typing').map((e) => e.antId)).toEqual([a.id, null, a.id, null])
    for (const run of runs) {
      expect(run).toMatchObject({ status: 'succeeded', tokensIn: 15, tokensOut: 5, turns: 1 })
      expect(run.costUsd).toBeCloseTo(TURN_COST_USD)
    }
    expect(h.trace(a.id).filter((e) => e.kind === 'spawn')).toHaveLength(1)
    expect(h.trace(a.id).filter((e) => e.kind === 'stdout' && e.message?.type === 'result').map((e) => e.message?.total_cost_usd)).toEqual([0.01, 0.02])
    expect(h.events.filter((e) => e.type === 'usage')).toHaveLength(2)
    expect(R.getSetting(h.db, 'usage.windows', null)).toMatchObject({ status: 'allowed', fiveHour: { utilization: 0.64 } })
  })

  it('replays a recorded turn without duplicating its complete assistant text', async () => {
    const a = h.ant()
    h.svc.sendFromUser(a.threadId, 'fixture:spike1')
    await h.finished(a.id)
    expect(h.messages(a.threadId).filter((m) => m.author === a.id && m.kind === 'text').map((m) => m.text)).toEqual(['one'])
    expect(h.events.some((e) => e.type === 'message.delta' && e.text === 'one')).toBe(true)
  })

  it('respawns with --resume and the same session id after an idle stop', async () => {
    const a = h.ant()
    h.svc.sendFromUser(a.threadId, 'say:First')
    await h.finished(a.id)
    const original = h.svc.liveProcess(a.id)!.proc
    const sessionId = h.runs(a.id)[0]!.sessionId
    h.svc.stopAnt(a.id)
    await waitFor(() => original.state === 'exited', 'original process exit')
    h.svc.sendFromUser(a.threadId, 'say:Resumed')
    await h.finished(a.id, 2)
    const spawns = h.trace(a.id).filter((e) => e.kind === 'spawn')
    expect(spawns).toHaveLength(2)
    expect(spawns[0]!.argv).toEqual(expect.arrayContaining(['--session-id', sessionId, '--model', 'haiku', '--settings', a.paths.settings, '--mcp-config', a.paths.mcpConfig, '--permission-prompt-tool', 'mcp__ant__permission']))
    expect(spawns[1]!.argv).toEqual(expect.arrayContaining(['--resume', sessionId]))
    expect(spawns[1]!.argv).not.toContain('--session-id')
    expect(spawns[1]!.pid).not.toBe(spawns[0]!.pid)
    expect(h.runs(a.id).map((r) => r.sessionId)).toEqual([sessionId, sessionId])
    const init = h.trace(a.id).filter((e) => e.kind === 'stdout' && e.message?.subtype === 'init')
    expect(init.map((e) => e.message?.session_id)).toEqual([sessionId, sessionId])
    expect(h.trace(a.id).filter((e) => e.kind === 'stdout' && e.message?.type === 'result').map((e) => e.message?.total_cost_usd)).toEqual([0.01, 0.02])
  })

  it('creates checklist, draft and file cards and broadcasts a live activity', async () => {
    const a = h.ant()
    writeFileSync(join(a.paths.workspace, 'report.txt'), 'Test report\n')
    const items = [{ service: 'Tests', result: 'Passed', detail: 'All green', ok: true }]
    const draft = { channel: 'email', to: 'test@example.invalid', subject: 'Status', body: 'Ready for review.' }
    const commands = [
      toolCommand('mcp__ant__report_checklist', { items }),
      toolCommand('mcp__ant__present_draft', draft),
      toolCommand('mcp__ant__share_file', { path: 'workspace/report.txt' }),
      toolCommand('mcp__ant__set_status', { text: 'Reviewing the report' }),
    ]
    for (const [i, command] of commands.entries()) {
      h.svc.sendFromUser(a.threadId, command)
      await h.finished(a.id, i + 1)
    }
    expect(h.messages(a.threadId).find((m) => m.kind === 'checklist')?.payload).toEqual({ items })
    expect(h.messages(a.threadId).find((m) => m.kind === 'draft')?.payload).toEqual(draft)
    expect(h.messages(a.threadId).find((m) => m.kind === 'file')?.payload).toEqual({ path: 'workspace/report.txt', name: 'report.txt', bytes: 12 })
    expect(h.events.some((e) => e.type === 'ant.updated' && e.ant.id === a.id && e.ant.activity === 'Reviewing the report')).toBe(true)
    expect(h.svc.view(h.svc.antRow(a.id)).activity).toBeUndefined()
    expect(h.trace(a.id).filter((e) => e.kind === 'mcp').map((e) => e.name)).toEqual([
      'mcp__ant__report_checklist', 'mcp__ant__present_draft', 'mcp__ant__share_file', 'mcp__ant__set_status',
    ])
    expect(h.messages(a.threadId).filter((m) => m.kind === 'tool' || m.kind === 'approval')).toEqual([])
    expect(h.events.filter((e) => e.type === 'message.created').map((e) => e.message.kind)).toEqual(expect.arrayContaining(['checklist', 'draft', 'file']))
  })

  it('denies an outside Write, persists Always, then allows the same call without a card', async () => {
    const a = h.ant()
    const outside = join(h.root, 'outside.txt')
    const command = toolCommand('Write', { file_path: outside, content: 'Pretend content' })
    h.svc.sendFromUser(a.threadId, command)
    const denied = await waitFor(() => R.listApprovals(h.db, { status: 'pending' })[0], 'Write approval')
    expect(denied).toMatchObject({ antId: a.id, threadId: a.threadId, toolName: 'Write', expiresAt: null })
    expect(h.svc.antRow(a.id).status).toBe('attention')
    expect(h.messages(a.threadId).find((m) => m.kind === 'approval')?.payload).toMatchObject({ approvalId: denied.id, connector: 'Files' })
    h.broker.decide(denied.id, 'deny')
    await h.finished(a.id)
    const firstTool = R.listToolEvents(h.db, h.runs(a.id)[0]!.id)[0]!
    expect(firstTool).toMatchObject({ name: 'Write', status: 'denied', outputSummary: expect.stringContaining('Permission denied') })
    expect(h.messages(a.threadId).find((m) => m.id === denied.messageId)?.payload).toMatchObject({ decision: 'deny' })
    const rawDenial = h.trace(a.id).find((e) => e.kind === 'stdout' && e.message?.type === 'user')
    expect(rawDenial?.message?.message.content[0]).toMatchObject({ type: 'tool_result', is_error: true, tool_use_id: firstTool.toolUseId })

    h.svc.sendFromUser(a.threadId, command)
    const always = await waitFor(() => R.listApprovals(h.db, { status: 'pending' })[0], 'second Write approval')
    h.broker.decide(always.id, 'always')
    await h.finished(a.id, 2)
    expect(R.listRules(h.db, { antId: a.id })).toEqual(expect.arrayContaining([expect.objectContaining({ pattern: 'Write', behaviour: 'allow', source: 'user', antId: a.id })]))
    h.svc.sendFromUser(a.threadId, command)
    const runs = await h.finished(a.id, 3)
    expect(R.listApprovals(h.db)).toHaveLength(2)
    expect(R.listToolEvents(h.db, runs[1]!.id)[0]?.status).toBe('ok')
    expect(R.listToolEvents(h.db, runs[2]!.id)[0]?.status).toBe('ok')
    expect(h.trace(a.id).filter((e) => e.kind === 'mcp' && e.name === 'mcp__ant__permission').map((e) => JSON.parse(e.result?.content[0].text).behavior)).toEqual(['deny', 'allow', 'allow'])
    expect(existsSync(outside)).toBe(false)
  })

  it('expires an unattended approval through the real broker sweeper', async () => {
    const a = h.ant()
    h.svc.enqueue(a.id, {
      threadId: a.threadId, text: toolCommand('Write', { file_path: join(h.root, 'unattended.txt'), content: 'Not written' }),
      source: 'routine', depth: 0, enqueuedAt: Date.now(),
    })
    const approval = await waitFor(() => R.listApprovals(h.db, { status: 'pending' })[0], 'unattended approval')
    expect(approval.expiresAt).toBe(Date.now() + 10 * 60_000)
    vi.advanceTimersByTime(10 * 60_000 - 1)
    expect(R.getApproval(h.db, approval.id)?.status).toBe('pending')
    vi.advanceTimersByTime(1)
    await h.finished(a.id)
    expect(R.getApproval(h.db, approval.id)).toMatchObject({ status: 'expired', decidedAt: Date.now() })
    expect(h.messages(a.threadId).find((m) => m.id === approval.messageId)?.payload).toMatchObject({ decision: 'expired' })
    expect(h.events.some((e) => e.type === 'message.updated' && e.message.kind === 'approval' && e.message.decision === 'expired')).toBe(true)
    expect(R.listToolEvents(h.db, h.runs(a.id)[0]!.id)[0]?.status).toBe('denied')
    expect(h.svc.antRow(a.id).status).toBe('idle')
  })

  it('runs a delegated turn in B’s thread and sends its reply envelope back to A', async () => {
    const a = h.ant('A')
    const b = h.ant('B')
    h.svc.sendFromUser(a.threadId, toolCommand('mcp__ant__message_ant', { to: 'B', text: 'say:Answer from B' }))
    await h.finished(b.id)
    await h.finished(a.id, 2)
    expect(h.runs(b.id)[0]).toMatchObject({ threadId: b.threadId, trigger: 'ant', status: 'succeeded' })
    expect(h.messages(b.threadId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ author: a.id, text: 'say:Answer from B' }),
      expect.objectContaining({ author: b.id, text: 'Answer from B' }),
    ]))
    const delivered = h.trace(a.id).filter((e) => e.kind === 'stdin' && e.message?.type === 'user').map((e) => e.message?.message.content)
    expect(delivered[1]).toBe('[Reply from B] Answer from B')
    expect(h.messages(a.threadId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'system', text: 'A asked B for help' }),
      expect.objectContaining({ kind: 'system', text: 'B replied' }),
      expect.objectContaining({ author: a.id, text: 'Received [Reply from B] Answer from B' }),
    ]))
  })

  it('stops scripted ping-pong at the loop guard and drains the remaining replies', async () => {
    const a = h.ant('A')
    const b = h.ant('B')
    h.svc.sendFromUser(a.threadId, 'ping-pong:A:B')
    await waitFor(() => [a.threadId, b.threadId].some((id) => h.messages(id).some((m) => m.text === 'Paused the back-and-forth between A and B' || m.text === 'Paused the back-and-forth between B and A')), 'loop guard system line')
    await waitFor(() => h.runs().every((r) => r.status === 'succeeded') && !h.svc.currentTurn(a.id) && !h.svc.currentTurn(b.id), 'ping-pong to drain')
    const calls = [a, b].flatMap((ant) => h.trace(ant.id).filter((e) => e.kind === 'mcp' && e.name === 'mcp__ant__message_ant'))
    expect(calls).toHaveLength(5)
    expect(calls.some((e) => e.result?.content[0].text.includes('Not sent: this request has been passed'))).toBe(true)
    expect(h.runs()).toHaveLength(9)
    expect([h.svc.antRow(a.id).status, h.svc.antRow(b.id).status]).toEqual(['idle', 'idle'])
  })

  it('routes colony @mentions only to B, and unmentioned messages to the lead', async () => {
    const a = h.ant('A')
    const b = h.ant('B')
    const colony = h.svc.createColony('Crew', [a.id, b.id])
    const thread = R.getThreadByRef(h.db, 'colony', colony.id)!
    h.svc.sendFromUser(thread.id, '@B say:Mentioned')
    await h.finished(b.id)
    expect(h.runs(a.id)).toEqual([])
    expect(h.svc.liveProcess(a.id)).toBeUndefined()
    h.svc.sendFromUser(thread.id, 'say:Lead answer')
    await h.finished(a.id)
    expect(h.runs(b.id)).toHaveLength(1)
    expect(h.runs().map((r) => r.threadId)).toEqual([thread.id, thread.id])
    expect(h.messages(thread.id).filter((m) => m.author !== 'user' && m.kind === 'text').map((m) => [m.author, m.text])).toEqual([[b.id, 'Mentioned'], [a.id, 'Lead answer']])
    expect(h.messages(a.threadId)).toEqual([])
    expect(h.messages(b.threadId)).toEqual([])
  })

  it('interrupts mid-stream, marks the run stopped and finalises dangling text', async () => {
    const a = h.ant()
    h.svc.sendFromUser(a.threadId, 'slow:2000')
    await waitFor(() => h.events.some((e) => e.type === 'message.delta'), 'first slow delta')
    const streaming = h.messages(a.threadId).find((m) => m.author === a.id && m.kind === 'text')!
    expect(streaming.payload).toEqual({ streaming: true })
    h.svc.stopThread(a.threadId)
    const runs = await h.finished(a.id)
    expect(runs[0]?.status).toBe('stopped')
    const final = R.getMessage(h.db, streaming.id)!
    expect(final.payload).toEqual({ streaming: false })
    expect(final.text.length).toBeGreaterThan(0)
    expect(h.messages(a.threadId).some((m) => m.kind === 'system' && m.text === 'Stopped. Completed actions were not undone.')).toBe(true)
    const control = h.trace(a.id).find((e) => e.kind === 'stdin' && e.message?.type === 'control_request')!
    const response = h.trace(a.id).find((e) => e.kind === 'stdout' && e.message?.type === 'control_response')!
    expect(response.message?.response).toEqual({ subtype: 'success', request_id: control.message?.request_id })
    expect(h.events.filter((e) => e.type === 'typing').map((e) => e.antId)).toEqual([a.id, null])
    expect(h.svc.antRow(a.id).status).toBe('idle')
    h.svc.sendFromUser(a.threadId, 'say:Still usable')
    await h.finished(a.id, 2)
    expect(h.trace(a.id).filter((e) => e.kind === 'spawn')).toHaveLength(1)
  })

  it('posts a crash error, returns to idle, and respawns on the next message', async () => {
    const a = h.ant()
    h.svc.sendFromUser(a.threadId, 'crash')
    const runs = await h.finished(a.id)
    expect(runs[0]).toMatchObject({ status: 'failed', error: 'fake-claude: scripted crash' })
    expect(h.messages(a.threadId).find((m) => m.kind === 'error')?.payload).toMatchObject({ detail: 'fake-claude: scripted crash' })
    expect(h.svc.antRow(a.id).status).toBe('idle')
    expect(h.svc.liveProcess(a.id)).toBeUndefined()
    h.svc.sendFromUser(a.threadId, 'say:Recovered')
    await h.finished(a.id, 2)
    expect(h.runs(a.id)[1]?.status).toBe('succeeded')
    expect(h.trace(a.id).filter((e) => e.kind === 'spawn')).toHaveLength(2)
    expect(h.messages(a.threadId).some((m) => m.author === a.id && m.text === 'Recovered')).toBe(true)
  })

  it('honours maxBusy = 1 by starting B only after A finishes', async () => {
    h.cfg.maxBusy = 1
    const a = h.ant('A')
    const b = h.ant('B')
    h.svc.sendFromUser(a.threadId, 'slow:150')
    h.svc.sendFromUser(b.threadId, 'say:After A')
    expect(h.runs(b.id)).toEqual([])
    expect(h.svc.liveProcess(b.id)).toBeUndefined()
    await h.finished(b.id)
    expect(h.runs().map((r) => [r.antId, r.status])).toEqual([[a.id, 'succeeded'], [b.id, 'succeeded']])
    expect(h.events.filter((e) => e.type === 'typing').map((e) => e.antId)).toEqual([a.id, null, b.id, null])
  })

  it('runs the generated Bash hook and denies rm -rf / before permission or execution', async () => {
    const a = h.ant()
    h.svc.sendFromUser(a.threadId, toolCommand('Bash', { command: 'rm -rf /' }))
    await h.finished(a.id)
    const hook = h.trace(a.id).find((e) => e.kind === 'hook')!
    expect(hook.command).toContain('/ant-mcp/src/hook.ts')
    expect(hook.input).toMatchObject({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } })
    expect(JSON.parse(hook.output!).hookSpecificOutput).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'deny' })
    expect(R.listToolEvents(h.db, h.runs(a.id)[0]!.id)[0]).toMatchObject({ name: 'Bash', status: 'denied', outputSummary: expect.stringContaining('Blocked by Ant') })
    expect(R.listApprovals(h.db)).toEqual([])
    expect(h.trace(a.id).filter((e) => e.kind === 'mcp')).toEqual([])
  })

  it('honours a Bash hook ask decision through an approval card', async () => {
    const a = h.ant()
    h.svc.sendFromUser(a.threadId, toolCommand('Bash', { command: 'sudo pacman -S example' }))
    const approval = await waitFor(() => R.listApprovals(h.db, { status: 'pending' })[0], 'hook ask approval')
    const hook = h.trace(a.id).find((e) => e.kind === 'hook')!
    expect(JSON.parse(hook.output!).hookSpecificOutput.permissionDecision).toBe('ask')
    expect(approval.toolName).toBe('Bash')
    h.broker.decide(approval.id, 'deny')
    await h.finished(a.id)
    expect(R.listToolEvents(h.db, h.runs(a.id)[0]!.id)[0]?.status).toBe('denied')
  })
})
