import { homedir } from 'node:os'
import { join } from 'node:path'

const home = homedir()
const dataHome = process.env.XDG_DATA_HOME ?? join(home, '.local', 'share')

export interface Config {
  /** Where ant folders live. */
  antHome: string
  /** antd-private state: db, token, generated settings. Ants are denied access. */
  dataDir: string
  dbPath: string
  socketPath: string
  port: number
  host: string
  claudeBin: string
  /** Max ants running a turn at the same time. */
  maxBusy: number
  /** Reap an idle `claude` process after this long. */
  idleMs: number
  defaultModel: string
  version: string
  /** Ports serving Ant itself (antd + web dev servers). Ants must never reach these. */
  selfPorts: number[]
}

export function loadConfig(env = process.env): Config {
  const dataDir = env.ANT_DATA_DIR ?? join(dataHome, 'ant')
  return {
    antHome: env.ANT_HOME ?? join(home, 'Ants'),
    dataDir,
    dbPath: env.ANT_DB ?? join(dataDir, 'ant.db'),
    socketPath: env.ANT_SOCKET ?? join(env.XDG_RUNTIME_DIR ?? dataDir, 'antd.sock'),
    port: Number(env.ANT_PORT ?? 7420),
    host: env.ANT_HOST ?? '127.0.0.1',
    claudeBin: env.ANT_CLAUDE_BIN ?? 'claude',
    maxBusy: Number(env.ANT_MAX_BUSY ?? 3),
    idleMs: Number(env.ANT_IDLE_MS ?? 10 * 60_000),
    defaultModel: env.ANT_MODEL ?? 'sonnet',
    version: '0.2.0',
    selfPorts: [...new Set([Number(env.ANT_PORT ?? 7420), ...(env.ANT_WEB_PORTS ?? '5173,5180,5181').split(',').map(Number)])].filter((n) => n > 0),
  }
}

export const antDataDir = (cfg: Config, antId: string) => join(cfg.dataDir, 'ants', antId)
