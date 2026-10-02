import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recordedTextTurn, scenarioFor, SLOW_TEXT } from '../fake-claude/scenarios.ts'
import { createFakeProcess, waitFor } from './helpers.ts'

let fake: ReturnType<typeof createFakeProcess>
beforeEach(() => { fake = createFakeProcess() })
afterEach(async () => { await fake.close() })

describe('fake claude stream-json contract', () => {
  it('selects exact commands after user/colony envelopes and acknowledges reply envelopes', () => {
    expect(scenarioFor('[Leon] say:hello\nworld')).toEqual({ kind: 'say', text: 'hello\nworld' })
    expect(scenarioFor('[Colony: Crew · Leon] @B tool:Write:{"content":"say:keep this"}')).toEqual({ kind: 'tool', name: 'Write', input: { content: 'say:keep this' } })
    expect(scenarioFor('[Reply from B] crash')).toEqual({ kind: 'say', text: 'Received [Reply from B] crash' })
    expect(scenarioFor('[Leon] slow:75')).toEqual({ kind: 'slow', ms: 75 })
    expect(scenarioFor('[From A] ping-pong:A:B')).toEqual({ kind: 'ping-pong', first: 'A', second: 'B' })
    expect(() => scenarioFor('tool:Write:[]')).toThrow('JSON object')
  })

  it('parses spawn flags and queues turns sent while already busy', async () => {
    const id = randomUUID()
    const proc = fake.start(id)
    proc.send('slow:80')
    proc.send('say:Second\nline 🐜')
    await waitFor(() => fake.results().length === 2, 'two queued results')
    expect(fake.events.find((e) => e.t === 'init')).toMatchObject({ sessionId: id, model: 'fake-model' })
    expect(fake.events.filter((e) => e.t === 'text.end').map((e) => e.text)).toEqual([SLOW_TEXT, 'Second\nline 🐜'])
    expect(fake.results().map((e) => e.totalCostUsd)).toEqual([0.01, 0.02])
    expect(fake.results().every((e) => e.ok)).toBe(true)
    expect(proc.state).toBe('ready')
    const frames = fake.trace().filter((e) => e.kind === 'stdout').map((e) => e.message!)
    expect(frames.every((m) => m.session_id === id)).toBe(true)
    for (const [i, frame] of frames.entries()) if (frame.type === 'result') expect(frames[i - 1]?.type).toBe('rate_limit_event')
    expect(frames.filter((m) => m.type === 'stream_event').map((m) => m.event.type)).toEqual(expect.arrayContaining(['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_stop']))
  })

  it('replays actual fixture partial and complete assistant frames', async () => {
    const proc = fake.start(randomUUID())
    proc.send('fixture:spike1')
    await waitFor(() => fake.results().length === 1, 'recorded turn result')
    const frames = fake.trace().filter((e) => e.kind === 'stdout' && (e.message?.type === 'stream_event' || e.message?.type === 'assistant'))
    expect(frames.map((e) => e.message?.event ?? e.message?.message)).toEqual(recordedTextTurn.map((m) => m.event ?? m.message))
    expect(fake.events.filter((e) => e.t === 'text.end').map((e) => e.text)).toEqual(['one'])
  })

  it('acknowledges interrupts, leaves partial text dangling, and continues on the same process', async () => {
    const proc = fake.start(randomUUID())
    proc.send('slow:2000')
    await waitFor(() => fake.events.some((e) => e.t === 'text.delta'), 'slow text delta')
    const requestId = proc.interrupt()
    await waitFor(() => fake.results().length === 1, 'interrupted result')
    expect(fake.events.find((e) => e.t === 'control')).toEqual({ t: 'control', requestId, ok: true })
    expect(fake.results()[0]).toMatchObject({ ok: false, subtype: 'error_during_execution', totalCostUsd: 0.01 })
    expect(fake.events.filter((e) => e.t === 'text.end')).toEqual([])
    proc.send('say:After interrupt')
    await waitFor(() => fake.results().length === 2, 'post-interrupt result')
    expect(fake.events.filter((e) => e.t === 'text.end').map((e) => e.text)).toEqual(['After interrupt'])
    expect(fake.trace().filter((e) => e.kind === 'spawn')).toHaveLength(1)
  })

  it('preserves cumulative session cost across --resume', async () => {
    const id = randomUUID()
    const first = fake.start(id)
    first.send('say:First')
    await waitFor(() => fake.results().length === 1, 'first result')
    first.stop()
    await waitFor(() => first.state === 'exited', 'first process exit')
    fake.start(id, true).send('say:Resumed')
    await waitFor(() => fake.results().length === 2, 'resumed result')
    expect(fake.results().map((e) => e.totalCostUsd)).toEqual([0.01, 0.02])
    expect(fake.trace().filter((e) => e.kind === 'spawn')[1]?.argv).toEqual(expect.arrayContaining(['--resume', id]))
  })

  it('exits non-zero with a deterministic stderr line on crash', async () => {
    const proc = fake.start(randomUUID())
    proc.send('crash')
    const exit = await waitFor(() => fake.exits[0], 'scripted crash exit')
    expect(exit).toMatchObject({ code: 17, signal: null, stderr: 'fake-claude: scripted crash\n' })
    expect(proc.state).toBe('exited')
    expect(fake.results()).toEqual([])
  })
})
