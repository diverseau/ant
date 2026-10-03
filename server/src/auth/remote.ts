// Remote access over Tailscale: `tailscale serve` gives antd an https address on your tailnet
// only (not the public internet). Ant uses port 8443 so an existing serve on 443 is untouched.
import { execFile, execFileSync } from 'node:child_process'
import * as R from '../db/repos/index.ts'
import type { AntService } from '../service.ts'
import type { Auth } from './auth.ts'

export const TS_PORT = 8443
const bin = () => process.env.ANT_TAILSCALE_BIN || 'tailscale'

interface TailscaleInfo {
  installed: boolean
  running: boolean
  dnsName?: string
  serving: boolean
  url?: string
}

let cache: { at: number; value: TailscaleInfo } | null = null

export function tailscaleInfo(port: number, fresh = false): TailscaleInfo {
  if (!fresh && cache && Date.now() - cache.at < 10_000) return cache.value
  let value: TailscaleInfo = { installed: false, running: false, serving: false }
  try {
    const st = JSON.parse(execFileSync(bin(), ['status', '--json'], { encoding: 'utf8', timeout: 4000 })) as { BackendState?: string; Self?: { DNSName?: string } }
    const dnsName = st.Self?.DNSName?.replace(/\.$/, '') || undefined
    value = { installed: true, running: st.BackendState === 'Running', dnsName, serving: false }
    if (dnsName) {
      const serve = JSON.parse(execFileSync(bin(), ['serve', 'status', '--json'], { encoding: 'utf8', timeout: 4000 }) || '{}') as {
        Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>
      }
      const proxy = serve.Web?.[`${dnsName}:${TS_PORT}`]?.Handlers?.['/']?.Proxy ?? ''
      value.serving = new RegExp(`:${port}/?$`).test(proxy)
      if (value.serving) value.url = `https://${dnsName}:${TS_PORT}`
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') value.installed = true
  }
  cache = { at: Date.now(), value }
  return value
}

export function remoteStatus(svc: AntService, auth: Auth) {
  const tailscale = tailscaleInfo(svc.cfg.port)
  const urls = [process.env.ANT_PUBLIC_URL, tailscale.url].filter((u): u is string => !!u)
  return { hosts: auth.allowedHosts(), urls: [...new Set(urls)], tailscale, devices: R.listDevices(svc.db).length }
}

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile(bin(), args, { timeout: 20_000 }, (err, _out, stderr) => {
      if (!err) return resolve()
      const msg = String(stderr || err.message)
      reject(
        new Error(
          /access denied|permission|operator/i.test(msg)
            ? 'Tailscale needs permission once: run `sudo tailscale set --operator=$USER` in a terminal, then try again.'
            : msg.trim().split('\n').at(-1) || 'tailscale failed',
        ),
      )
    }),
  )
}

export async function setTailscale(svc: AntService, enabled: boolean): Promise<void> {
  const info = tailscaleInfo(svc.cfg.port, true)
  if (!info.installed) throw new Error('Tailscale isn’t installed on this computer.')
  if (!info.running || !info.dnsName) throw new Error('Tailscale isn’t connected. Run `tailscale up` first.')
  const hosts = R.getSetting<string[]>(svc.db, 'remote.hosts', [])
  if (enabled) {
    // Allow the name before traffic can arrive under it.
    R.setSetting(svc.db, 'remote.hosts', [...new Set([...hosts, info.dnsName])])
    await run(['serve', '--bg', `--https=${TS_PORT}`, `http://127.0.0.1:${svc.cfg.port}`])
  } else {
    await run(['serve', `--https=${TS_PORT}`, 'off'])
    R.setSetting(svc.db, 'remote.hosts', hosts.filter((h) => h !== info.dnsName))
  }
  cache = null
}
