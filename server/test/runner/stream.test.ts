import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { StreamParser, type StreamEvent } from '../../src/runner/stream.ts'

function replay(name: string): StreamEvent[] {
  const p = new StreamParser()
  const lines = readFileSync(new URL(`../fixtures/stream/${name}.jsonl`, import.meta.url), 'utf8').trim().split('\n')
  return lines.flatMap((l) => p.feed(JSON.parse(l)))
}

describe('StreamParser', () => {
  const ev = replay('spike1')

  it('emits init with session and MCP status', () => {
    const init = ev.find((e) => e.t === 'init')
    expect(init).toMatchObject({ t: 'init', model: expect.stringContaining('haiku') })
  })

  it('streams text that matches the final text for every block', () => {
    const acc = new Map<string, string>()
    for (const e of ev) {
      if (e.t === 'text.delta') acc.set(e.key, (acc.get(e.key) ?? '') + e.text)
      if (e.t === 'text.end') expect(acc.get(e.key) ?? '').toBe(e.text)
    }
    const ends = ev.filter((e) => e.t === 'text.end')
    expect(ends.map((e) => (e as { text: string }).text)).toContain('pong')
    expect(new Set(ends.map((e) => (e as { key: string }).key)).size).toBe(ends.length)
  })

  it('pairs tool starts with results, including denials', () => {
    const starts = ev.filter((e) => e.t === 'tool.start') as Extract<StreamEvent, { t: 'tool.start' }>[]
    const results = ev.filter((e) => e.t === 'tool.result') as Extract<StreamEvent, { t: 'tool.result' }>[]
    expect(starts.map((s) => s.name)).toEqual(expect.arrayContaining(['mcp__ant__ping', 'Write']))
    for (const r of results) expect(starts.some((s) => s.toolUseId === r.toolUseId)).toBe(true)
    expect(results.some((r) => r.isError && r.summary.includes('Denied by Ant spike'))).toBe(true)
  })

  it('reports results, rate limits and the interrupt', () => {
    const results = ev.filter((e) => e.t === 'result') as Extract<StreamEvent, { t: 'result' }>[]
    expect(results).toHaveLength(8)
    expect(results.filter((r) => !r.ok).map((r) => r.subtype)).toEqual(['error_during_execution'])
    expect(ev.some((e) => e.t === 'rate_limit' && e.fiveHour && e.fiveHour.resetsAt > 1e12)).toBe(true)
    expect(ev.some((e) => e.t === 'control' && e.ok)).toBe(true)
  })
})
