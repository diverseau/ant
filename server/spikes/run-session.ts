// Spike: drive one long-lived `claude -p` stream-json session from a script of steps.
// Usage: node run-session.ts <antDir> <script.json>
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const [antDir, scriptPath] = process.argv.slice(2)
const steps: any[] = JSON.parse(readFileSync(scriptPath, 'utf8'))
const out: any[] = []
const mcp = { mcpServers: { ant: { command: 'node', args: [new URL('./perm-mcp.ts', import.meta.url).pathname], env: { SPIKE_LOG: `${antDir}/perm.log` } } } }
writeFileSync(`${antDir}/mcp.json`, JSON.stringify(mcp))

const args = [
  '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
  '--include-partial-messages', '--model', 'haiku',
  '--mcp-config', `${antDir}/mcp.json`, '--strict-mcp-config',
  '--permission-prompt-tool', 'mcp__ant__permission',
  ...(process.env.EXTRA_ARGS ? JSON.parse(process.env.EXTRA_ARGS) : []),
]
const child = spawn('claude', args, { cwd: antDir, stdio: ['pipe', 'pipe', 'pipe'] })
const t0 = Date.now()
const rl = createInterface({ input: child.stdout })
let results = 0
const waiters: Array<() => void> = []
rl.on('line', (line) => {
  let m: any
  try { m = JSON.parse(line) } catch { out.push({ raw: line }); return }
  out.push({ t: Date.now() - t0, ...m })
  if (m.type === 'result') { results++; waiters.splice(0).forEach((w) => w()) }
})
child.stderr.on('data', (d) => out.push({ t: Date.now() - t0, stderr: String(d) }))

const send = (o: any) => child.stdin.write(JSON.stringify(o) + '\n')
const user = (text: string) => send({ type: 'user', message: { role: 'user', content: text } })
const nextResult = () => new Promise<void>((r) => waiters.push(r))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

for (const s of steps) {
  out.push({ t: Date.now() - t0, step: s })
  if (s.user) user(s.user)
  if (s.raw) send(s.raw)
  if (s.wait === 'result') await Promise.race([nextResult(), sleep(s.timeout ?? 120000)])
  if (typeof s.wait === 'number') await sleep(s.wait)
}
child.stdin.end()
await new Promise((r) => child.on('exit', (code, sig) => { out.push({ t: Date.now() - t0, exit: code, sig }); r(null) }))
writeFileSync(`${antDir}/out.json`, JSON.stringify(out, null, 1))
console.log('results:', results, 'lines:', out.length)
