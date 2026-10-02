// antd: the Ant daemon.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import type { Health } from '@ant/shared'
import { startHttp } from './api/http.ts'
import { Broker } from './broker.ts'
import { loadConfig } from './config.ts'
import { openDb } from './db/index.ts'
import { IpcServer } from './ipc.ts'
import { AntService } from './service.ts'
import { registerTools } from './tools.ts'

const cfg = loadConfig()
mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 })
mkdirSync(cfg.antHome, { recursive: true })

const db = openDb(cfg.dbPath)
const ipc = new IpcServer(cfg.socketPath)
const svc = new AntService(db, cfg, ipc)
const broker = new Broker(svc)
registerTools(svc, broker)

function which(bin: string): boolean {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

let healthCache: { at: number; value: Health } | null = null
function health(): Health {
  if (healthCache && Date.now() - healthCache.at < 30_000) return healthCache.value
  let version: string | undefined
  let loggedIn = false
  let authMethod: string | undefined
  try {
    version = execFileSync(cfg.claudeBin, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim().split(' ')[0]
    // Reads only the method and status, never credentials.
    const status = JSON.parse(execFileSync(cfg.claudeBin, ['auth', 'status'], { encoding: 'utf8', timeout: 10_000 }))
    loggedIn = !!status.loggedIn
    authMethod = status.authMethod
  } catch {
    // claude missing or not signed in
  }
  const missing = ['bwrap', 'socat'].filter((b) => !which(b))
  const value: Health = {
    claude: { found: !!version, version, loggedIn, authMethod },
    sandbox: { ok: missing.length === 0, missing },
    antHome: cfg.antHome,
    version: cfg.version,
  }
  healthCache = { at: Date.now(), value }
  return value
}

await ipc.listen()
const server = startHttp(svc, broker, health)
console.log(`antd ${cfg.version} on http://${cfg.host}:${cfg.port} · ants in ${cfg.antHome}`)

function shutdown() {
  svc.shutdown()
  broker.shutdown()
  ipc.close()
  server.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
