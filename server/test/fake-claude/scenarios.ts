import { readFileSync } from 'node:fs'

// Exact commands, after antd's envelope (and optional colony @mentions):
// say:<text>, tool:<name>:<JSON object>, slow:<duration ms>, crash,
// fixture:spike1, ping-pong:<first ant name>:<second ant name>.
// Replies are deliberately acknowledged, never interpreted as fresh commands.
export type Scenario =
  | { kind: 'say'; text: string }
  | { kind: 'tool'; name: string; input: Record<string, unknown> }
  | { kind: 'slow'; ms: number }
  | { kind: 'crash' }
  | { kind: 'fixture' }
  | { kind: 'ping-pong'; first: string; second: string }

export const TURN_COST_USD = 0.01
export const SLOW_TEXT = 'Working slowly on this turn.'

export function scenarioFor(text: string): Scenario {
  if (text.startsWith('[Reply from ')) return { kind: 'say', text: `Received ${text}` }
  const body = text.replace(/^\[[^\]]+\]\s*/, '').replace(/^(?:@\S+\s+)+/, '')
  if (body.startsWith('say:')) return { kind: 'say', text: body.slice(4) }
  const tool = /^tool:([^:]+):([\s\S]*)$/.exec(body)
  if (tool) {
    const input: unknown = JSON.parse(tool[2]!)
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('tool input must be a JSON object')
    return { kind: 'tool', name: tool[1]!, input: input as Record<string, unknown> }
  }
  const slow = /^slow:(\d+)$/.exec(body)
  if (slow) return { kind: 'slow', ms: Math.min(30_000, Number(slow[1])) }
  if (body === 'crash') return { kind: 'crash' }
  if (body === 'fixture:spike1') return { kind: 'fixture' }
  const ping = /^ping-pong:([^:]+):([^:]+)$/.exec(body)
  if (ping) return { kind: 'ping-pong', first: ping[1]!, second: ping[2]! }
  return { kind: 'say', text: `Received ${text}` }
}

// Recorded protocol messages are intentionally loose, like StreamParser's input.
export type WireMessage = Record<string, any>
export const recording: WireMessage[] = readFileSync(new URL('../fixtures/stream/spike1.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map((line) => JSON.parse(line) as WireMessage)

export function template(type: string, predicate: (m: WireMessage) => boolean = () => true): WireMessage {
  const message = recording.find((m) => m.type === type && predicate(m))
  if (!message) throw new Error(`Missing recorded template: ${type}`)
  return structuredClone(message)
}

// First recorded turn is just "one", with no tool effects. Reuse its partials
// and complete assistant frames; init, rate and result are generated per session.
export const recordedTextTurn = recording.slice(0, recording.findIndex((m) => m.type === 'result'))
  .filter((m) => m.type === 'stream_event' || m.type === 'assistant')
