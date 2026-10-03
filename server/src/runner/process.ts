// One long-lived `claude -p` stream-json process for one ant (plan §3, spike 1).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { StreamParser, type StreamEvent } from './stream.ts'

export interface SpawnSpec {
  bin: string
  cwd: string
  sessionId: string
  /** Resume an existing session instead of starting one with this id. */
  resume: boolean
  settingsPath: string
  mcpConfigPath: string
  model: string
  effort?: string
  permissionMode?: 'supervised' | 'edits' | 'auto' | 'full'
  env: Record<string, string>
}

export type ProcState = 'starting' | 'ready' | 'busy' | 'exited'

export interface ProcHandlers {
  onEvent: (e: StreamEvent) => void
  onExit: (info: { code: number | null; signal: string | null; stderr: string }) => void
}

export function buildArgs(spec: SpawnSpec): string[] {
  return [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    spec.resume ? '--resume' : '--session-id', spec.sessionId,
    // Only the ant's folder and antd's generated settings: none of the user's
    // personal hooks, plugins or skills (spike 2).
    '--setting-sources', 'project,local',
    '--settings', spec.settingsPath,
    '--mcp-config', spec.mcpConfigPath,
    '--permission-prompt-tool', 'mcp__ant__permission',
    '--model', spec.model,
    ...(spec.effort ? ['--effort', spec.effort] : []),
    // Supervised and auto-accept edits are both the CLI default mode; settings.json tells them apart.
    ...(spec.permissionMode === 'auto' ? ['--permission-mode', 'auto'] : []),
    ...(spec.permissionMode === 'full' ? ['--permission-mode', 'bypassPermissions'] : []),
  ]
}

export class AntProcess {
  state: ProcState = 'starting'
  lastActive = Date.now()
  private child: ChildProcessWithoutNullStreams
  private parser = new StreamParser()
  private stderr: string[] = []
  readonly spec: SpawnSpec
  private handlers: ProcHandlers

  constructor(spec: SpawnSpec, handlers: ProcHandlers) {
    this.spec = spec
    this.handlers = handlers
    this.child = spawn(spec.bin, buildArgs(spec), {
      cwd: spec.cwd,
      env: {
        ...process.env,
        // claude.ai connectors without loading user settings (spike 4).
        ENABLE_CLAUDEAI_MCP_SERVERS: 'true',
        ...spec.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    createInterface({ input: this.child.stdout }).on('line', (line) => this.line(line))
    this.child.stderr.on('data', (d: Buffer) => {
      this.stderr.push(String(d))
      if (this.stderr.length > 50) this.stderr.shift()
    })
    this.child.on('exit', (code, signal) => {
      this.state = 'exited'
      this.handlers.onExit({ code, signal, stderr: this.stderr.join('').slice(-4000) })
    })
    this.child.on('error', (err) => this.stderr.push(String(err)))
    this.state = 'ready'
  }

  private line(line: string) {
    let raw: unknown
    try {
      raw = JSON.parse(line)
    } catch {
      return
    }
    for (const e of this.parser.feed(raw as Record<string, unknown>)) {
      if (e.t === 'result') {
        this.state = 'ready'
        this.lastActive = Date.now()
      }
      this.handlers.onEvent(e)
    }
  }

  private write(o: unknown) {
    if (this.state === 'exited') throw new Error('ant process has exited')
    this.child.stdin.write(JSON.stringify(o) + '\n')
  }

  /** Start a turn. The CLI queues messages sent while busy (spike 1). */
  send(text: string) {
    this.state = 'busy'
    this.lastActive = Date.now()
    this.write({ type: 'user', message: { role: 'user', content: text } })
  }

  interrupt(): string {
    const requestId = `int_${randomUUID()}`
    this.write({ type: 'control_request', request_id: requestId, request: { subtype: 'interrupt' } })
    return requestId
  }

  stop() {
    if (this.state === 'exited') return
    this.child.stdin.end()
    const t = setTimeout(() => this.child.kill('SIGTERM'), 5000)
    this.child.once('exit', () => clearTimeout(t))
  }
}
