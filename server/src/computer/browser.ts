// One persistent Chromium per ant, shared by the ant (playwright-mcp over CDP) and the
// user (live screencast + input on take-over). Same rule as Hermes' Bot Desktop: agent and
// human must drive THE SAME browser and profile, or a login the human makes is invisible to
// the ant (hermes-agent tools/bot_desktop/browser.py @ 54bc5e50, MIT).
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export interface Frame {
  data: string // base64 jpeg
  width: number
  height: number
}

export interface PageState {
  url: string
  title: string
}

type Listener = { frame: (f: Frame) => void; state: (s: PageState) => void }

const CHROME_CANDIDATES = ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome']

export class AntBrowser {
  readonly profileDir: string
  private chrome: ChildProcess | null = null
  private ws: WebSocket | null = null
  private seq = 0
  private calls = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private pages = new Map<string, { url: string; title: string; touched: number }>()
  private session: { targetId: string; sessionId: string } | null = null
  private listeners = new Set<Listener>()
  private size = { width: 1280, height: 800 }
  private starting: Promise<void> | null = null
  readonly port: number
  /** Ant's own ports: every request to them is failed, from any tab or client. */
  private blockedPorts: number[]
  lastActive = Date.now()

  constructor(profileDir: string, port: number, blockedPorts: number[] = []) {
    this.profileDir = profileDir
    this.port = port
    this.blockedPorts = blockedPorts
  }

  get running() {
    return !!this.chrome && this.chrome.exitCode === null && !!this.ws
  }

  get cdpEndpoint() {
    return `http://127.0.0.1:${this.port}`
  }

  /** Start Chromium if needed and connect to it. Safe to call concurrently. */
  start(): Promise<void> {
    if (this.running) return Promise.resolve()
    this.starting ??= this.launch().finally(() => (this.starting = null))
    return this.starting
  }

