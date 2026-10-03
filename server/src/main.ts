// antd: the Ant daemon.
import { execFileSync } from 'node:child_process'
import { dictationAvailable } from './dictation/transcribe.ts'
import { mkdirSync } from 'node:fs'
import type { Health } from '@ant/shared'
import { startHttp } from './api/http.ts'
import { Broker } from './broker.ts'
import { loadConfig } from './config.ts'
import { openDb } from './db/index.ts'
import { Auth } from './auth/auth.ts'
import * as R from './db/repos/index.ts'
import { IpcServer } from './ipc.ts'
import { Scheduler } from './scheduler/runtime.ts'
import { AntService } from './service.ts'
import { Registry } from './connectors/registry.ts'
import { Vault } from './secrets/vault.ts'
import { ChannelHub } from './channels/hub.ts'
import type { ChannelAdapter, ChannelKind } from './channels/types.ts'
import { registerTools } from './tools.ts'

const cfg = loadConfig()
mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 })
mkdirSync(cfg.antHome, { recursive: true })

const db = openDb(cfg.dbPath)
const ipc = new IpcServer(cfg.socketPath)
const svc = new AntService(db, cfg, ipc)
const vault = new Vault(cfg.dataDir)
svc.registry = new Registry(db, vault)
const broker = new Broker(svc)
const scheduler = new Scheduler(svc)
svc.routineViews = () => scheduler.list()
const channels = new ChannelHub(
  svc,
  async (kind: ChannelKind, token: string): Promise<ChannelAdapter> => {
    const mod = await import(`./channels/${kind}.ts`)
    return mod.createAdapter(token)
  },
  (name) => svc.registry!.secretValue(name),
)
registerTools(svc, broker, scheduler)

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
  let plan: string | undefined
  try {
    version = execFileSync(cfg.claudeBin, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim().split(' ')[0]
    // Reads only the method and status, never credentials.
    const status = JSON.parse(execFileSync(cfg.claudeBin, ['auth', 'status'], { encoding: 'utf8', timeout: 10_000 }))
    loggedIn = !!status.loggedIn
    authMethod = status.authMethod
    plan = typeof status.subscriptionType === 'string' ? status.subscriptionType : undefined
  } catch {
    // claude missing or not signed in
  }
  const missing = ['bwrap', 'socat'].filter((b) => !which(b))
  const value: Health = {
    claude: { found: !!version, version, loggedIn, authMethod, plan },
    sandbox: { ok: missing.length === 0, missing },
    computer: { chromium: ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome'].some(which) },
    dictation: dictationAvailable(),
    antHome: cfg.antHome,
    version: cfg.version,
  }
  healthCache = { at: Date.now(), value }
  return value
}

await ipc.listen()
const server = startHttp(svc, broker, scheduler, channels, health)
void channels.startAll()
console.log(`antd ${cfg.version} on http://${cfg.host}:${cfg.port} · ants in ${cfg.antHome}`)
// Reachable from other machines (Docker, a home server) with nothing paired yet: print a
// first pairing code, since there may be no browser on this machine to make one.
if (!['127.0.0.1', 'localhost', '::1'].includes(cfg.host) && !R.listDevices(db).length) {
  const { code } = new Auth(db).newPairingCode()
  console.log(`Pair your first device: open Ant on it and enter ${code} (valid 10 minutes). New code any time: npm run pair`)
}

function shutdown() {
  void channels.shutdown()
  scheduler.shutdown()
  svc.shutdown()
  broker.shutdown()
  ipc.close()
  server.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
