// Normalises Claude Code `--output-format stream-json` lines into the events antd
// cares about. Pure and stateful per session; no I/O.

export type StreamEvent =
  | { t: 'init'; sessionId: string; model: string; mcpServers: { name: string; status: string; source?: string }[] }
  | { t: 'text.start'; key: string }
  | { t: 'text.delta'; key: string; text: string }
  | { t: 'text.end'; key: string; text: string }
  | { t: 'tool.start'; toolUseId: string; name: string; input: unknown; parentToolUseId: string | null }
  | { t: 'tool.result'; toolUseId: string; isError: boolean; summary: string }
  | { t: 'thinking'; key: string }
  | { t: 'rate_limit'; status: string; fiveHour?: Window; sevenDay?: Window }
  | { t: 'result'; ok: boolean; subtype: string; totalCostUsd: number; turns: number; durationMs: number; usage: TokenUsage; text: string | null; errors: string[] }
  | { t: 'control'; requestId: string; ok: boolean }
  | { t: 'task'; taskId: string; toolUseId: string; status: string; summary: string }

export interface Window {
  utilization: number
  resetsAt: number
}

export interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

interface Block {
  type: string
  text: string
  toolUseId?: string
  name?: string
  json: string
}

// Raw stream-json is loosely typed; read it defensively.
type Raw = Record<string, any>

export class StreamParser {
  private messageId = ''
  private blocks = new Map<number, Block>()
  /** Text blocks already announced through streaming deltas, keyed `${messageId}:${index}`. */
  private streamed = new Set<string>()

  feed(m: Raw): StreamEvent[] {
    switch (m.type) {
      case 'system':
        return this.system(m)
      case 'stream_event':
        // Subagent output is surfaced through its parent tool call, not as chat text.
        if (m.parent_tool_use_id) return []
        return this.streamEvent(m.event ?? {})
      case 'assistant':
        return this.assistant(m)
      case 'user':
        return this.user(m)
      case 'rate_limit_event':
        return [this.rateLimit(m.rate_limit_info ?? {})]
      case 'result':
        return [this.result(m)]
      case 'control_response':
        return [{ t: 'control', requestId: m.response?.request_id ?? '', ok: m.response?.subtype === 'success' }]
      default:
        return []
    }
  }

  private system(m: Raw): StreamEvent[] {
    if (m.subtype === 'init') {
      return [{ t: 'init', sessionId: m.session_id, model: m.model, mcpServers: m.mcp_servers ?? [] }]
    }
    if (m.subtype === 'task_started' || m.subtype === 'task_notification') {
      return [
        {
          t: 'task',
          taskId: m.task_id,
          toolUseId: m.tool_use_id,
          status: m.subtype === 'task_started' ? 'running' : (m.status ?? 'done'),
          summary: m.summary ?? m.description ?? '',
        },
      ]
    }
    return []
  }

  private streamEvent(e: Raw): StreamEvent[] {
    switch (e.type) {
      case 'message_start':
        this.messageId = e.message?.id ?? ''
        this.blocks.clear()
        return []
      case 'content_block_start': {
        const cb = e.content_block ?? {}
        const block: Block = { type: cb.type, text: '', json: '', toolUseId: cb.id, name: cb.name }
        this.blocks.set(e.index, block)
        const key = `${this.messageId}:${e.index}`
        if (cb.type === 'text') {
          this.streamed.add(key)
          return [{ t: 'text.start', key }]
        }
        if (cb.type === 'thinking') return [{ t: 'thinking', key }]
        return []
      }
      case 'content_block_delta': {
        const block = this.blocks.get(e.index)
        const d = e.delta ?? {}
        if (!block) return []
        if (d.type === 'text_delta' && d.text) {
          block.text += d.text
          return [{ t: 'text.delta', key: `${this.messageId}:${e.index}`, text: d.text }]
        }
        if (d.type === 'input_json_delta') block.json += d.partial_json ?? ''
        return []
      }
      case 'content_block_stop': {
        const block = this.blocks.get(e.index)
        if (block?.type === 'text') return [{ t: 'text.end', key: `${this.messageId}:${e.index}`, text: block.text }]
        return []
      }
      default:
        return []
    }
  }

  // Complete assistant messages repeat what streaming already delivered. Use them for
  // tool calls (with full input) and for text that wasn't streamed (partials disabled).
  private assistant(m: Raw): StreamEvent[] {
    const msg = m.message ?? {}
    const out: StreamEvent[] = []
    const content: Raw[] = Array.isArray(msg.content) ? msg.content : []
    content.forEach((b, i) => {
      if (b.type === 'tool_use') {
        out.push({ t: 'tool.start', toolUseId: b.id, name: b.name, input: b.input ?? {}, parentToolUseId: m.parent_tool_use_id ?? null })
      } else if (b.type === 'text' && !m.parent_tool_use_id) {
        const key = this.findStreamedKey(msg.id, b.text) ?? `${msg.id}:full:${i}`
        if (!this.streamed.has(key)) {
          this.streamed.add(key)
          out.push({ t: 'text.start', key }, { t: 'text.end', key, text: b.text })
        }
      }
    })
    return out
  }

  private findStreamedKey(messageId: string, text: string): string | undefined {
    for (const [index, block] of this.blocks) {
      const key = `${messageId}:${index}`
      if (block.type === 'text' && this.streamed.has(key) && block.text === text) return key
    }
    return undefined
  }

  private user(m: Raw): StreamEvent[] {
    const content = m.message?.content
    if (!Array.isArray(content)) return []
    return content
      .filter((b: Raw) => b.type === 'tool_result')
      .map((b: Raw) => ({ t: 'tool.result' as const, toolUseId: b.tool_use_id, isError: !!b.is_error, summary: summarise(b.content) }))
  }

  private rateLimit(info: Raw): StreamEvent {
    const w = info.unifiedWindows ?? {}
    return {
      t: 'rate_limit',
      status: info.status ?? 'unknown',
      fiveHour: w.five_hour ? { utilization: w.five_hour.utilization, resetsAt: w.five_hour.resetsAt * 1000 } : undefined,
      sevenDay: w.seven_day ? { utilization: w.seven_day.utilization, resetsAt: w.seven_day.resetsAt * 1000 } : undefined,
    }
  }

  private result(m: Raw): StreamEvent {
    const u = m.usage ?? {}
    return {
      t: 'result',
      ok: !m.is_error && m.subtype === 'success',
      subtype: m.subtype ?? 'unknown',
      totalCostUsd: m.total_cost_usd ?? 0,
      turns: m.num_turns ?? 0,
      durationMs: m.duration_ms ?? 0,
      usage: {
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
      },
      text: typeof m.result === 'string' ? m.result : null,
      errors: Array.isArray(m.errors) ? m.errors.map(String) : [],
    }
  }
}

/** Collapse a tool_result content payload into a short single-line summary. */
export function summarise(content: unknown, max = 240): string {
  let text = ''
  if (typeof content === 'string') text = content
  else if (Array.isArray(content)) {
    text = content
      .map((c: Raw) => (c.type === 'text' ? c.text : c.type === 'tool_reference' ? `→ ${c.tool_name}` : `[${c.type}]`))
      .join(' ')
  }
  text = text.replace(/<\/?tool_use_error>/g, '').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}
