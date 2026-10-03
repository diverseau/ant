#!/usr/bin/env node
// Local Claude protocol double. Built-ins are simulated; only the configured
// stdio MCP server and PreToolUse hook run. No model, auth or network calls.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { recordedTextTurn, scenarioFor, SLOW_TEXT, template, TURN_COST_USD, type WireMessage } from './scenarios.ts'

const argv = process.argv.slice(2)
const value = (flag: string) => {
  const index = argv.indexOf(flag)
  return index < 0 ? undefined : argv[index + 1]
}
const sessionId = value('--session-id') ?? value('--resume') ?? randomUUID()
const model = value('--model') ?? 'fake-haiku'
const tracePath = resolve('.fake-claude.jsonl')
const trace = (entry: object) => appendFileSync(tracePath, JSON.stringify(entry) + '\n')
let totalCost = 0
if (value('--resume') && existsSync(tracePath)) {
  for (const line of readFileSync(tracePath, 'utf8').trim().split('\n')) {
    const entry = JSON.parse(line) as { kind: string; message?: WireMessage }
    if (entry.kind === 'stdout' && entry.message?.type === 'result' && entry.message.session_id === sessionId) {
      totalCost = entry.message.total_cost_usd
    }
  }
}
trace({ kind: 'spawn', argv, pid: process.pid, sessionId })

function emit(message: WireMessage) {
  const frame = { ...message, session_id: sessionId, uuid: randomUUID() }
  trace({ kind: 'stdout', message: frame })
  process.stdout.write(JSON.stringify(frame) + '\n')
}

function stream(event: WireMessage) {
  emit({ ...template('stream_event'), parent_tool_use_id: null, event })
}

function startText() {
  const id = `msg_${randomUUID()}`
  const start = template('stream_event', (m) => m.event?.type === 'message_start').event
  stream({ type: 'message_start', message: { ...start.message, id, model, content: [] } })
  stream({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
  return id
}

function endText(id: string, text: string) {
  stream({ type: 'content_block_stop', index: 0 })
  const full = template('assistant', (m) => m.message?.content?.some((b: WireMessage) => b.type === 'text'))
  emit({ ...full, message: { ...full.message, id, model, content: [{ type: 'text', text }] } })
  stream({ type: 'message_stop' })
}

function textDelta(text: string) {
  stream({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
}

function say(text: string) {
  const id = startText()
  for (const chunk of text.match(/.{1,4}/gsu) ?? []) textDelta(chunk)
  endText(id, text)
}

function result(started: number, text: string, interrupted = false) {
  const rate = template('rate_limit_event')
  const resetsAt = Math.floor(Date.now() / 1000) + 3600
  rate.rate_limit_info.unifiedWindows.five_hour.resetsAt = resetsAt
  rate.rate_limit_info.unifiedWindows.seven_day.resetsAt = resetsAt + 86400
  rate.rate_limit_info.resetsAt = resetsAt
  emit(rate)
  totalCost = Number((totalCost + TURN_COST_USD).toFixed(6))
  emit({
    ...template('result'), subtype: interrupted ? 'error_during_execution' : 'success', is_error: interrupted,
    duration_ms: Date.now() - started, total_cost_usd: totalCost, num_turns: 1, result: text,
    errors: interrupted ? ['Interrupted by user'] : [],
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 },
    modelUsage: {},
  })
}

let transport: StdioClientTransport | undefined
let clientPromise: Promise<Client> | undefined
function mcp(): Promise<Client> {
  if (!clientPromise) clientPromise = (async () => {
    const path = value('--mcp-config')
    if (!path) throw new Error('--mcp-config is required for tool scenarios')
    const config = JSON.parse(readFileSync(path, 'utf8')) as {
      mcpServers: { ant: { command: string; args?: string[]; env?: Record<string, string> } }
    }
    const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => typeof pair[1] === 'string'))
    transport = new StdioClientTransport({ ...config.mcpServers.ant, env: { ...env, ...config.mcpServers.ant.env }, stderr: 'pipe' })
    transport.stderr?.on('data', (data: Buffer) => process.stderr.write(data))
    const client = new Client({ name: 'fake-claude', version: '1.0.0' })
    await client.connect(transport)
    return client
  })()
  return clientPromise
}

async function call(name: string, input: Record<string, unknown>, signal: AbortSignal) {
  if (!name.startsWith('mcp__ant__')) throw new Error(`Unsupported MCP tool: ${name}`)
  const client = await mcp()
  signal.throwIfAborted()
  const response = await client.callTool({ name: name.slice('mcp__ant__'.length), arguments: input }, undefined, { signal })
  trace({ kind: 'mcp', name, input, result: response })
  return response
}

async function hook(name: string, input: Record<string, unknown>, toolUseId: string, signal: AbortSignal) {
  const path = value('--settings')
  if (!path) return undefined
  const settings = JSON.parse(readFileSync(path, 'utf8')) as {
    hooks?: { PreToolUse?: Array<{ hooks: Array<{ command: string }> }> }
  }
  const command = settings.hooks?.PreToolUse?.[0]?.hooks[0]?.command
  if (!command) return undefined
  const payload = { tool_name: name, tool_input: input, tool_use_id: toolUseId, cwd: process.cwd(), session_id: sessionId }
  const output = await new Promise<string>((resolveOutput, reject) => {
    const child = spawn(`exec ${command}`, { shell: true, stdio: ['pipe', 'pipe', 'pipe'], signal })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data: Buffer) => { stdout += String(data) })
    child.stderr.on('data', (data: Buffer) => { stderr += String(data) })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolveOutput(stdout) : reject(new Error(`hook exited ${code}: ${stderr}`)))
    child.stdin.end(JSON.stringify(payload))
  })
  trace({ kind: 'hook', command, input: payload, output })
  if (!output.trim()) return undefined
  return (JSON.parse(output) as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } }).hookSpecificOutput
}