  private async launch() {
    mkdirSync(this.profileDir, { recursive: true })
    // A crashed Chromium leaves singleton locks that block the next launch.
    for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) rmSync(join(this.profileDir, f), { force: true })
    const bin = CHROME_CANDIDATES.find(whichSync)
    if (!bin) throw new Error('No Chromium or Chrome found. Install chromium to give ants a browser.')
    this.chrome = spawn(
      bin,
      [
        '--headless=new',
        '--remote-debugging-address=127.0.0.1',
        `--remote-debugging-port=${this.port}`,
        `--user-data-dir=${this.profileDir}`,
        `--window-size=${this.size.width},${this.size.height}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--password-store=basic',
        '--disable-features=Translate,MediaRouter',
        '--hide-scrollbars',
        // In the Ant container Chromium can't create its own sandbox; the container is the boundary.
        ...(process.env.ANT_IN_CONTAINER === '1' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
        'about:blank',
      ],
      { stdio: 'ignore', detached: false },
    )
    this.chrome.on('exit', () => this.teardown())
    // Wait for the DevTools HTTP endpoint (the port file isn't written for fixed ports on some builds).
    let up = false
    for (let i = 0; i < 100 && !up; i++) {
      up = await fetch(`${this.cdpEndpoint}/json/version`).then((r) => r.ok, () => false)
      if (!up) await sleep(100)
    }
    if (!up) throw new Error('Chromium did not start')
    const version = (await (await fetch(`${this.cdpEndpoint}/json/version`)).json()) as { webSocketDebuggerUrl: string }
    await this.connect(version.webSocketDebuggerUrl)
    await this.blockSelf()
    await this.send('Target.setDiscoverTargets', { discover: true })
    const { targetInfos } = await this.send('Target.getTargets')
    for (const t of targetInfos) if (t.type === 'page') this.pages.set(t.targetId, { url: t.url, title: t.title, touched: Date.now() })
    await this.follow()
  }

  /**
   * The ant's browser runs outside the sandbox, so it could open the Ant UI or API and approve
   * its own requests. Browser-level Fetch interception covers every target and every CDP client
   * (incl. playwright-mcp); per-page Network.setBlockedURLs does not.
   */
  private async blockSelf() {
    if (!this.blockedPorts.length) return
    const { sessionId } = await this.send('Target.attachToBrowserTarget')
    this.browserSession = sessionId
    const hosts = ['127.0.0.1', 'localhost', '0.0.0.0', '[::1]', '*.localhost']
    const patterns = this.blockedPorts.flatMap((p) => hosts.map((h) => ({ urlPattern: `*://${h}:${p}/*` })))
    await this.send('Fetch.enable', { patterns }, sessionId)
  }

  private browserSession: string | null = null

  private connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.onopen = () => {
        this.ws = ws
        resolve()
      }
      ws.onerror = () => reject(new Error('CDP connection failed'))
      ws.onclose = () => this.teardown()
      ws.onmessage = (m) => this.onMessage(JSON.parse(String(m.data)))
    })
  }

  private send(method: string, params: object = {}, sessionId?: string): Promise<any> {
    const ws = this.ws
    if (!ws) return Promise.reject(new Error('browser not running'))
    const id = ++this.seq
    ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }))
    return new Promise((resolve, reject) => this.calls.set(id, { resolve, reject }))
  }

  private onMessage(m: any) {
    if (m.id) {
      const call = this.calls.get(m.id)
      this.calls.delete(m.id)
      if (m.error) call?.reject(new Error(m.error.message))
      else call?.resolve(m.result)
      return
    }
    switch (m.method) {
      case 'Fetch.requestPaused':
        void this.send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }, m.sessionId).catch(() => {})
        break
      case 'Target.targetCreated':
      case 'Target.targetInfoChanged': {
        const t = m.params.targetInfo
        if (t.type !== 'page') break
        const prev = this.pages.get(t.targetId)
        this.pages.set(t.targetId, { url: t.url, title: t.title, touched: prev && prev.url === t.url ? prev.touched : Date.now() })
        if (this.session?.targetId === t.targetId) this.emitState()
        else if (!prev || prev.url !== t.url) void this.follow()
        break
      }
      case 'Target.targetDestroyed':
        this.pages.delete(m.params.targetId)
        if (this.session?.targetId === m.params.targetId) {
          this.session = null
          void this.follow()
        }
        break
      case 'Page.screencastFrame': {
        const { data, metadata, sessionId } = m.params
        this.lastActive = Date.now()
        void this.send('Page.screencastFrameAck', { sessionId }, m.sessionId).catch(() => {})
        const frame = { data, width: Math.round(metadata.deviceWidth), height: Math.round(metadata.deviceHeight) }
        for (const l of this.listeners) l.frame(frame)
        break
      }
    }
  }

  /** Watch the page the ant touched most recently. */
  private async follow() {
    const latest = [...this.pages.entries()].filter(([, p]) => !p.url.startsWith('devtools://')).sort((a, b) => b[1].touched - a[1].touched)[0]
    if (!latest || latest[0] === this.session?.targetId) return
    const old = this.session
    const { sessionId } = await this.send('Target.attachToTarget', { targetId: latest[0], flatten: true })
    this.session = { targetId: latest[0], sessionId }
    if (old) void this.send('Target.detachFromTarget', { sessionId: old.sessionId }).catch(() => {})
    await this.send('Page.enable', {}, sessionId)
    if (this.listeners.size) await this.startScreencast()
    this.emitState()
  }

  private async startScreencast() {
    if (!this.session) return
    await this.send(
      'Page.startScreencast',
      { format: 'jpeg', quality: 70, maxWidth: this.size.width, maxHeight: this.size.height, everyNthFrame: 1 },
      this.session.sessionId,
    ).catch(() => {})
  }

  private emitState() {
    const p = this.session ? this.pages.get(this.session.targetId) : undefined
    const s = { url: p?.url ?? 'about:blank', title: p?.title ?? '' }
    for (const l of this.listeners) l.state(s)
  }

  state(): PageState {
    const p = this.session ? this.pages.get(this.session.targetId) : undefined
    return { url: p?.url ?? 'about:blank', title: p?.title ?? '' }
  }

  /** Subscribe to frames; the screencast runs only while someone watches. */
  async watch(l: Listener): Promise<() => void> {
    await this.start()
    this.listeners.add(l)
    if (this.listeners.size === 1) await this.startScreencast()
    l.state(this.state())
    // The screencast only sends frames on repaint; give a new viewer the current picture now.
    const now = await this.screenshot()
    if (now) l.frame({ data: now, width: this.size.width, height: this.size.height })
    return () => {
      this.listeners.delete(l)
      if (!this.listeners.size && this.session) void this.send('Page.stopScreencast', {}, this.session.sessionId).catch(() => {})
    }
  }

  /** User input during take-over. Coordinates are 0..1 of the frame. */
  async input(e: InputEvent) {
    if (!this.session) return
    this.lastActive = Date.now()
    const sid = this.session.sessionId
    const x = (e as { x?: number }).x ?? 0
    const y = (e as { y?: number }).y ?? 0
    const px = { x: Math.round(x * this.size.width), y: Math.round(y * this.size.height) }
    switch (e.type) {
      case 'mouse':
        await this.send('Input.dispatchMouseEvent', { type: e.action, ...px, button: e.button ?? 'left', buttons: e.action === 'mouseMoved' ? 0 : 1, clickCount: e.clickCount ?? 1 }, sid)
        break
      case 'wheel':
        await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...px, deltaX: e.dx, deltaY: e.dy }, sid)
        break
      case 'key':
        await this.send('Input.dispatchKeyEvent', { type: e.action, key: e.key, code: e.code, windowsVirtualKeyCode: e.keyCode, modifiers: e.modifiers ?? 0, ...(e.text && { text: e.text }) }, sid)
        break
      case 'text':
        await this.send('Input.insertText', { text: e.text }, sid)
        break
      case 'navigate':
        await this.send('Page.navigate', { url: /^\w+:/.test(e.url) ? e.url : `https://${e.url}` }, sid)
        break
      case 'back':
        await this.send('Runtime.evaluate', { expression: 'history.back()' }, sid)
        break
    }
  }

  /** What's under a point, for teach-by-demonstration notes. Never reads input values. */
  async describeAt(x: number, y: number): Promise<{ label: string; password: boolean } | null> {
    if (!this.session) return null
    const px = Math.round(x * this.size.width)
    const py = Math.round(y * this.size.height)
    const expression = `(() => {
      const el = document.elementFromPoint(${px}, ${py}); if (!el) return null
      const t = el.closest('button,a,input,select,textarea,label,[role],summary') || el
      const text = (t.getAttribute('aria-label') || t.getAttribute('title') || t.getAttribute('placeholder') || t.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 80)
      const role = t.getAttribute('role') || t.tagName.toLowerCase()
      return { label: (text ? '"' + text + '" ' : '') + role, password: t.type === 'password' }
    })()`
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true }, this.session.sessionId).catch(() => null)
    return r?.result?.value ?? null
  }

  /** True when the focused element is a password field (teach mode must not record it). */
  async focusIsPassword(): Promise<boolean> {
    if (!this.session) return false
    const r = await this.send('Runtime.evaluate', { expression: 'document.activeElement?.type === "password"', returnByValue: true }, this.session.sessionId).catch(() => null)
    return r?.result?.value === true
  }

  async screenshot(): Promise<string | null> {
    if (!this.session) return null
    const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 60 }, this.session.sessionId).catch(() => null)
    return r?.data ?? null
  }

  private teardown() {
    this.ws = null
    this.session = null
    for (const c of this.calls.values()) c.reject(new Error('browser closed'))
    this.calls.clear()
  }

  stop() {
    this.ws?.close()
    this.chrome?.kill('SIGTERM')
    this.chrome = null
    this.teardown()
  }
}

export type InputEvent =
  | { type: 'mouse'; action: 'mousePressed' | 'mouseReleased' | 'mouseMoved'; x: number; y: number; button?: 'left' | 'right' | 'middle'; clickCount?: number }
  | { type: 'wheel'; x: number; y: number; dx: number; dy: number }
  | { type: 'key'; action: 'keyDown' | 'keyUp' | 'rawKeyDown' | 'char'; key: string; code: string; keyCode?: number; modifiers?: number; text?: string }
  | { type: 'text'; text: string }
  | { type: 'navigate'; url: string }
  | { type: 'back' }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function whichSync(bin: string): boolean {
  const path = process.env.PATH ?? ''
  return path.split(':').some((d) => d && existsSync(join(d, bin)))
}
