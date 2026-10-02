// Teach a task (plan §9): while the user drives the ant's browser, record what they do —
// pages, clicks (by visible label), typed text (never passwords), and screenshots — then hand
// the recording to the ant to turn into a skill. Grok Bot's "Teach a task", browser-only.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AntBrowser, InputEvent } from './browser.ts'

const MAX_MS = 10 * 60_000

interface Step {
  at: number
  kind: 'page' | 'click' | 'type' | 'key'
  text: string
  url: string
  shot?: string
}

export class TeachSession {
  readonly title: string
  readonly dir: string
  readonly startedAt = Date.now()
  private steps: Step[] = []
  private typing = ''
  private typingSecret = false
  private shots = 0
  private browser: AntBrowser

  constructor(browser: AntBrowser, dir: string, title: string) {
    this.browser = browser
    this.dir = dir
    this.title = title
    mkdirSync(join(dir, 'shots'), { recursive: true })
    void this.page(browser.state().url)
  }

  get expired() {
    return Date.now() - this.startedAt > MAX_MS
  }

  get count() {
    return this.steps.length
  }

  async page(url: string) {
    if (!url || url === 'about:blank') return
    const norm = (u: string) => u.replace(/\/$/, '')
    const last = this.steps.findLast((s) => s.kind === 'page')
    if (last && norm(last.url) === norm(url)) return
    this.flushTyping(url)
    this.steps.push({ at: Date.now(), kind: 'page', text: `Opened ${url}`, url, shot: await this.shot() })
  }

  async input(e: InputEvent) {
    const url = this.browser.state().url
    if (e.type === 'mouse' && e.action === 'mousePressed') {
      this.flushTyping(url)
      const d = await this.browser.describeAt(e.x, e.y)
      this.steps.push({ at: Date.now(), kind: 'click', text: `Clicked ${d?.label ?? 'the page'}`, url })
      setTimeout(() => void this.shotAfterClick(), 700)
    } else if (e.type === 'text' || (e.type === 'key' && e.action === 'keyDown' && e.text && e.text !== '\r')) {
      if (await this.browser.focusIsPassword()) this.typingSecret = true
      else this.typing += e.type === 'text' ? e.text : (e.text ?? '')
    } else if (e.type === 'key' && (e.action === 'rawKeyDown' || e.action === 'keyDown') && ['Enter', 'Tab', 'Escape'].includes(e.key)) {
      this.flushTyping(url)
      this.steps.push({ at: Date.now(), kind: 'key', text: `Pressed ${e.key}`, url })
    } else if (e.type === 'navigate') {
      await this.page(e.url)
    }
  }

  private flushTyping(url: string) {
    if (this.typingSecret) this.steps.push({ at: Date.now(), kind: 'type', text: 'Typed a password (not recorded)', url })
    else if (this.typing.trim()) this.steps.push({ at: Date.now(), kind: 'type', text: `Typed "${this.typing.slice(0, 200)}"`, url })
    this.typing = ''
    this.typingSecret = false
  }

  private async shotAfterClick() {
    const last = this.steps.at(-1)
    if (last && !last.shot) last.shot = await this.shot()
  }

  private async shot(): Promise<string | undefined> {
    if (this.shots >= 40) return undefined
    const data = await this.browser.screenshot()
    if (!data) return undefined
    const name = `shots/${String(++this.shots).padStart(2, '0')}.jpg`
    writeFileSync(join(this.dir, name), Buffer.from(data, 'base64'))
    return name
  }

  /** Write steps.md and return its path relative to the ant folder's teach dir. */
  finish(): string {
    this.flushTyping(this.browser.state().url)
    const lines = this.steps.map((s, i) => `${i + 1}. ${s.text}${s.kind !== 'page' ? `  _(on ${s.url})_` : ''}${s.shot ? `\n   ![step ${i + 1}](${s.shot})` : ''}`)
    const md = `# Demonstration: ${this.title}\n\nRecorded ${new Date(this.startedAt).toLocaleString()} · ${this.steps.length} steps · ${Math.round((Date.now() - this.startedAt) / 1000)}s\n\n${lines.join('\n')}\n`
    writeFileSync(join(this.dir, 'steps.md'), md)
    return md
  }
}
