<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy'
  import Laptop from '@lucide/svelte/icons/laptop'
  import Smartphone from '@lucide/svelte/icons/smartphone'
  import { encode } from 'uqr'
  import { onMount } from 'svelte'
  import { api, type DeviceView, type RemoteView } from '../../lib/api'
  import { rise } from '../../lib/motion'
  import { notify } from '../../lib/store.svelte'
  import Logo from '../../lib/ui/Logo.svelte'
  import { disablePush, enablePush, pushState, type PushState } from '../../lib/push'

  // Remote access (Tailscale), pairing new devices, and the paired-device list.
  type Pairing = { code: string; expiresAt: number; urls: string[] }
  let remote = $state<RemoteView | null>(null)
  let devices = $state<DeviceView[]>([])
  let trusted = $state(false)
  let busy = $state(false)
  let tsError = $state('')
  let pairing = $state<Pairing | null>(null)
  let now = $state(Date.now())
  let confirming = $state<string | null>(null)

  let push = $state<PushState | null>(null)
  let pushBusy = $state(false)

  async function togglePush() {
    pushBusy = true
    try {
      if (push === 'on') await disablePush()
      else {
        await enablePush()
        notify('Sent a test notification.')
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'warn')
    } finally {
      push = await pushState()
      pushBusy = false
    }
  }

  async function load() {
    pushState().then((p) => (push = p))
    const [r, d, s] = await Promise.all([api.remote(), api.devices(), api.authStatus()])
    remote = r
    devices = d
    trusted = s.trusted
  }

  onMount(() => {
    load().catch((e) => notify(e.message, 'error'))
    const t = setInterval(() => {
      now = Date.now()
      if (pairing && now > pairing.expiresAt) pairing = null
    }, 1000)
    // A phone pairing while the code is up shows up in the list straight away.
    const d = setInterval(() => pairing && api.devices().then((x) => (devices = x)).catch(() => {}), 3000)
    return () => {
      clearInterval(t)
      clearInterval(d)
    }
  })

  async function toggleTailscale(on: boolean) {
    busy = true
    tsError = ''
    try {
      remote = await api.setTailscale(on)
    } catch (e) {
      tsError = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }

  async function newCode() {
    try {
      pairing = await api.pairingCode()
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  async function remove(d: DeviceView) {
    await api.removeDevice(d.id).catch((e) => notify(e.message, 'error'))
    confirming = null
    devices = devices.filter((x) => x.id !== d.id)
  }

  const link = $derived(pairing?.urls[0] ? `${pairing.urls[0]}/?pair=${pairing.code.replace('-', '')}` : '')
  const qr = $derived(link ? encode(link, { ecc: 'M', border: 0 }) : null)
  const left = $derived(pairing ? Math.max(0, Math.ceil((pairing.expiresAt - now) / 1000)) : 0)

  function ago(at: number) {
    const m = Math.floor((now - at) / 60_000)
    if (m < 1) return 'active now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
  }

  const mobile = (ua: string) => /iPhone|iPad|Android|Mobile/.test(ua)
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => notify('Copied'))
</script>

<div class="body" in:rise={{ y: 6, duration: 260 }}>
  <section>
    <h3>Remote access</h3>
    {#if !remote}
      <p class="muted">Checking…</p>
    {:else if remote.tailscale.installed && remote.tailscale.running}
      <div class="row card">
        <Logo name="Tailscale" domain="tailscale.com" size={32} />
        <div class="grow">
          <div class="title">Tailscale {remote.tailscale.serving ? 'on' : 'off'}</div>
          <div class="sub">
            {#if remote.tailscale.serving && remote.tailscale.url}
              <a href={remote.tailscale.url} target="_blank" rel="noreferrer">{remote.tailscale.url.replace('https://', '')}</a>
              <button class="icon-btn tiny" aria-label="Copy address" onclick={() => copy(remote!.tailscale.url!)}><Copy size={12} /></button>
            {:else}
              Reach Ant from your phone over your tailnet, with https. Not on the public internet.
            {/if}
          </div>
        </div>
        {#if trusted}
          <button class="btn" class:btn-accent={!remote.tailscale.serving} class:btn-ghost={remote.tailscale.serving} disabled={busy} onclick={() => toggleTailscale(!remote!.tailscale.serving)}>
            {busy ? 'Working…' : remote.tailscale.serving ? 'Turn off' : 'Turn on'}
          </button>
        {/if}
      </div>
      {#if tsError}<p class="error" in:rise={{ y: 4, duration: 200 }}>{tsError}</p>{/if}
      <p class="hint">Install Tailscale on your phone and sign in to the same account, then pair it below.</p>
    {:else if remote.tailscale.installed}
      <p class="muted">Tailscale is installed but not connected. Run <code>tailscale up</code>, then come back.</p>
    {:else}
      <p class="muted">
        To use Ant from your phone, install <a href="https://tailscale.com/download" target="_blank" rel="noreferrer">Tailscale</a> on this computer and the phone. Or put Ant behind your own https proxy and add its name to <code>ANT_ALLOWED_HOSTS</code>.
      </p>
    {/if}
  </section>

  <section>
    <h3>Notifications on this device</h3>
    <div class="row card">
      <div class="grow">
        <div class="title">{push === 'on' ? 'On' : 'Off'}</div>
        <div class="sub">
          {#if push === 'needs-install'}On iPhone, tap Share → Add to Home Screen, open Ant from there, then turn this on.
          {:else if push === 'unsupported'}This browser can’t receive notifications here (it needs https: use the Tailscale address).
          {:else if push === 'denied'}Notifications are blocked for this site in the browser’s settings.
          {:else}When an ant needs you or replies while Ant isn’t open on any screen.{/if}
        </div>
      </div>
      {#if push === 'on' || push === 'off'}
        <button class="btn" class:btn-accent={push === 'off'} class:btn-ghost={push === 'on'} disabled={pushBusy} onclick={togglePush}>
          {pushBusy ? 'Working…' : push === 'on' ? 'Turn off' : 'Turn on'}
        </button>
      {/if}
    </div>
  </section>

  <section>
    <div class="head">
      <h3>Paired devices</h3>
      <button class="btn btn-ghost" onclick={newCode}>{pairing ? 'New code' : 'Pair a device'}</button>
    </div>

    {#if pairing}
      <div class="pair card" in:rise={{ y: 6, duration: 260 }}>
        {#if qr}
          <svg class="qr" viewBox="-2 -2 {qr.size + 4} {qr.size + 4}" role="img" aria-label="QR code for {link}">
            <rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} rx="2" fill="#fff" />
            {#each qr.data as row, y}{#each row as on, x}{#if on}<rect {x} {y} width="1.02" height="1.02" fill="#141413" />{/if}{/each}{/each}
          </svg>
        {/if}
        <div class="pair-text">
          <div class="code tabular">{pairing.code}</div>
          <p>
            {#if link}Scan with your phone's camera, or open <b>{pairing.urls[0].replace('https://', '')}</b> and enter the code.
            {:else}Open Ant on the other device and enter this code.{/if}
          </p>
          <p class="faint tabular">Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} · works once</p>
        </div>
      </div>
    {/if}

    {#each devices as d (d.id)}
      <div class="row device" in:rise={{ y: 4, duration: 220 }}>
        <span class="dev-icon">{#if mobile(d.userAgent)}<Smartphone size={16} />{:else}<Laptop size={16} />{/if}</span>
        <div class="grow">
          <div class="title">{d.name}{#if d.current}<span class="badge">This device</span>{/if}</div>
          <div class="sub">Paired {new Date(d.createdAt).toLocaleDateString()} · {ago(d.lastSeenAt)}</div>
        </div>
        {#if confirming === d.id}
          <button class="btn btn-ghost" onclick={() => (confirming = null)}>Keep</button>
          <button class="btn danger" onclick={() => remove(d)}>{d.current ? 'Log out' : 'Remove'}</button>
        {:else}
          <button class="btn btn-ghost" onclick={() => (confirming = d.id)}>{d.current ? 'Log out' : 'Remove'}</button>
        {/if}
      </div>
    {:else}
      {#if !pairing}<p class="muted">No other devices yet. This computer never needs pairing.</p>{/if}
    {/each}
  </section>
</div>

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 16px 22px 22px;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  h3 {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-soft);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .card {
    padding: 12px;
    border-radius: var(--r-lg);
    border: 1px solid var(--border);
    background: var(--bg-raised);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-md);
    font-weight: 500;
  }

  .sub {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
    font-size: var(--text-xs);
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub a,
  .muted a {
    color: var(--accent);
  }

  .tiny {
    width: 22px;
    height: 22px;
  }

  .muted,
  .hint {
    font-size: var(--text-sm);
    line-height: 1.55;
    color: var(--text-muted);
  }

  .hint {
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  code {
    font-size: 0.92em;
    color: var(--text-soft);
  }

  .error {
    font-size: var(--text-sm);
    color: #f4a69b;
  }

  .pair {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .qr {
    flex: none;
    width: 148px;
    height: 148px;
    border-radius: var(--r-md);
    shape-rendering: crispEdges;
  }

  .pair-text p {
    margin-top: 6px;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--text-muted);
  }

  .pair-text b {
    color: var(--text-soft);
    font-weight: 500;
    word-break: break-all;
  }

  .code {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 1.9rem;
    letter-spacing: 0.14em;
    color: var(--text);
  }

  .faint {
    font-size: var(--text-xs) !important;
    color: var(--text-faint) !important;
  }

  .device {
    padding: 8px 4px;
    border-bottom: 1px solid var(--border);
  }

  .dev-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--r-md);
    background: var(--bg-active);
    color: var(--text-muted);
  }

  .badge {
    padding: 1px 7px;
    border-radius: var(--r-full);
    background: var(--accent-soft);
    font-size: 0.625rem;
    font-weight: 500;
    color: var(--accent);
  }

  .danger {
    background: rgb(229 96 79 / 0.16);
    color: #f4a69b;
  }

  @media (max-width: 560px) {
    .pair {
      flex-direction: column;
      text-align: center;
    }
  }
</style>
