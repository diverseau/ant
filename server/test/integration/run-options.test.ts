import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as R from '../../src/db/repos/index.ts'
import { toAnt } from '../../src/mappers.ts'
import { createHarness, toolCommand, waitFor, type Harness } from './helpers.ts'

let h: Harness
beforeEach(async () => { h = await createHarness() })
afterEach(async () => { await h.close() })

const settingsOf = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const spawns = (antId: string) => h.trace(antId).filter((e) => e.kind === 'spawn')

describe('per-ant run options (composer pickers)', () => {
  it('defaults to auto-accept edits with no permission-mode flag', async () => {
    const a = h.ant()
    expect(toAnt(R.getAnt(h.db, a.id)!)).toMatchObject({ permissionMode: 'edits', fast: false, effort: '' })
    h.svc.sendFromUser(a.threadId, 'say:hi')
    await h.finished(a.id)
    expect(spawns(a.id)[0]!.argv).not.toContain('--permission-mode')
    expect(spawns(a.id)[0]!.argv).not.toContain('--effort')
    const s = settingsOf(a.paths.settings)
    expect(s.permissions.allow).toContain(`Edit(/${a.paths.folder}/**)`)
    expect(s.sandbox.autoAllowBashIfSandboxed).toBe(true)
    expect(s.fastMode).toBeUndefined()
  })

  it('passes model, effort, fast and full access to the next process', async () => {
    const a = h.ant()
    h.svc.updateAnt(a.id, { model: 'claude-opus-5-5', effort: 'xhigh', fast: true, permissionMode: 'full' })
    h.svc.sendFromUser(a.threadId, 'say:hi')
    await h.finished(a.id)
    expect(spawns(a.id)[0]!.argv).toEqual(expect.arrayContaining(['--model', 'claude-opus-5-5', '--effort', 'xhigh', '--permission-mode', 'bypassPermissions']))
    const s = settingsOf(a.paths.settings)
    expect(s.fastMode).toBe(true)
    expect(s.sandbox).toMatchObject({ enabled: true, allowUnsandboxedCommands: false, filesystem: { allowWrite: [homedir()] } })
    expect(s.sandbox.filesystem.denyWrite.some((p: string) => p.endsWith('/.ssh'))).toBe(true)
    expect(s.sandbox.network.deniedDomains).toContain(`127.0.0.1:${h.cfg.selfPorts[0]}`)
    expect(readFileSync(a.paths.claudeMd, 'utf8')).toContain('You have full access')
  })

  it('supervised drops the folder edit allowance and sandbox auto-allow', () => {
    const a = h.ant()
    h.svc.updateAnt(a.id, { permissionMode: 'supervised' })
    h.svc.sendFromUser(a.threadId, 'say:hi')
    return h.finished(a.id).then(() => {
      const s = settingsOf(a.paths.settings)
      expect(s.permissions.allow).not.toContain(`Edit(/${a.paths.folder}/**)`)
      expect(s.sandbox.autoAllowBashIfSandboxed).toBe(false)
      expect(spawns(a.id)[0]!.argv).not.toContain('--permission-mode')
    })
  })

  it('auto mode uses the CLI auto permission mode', async () => {
    const a = h.ant()
    h.svc.updateAnt(a.id, { permissionMode: 'auto' })
    h.svc.sendFromUser(a.threadId, 'say:hi')
    await h.finished(a.id)
    expect(spawns(a.id)[0]!.argv).toEqual(expect.arrayContaining(['--permission-mode', 'auto']))
  })

  it('restarts an idle ant at once and a busy one after its turn', async () => {
    const a = h.ant()
    h.svc.sendFromUser(a.threadId, 'say:first')
    await h.finished(a.id)
    h.svc.updateAnt(a.id, { effort: 'low' })
    h.svc.sendFromUser(a.threadId, 'slow:300')
    await waitFor(() => h.svc.currentTurn(a.id), 'slow turn')
    h.svc.updateAnt(a.id, { effort: 'high' })
    expect(h.svc.liveProcess(a.id)).toBeDefined()
    await h.finished(a.id, 2)
    await waitFor(() => !h.svc.liveProcess(a.id), 'restart after turn')
    h.svc.sendFromUser(a.threadId, 'say:third')
    await h.finished(a.id, 3)
    const argv = spawns(a.id).map((s) => s.argv)
    expect(argv).toHaveLength(3)
    expect(argv[0]).not.toContain('--effort')
    expect(argv[1]).toEqual(expect.arrayContaining(['--effort', 'low', '--resume']))
    expect(argv[2]).toEqual(expect.arrayContaining(['--effort', 'high', '--resume']))
  })

  it('full access still blocks hardline commands and asks before connector sends', async () => {
    const a = h.ant()
    h.svc.updateAnt(a.id, { permissionMode: 'full' })
    h.svc.sendFromUser(a.threadId, toolCommand('Bash', { command: 'rm -rf /' }))
    await h.finished(a.id)
    expect(R.listToolEvents(h.db, h.runs(a.id)[0]!.id)[0]).toMatchObject({ name: 'Bash', status: 'denied' })

    h.svc.sendFromUser(a.threadId, toolCommand('mcp__claude_ai_Gmail__send_message', { to: 'x@example.invalid', body: 'Hi' }))
    const approval = await waitFor(() => R.listApprovals(h.db, { status: 'pending' })[0], 'send approval')
    expect(approval.toolName).toBe('mcp__claude_ai_Gmail__send_message')
    h.broker.decide(approval.id, 'deny')
    await h.finished(a.id, 2)

    // Ordinary tools run without a card, and Ant's own tools don't trip the send floor.
    h.svc.sendFromUser(a.threadId, toolCommand('Write', { file_path: '/tmp/elsewhere.txt', content: 'x' }))
    h.svc.sendFromUser(a.threadId, toolCommand('mcp__ant__post_to_colony', { colony: 'none', text: 'hello' }))
    await h.finished(a.id, 4)
    expect(R.listApprovals(h.db)).toHaveLength(1)
  })

  it("full access denies WebFetch to Ant's own port from the hook", async () => {
    const a = h.ant()
    h.svc.updateAnt(a.id, { permissionMode: 'full' })
    h.svc.sendFromUser(a.threadId, toolCommand('WebFetch', { url: `http://localhost:${h.cfg.selfPorts[0]}/api/approvals`, prompt: 'x' }))
    await h.finished(a.id)
    expect(R.listToolEvents(h.db, h.runs(a.id)[0]!.id)[0]).toMatchObject({ name: 'WebFetch', status: 'denied' })
    expect(R.listApprovals(h.db)).toEqual([])
  })
})