async function tool(name: string, input: Record<string, unknown>, signal: AbortSignal): Promise<string> {
  const id = `toolu_${randomUUID()}`
  const assistant = template('assistant', (m) => m.message?.content?.some((b: WireMessage) => b.type === 'tool_use'))
  emit({ ...assistant, message: { ...assistant.message, id: `msg_${randomUUID()}`, content: [{ type: 'tool_use', id, name, input }] } })
  let error = false
  let output: unknown = 'Simulated tool completed.'
  // Real Claude Code hooks every tool; the double keeps to Bash except in bypass mode,
  // where the hook is the only gate left.
  const bypass = value('--permission-mode') === 'bypassPermissions'
  const verdict = name === 'Bash' || bypass ? await hook(name, input, id, signal) : undefined
  if (verdict?.permissionDecision === 'deny') {
    error = true
    output = `Permission denied: ${verdict.permissionDecisionReason}`
  } else {
    // Ant's tools are explicitly allowed in generated settings and gate themselves.
    // File tools always visit the real broker, including inside-folder allows.
    const needsPermission = !bypass && (!name.startsWith('mcp__ant__') && name !== 'Bash' || !!input.dangerouslyDisableSandbox)
      || verdict?.permissionDecision === 'ask'
    if (needsPermission) {
      const response = await call(value('--permission-prompt-tool') ?? 'mcp__ant__permission', { tool_name: name, input, tool_use_id: id }, signal)
      const contents = response.content as Array<{ type: string; text?: string }>
      const decision = JSON.parse(contents.find((c) => c.type === 'text')?.text ?? '{}') as { behavior: string; message?: string; updatedInput?: Record<string, unknown> }
      if (decision.behavior !== 'allow') {
        error = true
        output = `Permission denied: ${decision.message ?? 'No allowance'}`
      } else input = decision.updatedInput ?? input
    }
    if (!error && name.startsWith('mcp__ant__')) {
      const response = await call(name, input, signal)
      output = response.content
      error = !!response.isError
    }
  }
  signal.throwIfAborted()
  const user = template('user', (m) => Array.isArray(m.message?.content) && m.message.content.some((b: WireMessage) => b.type === 'tool_result'))
  emit({ ...user, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: output, is_error: error }] }, tool_use_result: output })
  return error ? 'Tool denied.' : 'Tool completed.'
}

let active: AbortController | undefined
let closing = false
let queue = Promise.resolve()
async function turn(text: string) {
  const controller = new AbortController()
  active = controller
  const started = Date.now()
  let answer = ''
  try {
    const scenario = scenarioFor(text)
    switch (scenario.kind) {
      case 'crash':
        process.stderr.write('fake-claude: scripted crash\n')
        await shutdown(17)
        return
      case 'say':
        answer = scenario.text
        say(answer)
        break
      case 'fixture':
        for (const frame of recordedTextTurn) emit(frame)
        answer = 'one'
        break
      case 'slow': {
        const id = startText()
        for (const char of SLOW_TEXT) {
          controller.signal.throwIfAborted()
          textDelta(char)
          await delay(scenario.ms / SLOW_TEXT.length, undefined, { signal: controller.signal })
        }
        answer = SLOW_TEXT
        endText(id, answer)
        break
      }
      case 'tool':
        answer = await tool(scenario.name, scenario.input, controller.signal)
        say(answer)
        break
      case 'ping-pong': {
        const identity = readFileSync(resolve('CLAUDE.md'), 'utf8').split('\n').find((line) => line.startsWith('# You are ')) ?? ''
        const to = identity.startsWith(`# You are ${scenario.first},`) ? scenario.second : scenario.first
        await tool('mcp__ant__message_ant', { to, text: `ping-pong:${scenario.first}:${scenario.second}` }, controller.signal)
        answer = 'Ping sent.'
        say(answer)
        break
      }
    }
    controller.signal.throwIfAborted()
    result(started, answer)
  } catch (err) {
    if (!controller.signal.aborted) throw err
    if (!closing) result(started, '', true)
  } finally {
    active = undefined
  }
}

async function shutdown(code = 0) {
  if (closing) return
  closing = true
  active?.abort()
  // ant-mcp holds an IPC socket open after stdin EOF. Terminate our child before
  // closing its SDK transport so every test leaves no MCP process behind.
  if (transport?.pid) {
    try { process.kill(transport.pid, 'SIGTERM') } catch { /* Already exited. */ }
  }
  await transport?.close()
  process.exit(code)
}

const init = template('system', (m) => m.subtype === 'init')
emit({ ...init, cwd: process.cwd(), model, plugins: [], skills: [], slash_commands: [], memory_paths: undefined })
const stdin = createInterface({ input: process.stdin })
stdin.on('line', (line) => {
  let message: WireMessage
  try { message = JSON.parse(line) as WireMessage } catch { return }
  trace({ kind: 'stdin', message })
  if (message.type === 'control_request' && message.request?.subtype === 'interrupt') {
    emit({ ...template('control_response'), response: { subtype: 'success', request_id: message.request_id } })
    active?.abort()
  } else if (message.type === 'user' && typeof message.message?.content === 'string') {
    queue = queue.then(() => closing ? undefined : turn(message.message.content)).catch(async (err: unknown) => {
      process.stderr.write(`fake-claude: ${String(err)}\n`)
      await shutdown(1)
    })
  }
})
stdin.on('close', () => { void shutdown() })
process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })
