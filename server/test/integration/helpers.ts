import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import type { AntEvent } from '@ant/shared'
import { Broker } from '../../src/broker.ts'
import { loadConfig } from '../../src/config.ts'
import { openDb } from '../../src/db/index.ts'
import * as R from '../../src/db/repos/index.ts'
import { IpcServer } from '../../src/ipc.ts'
import { AntService } from '../../src/service.ts'
import { AntProcess } from '../../src/runner/process.ts'
import type { StreamEvent } from '../../src/runner/stream.ts'
import { registerTools } from '../../src/tools.ts'
import type { WireMessage } from '../fake-claude/scenarios.ts'

export const FAKE_CLAUDE = fileURLToPath(new URL('../fake-claude/claude', import.meta.url))

/** Real timers and monotonic deadlines keep subprocess I/O usable with fake Date/intervals. */
export async function waitFor<T>(read: () => T | undefined | null | false, label = 'condition', timeout = 4000): Promise<T> {
  const deadline = performance.now() + timeout
  do {
    const value = read()
    if (value !== undefined && value !== null && value !== false) return value
    await delay(10)
  } while (performance.now() < deadline)
  throw new Error(`Timed out waiting for ${label}`)
}

export interface TraceEntry {
  kind: 'spawn' | 'stdin' | 'stdout' | 'mcp' | 'hook'
  argv?: string[]
  pid?: number
  sessionId?: string
  message?: WireMessage
  name?: string
  input?: WireMessage
  result?: WireMessage
  command?: string
  output?: string
}

function readTrace(folder: string): TraceEntry[] {
  const path = join(folder, '.fake-claude.jsonl')
  return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as TraceEntry) : []
}

export async function createHarness(maxBusy = 3) {
  const root = mkdtempSync(join(tmpdir(), 'ant-fake-'))
  // IpcServer.listen does not reject on a bind error. Probe first so a restricted
  // test environment fails promptly instead of hanging every beforeEach.
  const probe = createServer()
  try {
    await new Promise<void>((resolveProbe, reject) => {
      probe.once('error', reject)
      probe.listen(join(root, 'probe.sock'), () => probe.close((err) => err ? reject(err) : resolveProbe()))
    })
  } catch (err) {
    rmSync(root, { recursive: true, force: true })
    throw new Error('Integration tests require local Unix socket binding', { cause: err })
  }
  const cfg = loadConfig({
    ANT_HOME: join(root, 'Ants'), ANT_DATA_DIR: join(root, 'data'), ANT_SOCKET: join(root, 'ipc.sock'),
    ANT_CLAUDE_BIN: FAKE_CLAUDE, ANT_PORT: '0', ANT_MAX_BUSY: String(maxBusy),
  })
  mkdirSync(cfg.antHome, { recursive: true })
  mkdirSync(cfg.dataDir, { recursive: true })
  const db = openDb(':memory:')
  const ipc = new IpcServer(cfg.socketPath)
  const svc = new AntService(db, cfg, ipc)
  const broker = new Broker(svc)
  registerTools(svc, broker)
  const events: AntEvent[] = []
  svc.bus.on('event', (event: AntEvent) => events.push(event))
  await ipc.listen()
  const ant = (name = 'A') => {
    const a = svc.createAnt({ name, description: `Test ant ${name}.`, color: 'coral', accessory: 'none', model: 'haiku' })
    return { ...a, threadId: svc.antThread(a.id).id, paths: svc.pathsFor(a.id) }
  }
  const trace = (antId: string) => readTrace(svc.pathsFor(antId).folder)
  const runs = (antId?: string) => R.listRuns(db, { antId, limit: 200 }).reverse()
  const messages = (threadId: string) => R.listMessages(db, threadId, { limit: 200 })
  const finished = (antId: string, count = 1) => waitFor(() => {
    const rows = runs(antId)
    return rows.length >= count && rows.every((r) => r.status !== 'running' && r.status !== 'queued') && !svc.currentTurn(antId) ? rows : undefined
  }, `${count} finished runs for ${antId}`)

  async function close() {
    const processes = R.listAnts(db).map((a) => svc.liveProcess(a.id)?.proc).filter((p) => p !== undefined)
    for (const approval of R.listApprovals(db, { status: 'pending' })) broker.decide(approval.id, 'deny')
    svc.shutdown()
    broker.shutdown()
    try {
      await waitFor(() => processes.every((p) => p.state === 'exited'), 'fake processes to exit', 6000)
    } finally {
      ipc.close()
      db.close()
      rmSync(root, { recursive: true, force: true })
    }
  }

  return { root, cfg, db, ipc, svc, broker, events, ant, trace, runs, messages, finished, close }
}

export type Harness = Awaited<ReturnType<typeof createHarness>>
export const toolCommand = (name: string, input: Record<string, unknown>) => `tool:${name}:${JSON.stringify(input)}`

/** Runner/protocol tests need stdio only, and can also run without socket privileges. */
export function createFakeProcess() {
  const root = mkdtempSync(join(tmpdir(), 'ant-protocol-'))
  const events: StreamEvent[] = []
  const exits: Array<{ code: number | null; signal: string | null; stderr: string }> = []
  const processes: AntProcess[] = []
  const start = (sessionId: string, resume = false) => {
    const proc = new AntProcess({
      bin: FAKE_CLAUDE, cwd: root, sessionId, resume, model: 'fake-model',
      settingsPath: join(root, 'settings.json'), mcpConfigPath: join(root, 'mcp.json'), env: {},
    }, { onEvent: (e) => events.push(e), onExit: (info) => exits.push(info) })
    processes.push(proc)
    return proc
  }
  const trace = () => readTrace(root)
  const results = () => events.filter((e) => e.t === 'result')
  async function close() {
    for (const proc of processes) proc.stop()
    await waitFor(() => processes.every((p) => p.state === 'exited'), 'protocol processes to exit', 6000)
    rmSync(root, { recursive: true, force: true })
  }
  return { root, events, exits, start, trace, results, close }
}
