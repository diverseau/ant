// Per-ant computers (plan §7) and the take-over lease: who drives the browser right now.
import type { ComputerState } from '@ant/shared'
import { join } from 'node:path'
import { AntBrowser, type Frame, type InputEvent } from './browser.ts'

const IDLE_MS = 15 * 60_000

export class ComputerManager {
  private browsers = new Map<string, AntBrowser>()
  private leases = new Map<string, 'ant' | 'user'>()
  private onState: (s: ComputerState) => void
  private sweeper: NodeJS.Timeout
  private blockedPorts: number[]

  constructor(onState: (s: ComputerState) => void, blockedPorts: number[] = []) {
    this.onState = onState
    this.blockedPorts = blockedPorts
    this.sweeper = setInterval(() => this.stopIdle(), 60_000)
  }

  private get(antId: string, folder: string, port: number): AntBrowser {
    let b = this.browsers.get(antId)
    if (!b) {
      b = new AntBrowser(join(folder, 'browser'), port, this.blockedPorts)
      this.browsers.set(antId, b)
    }
    return b
  }

  async ensure(antId: string, folder: string, port: number) {
    const b = this.get(antId, folder, port)
    const was = b.running
    await b.start()
    if (!was) this.publish(antId)
    return b
  }

  lease(antId: string): 'ant' | 'user' {
    return this.leases.get(antId) ?? 'ant'
  }

  setLease(antId: string, holder: 'ant' | 'user') {
    this.leases.set(antId, holder)
    this.publish(antId)
  }

  state(antId: string): ComputerState {
    const b = this.browsers.get(antId)
    const page = b?.running ? b.state() : null
    return { antId, running: !!b?.running, url: page?.url ?? null, title: page?.title ?? null, lease: this.lease(antId) }
  }

  private publish(antId: string) {
    this.onState(this.state(antId))
  }

  async watch(antId: string, folder: string, port: number, onFrame: (f: Frame) => void): Promise<() => void> {
    const b = await this.ensure(antId, folder, port)
    return b.watch({ frame: onFrame, state: () => this.publish(antId) })
  }

  async input(antId: string, e: InputEvent) {
    if (this.lease(antId) !== 'user') return
    await this.browsers.get(antId)?.input(e)
  }

  async thumbnail(antId: string): Promise<string | null> {
    const b = this.browsers.get(antId)
    return b?.running ? b.screenshot() : null
  }

  stop(antId: string) {
    this.browsers.get(antId)?.stop()
    this.browsers.delete(antId)
    this.leases.delete(antId)
    this.publish(antId)
  }

  private stopIdle() {
    const now = Date.now()
    for (const [antId, b] of this.browsers) {
      if (this.lease(antId) === 'user') continue
      if (now - b.lastActive > IDLE_MS) this.stop(antId)
    }
  }

  shutdown() {
    clearInterval(this.sweeper)
    for (const id of [...this.browsers.keys()]) this.stop(id)
  }
}
