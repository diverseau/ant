<script lang="ts">
  import Ant from '../../lib/ant/Ant.svelte'
  import { api } from '../../lib/api'
  import { rise } from '../../lib/motion'
  import { init } from '../../lib/store.svelte'

  // Shown on a device antd doesn't know. A code from Settings → Devices on the computer Ant runs
  // on (or `npm run pair`) turns it into a paired device with its own session.

  function guessName() {
    const ua = navigator.userAgent
    const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : /Linux/.test(ua) ? 'Linux PC' : 'Device'
    const browser = /Firefox\//.test(ua) ? 'Firefox' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
    return /iPhone|iPad|Android/.test(ua) || !browser ? os : `${browser} on ${os}`
  }

  const fromLink = new URLSearchParams(location.search).get('pair') ?? ''
  let code = $state(format(fromLink))
  let name = $state(guessName())
  let busy = $state(false)
  let error = $state('')
  let shake = $state(0)
  let input: HTMLInputElement | undefined = $state()

  function format(v: string) {
    const c = v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8)
    return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
  }

  const ready = $derived(code.replace('-', '').length === 8 && !busy)

  async function submit() {
    if (!ready) return
    busy = true
    error = ''
    try {
      await api.pair(code, name.trim() || guessName())
      // Drop ?pair= from the address so a reload doesn't try the used code again.
      history.replaceState(null, '', location.pathname)
      await init()
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      shake++
      busy = false
      input?.focus()
    }
  }

  $effect(() => {
    if (fromLink && code.replace('-', '').length === 8) void submit()
    else input?.focus()
  })
</script>

<div class="screen">
  <form class="card" in:rise={{ y: 14, duration: 420 }} onsubmit={(e) => (e.preventDefault(), submit())}>
    <div class="mascot"><Ant color="coral" mode="full" size={96} status={busy ? 'working' : 'idle'} follow /></div>
    <h1>Pair this device</h1>
    <p class="lede">
      On the computer Ant runs on, open <b>Settings → Devices</b> and press <b>Pair a device</b>. Enter the code it shows. Each code lasts 10 minutes and works once.
    </p>

    {#key shake}
      <input
        bind:this={input}
        class="code"
        class:shake={shake > 0}
        value={code}
        oninput={(e) => (code = format(e.currentTarget.value))}
        placeholder="XXXX-XXXX"
        autocomplete="one-time-code"
        autocapitalize="characters"
        spellcheck="false"
        inputmode="text"
        aria-label="Pairing code"
        maxlength="9"
      />
    {/key}

    <label class="name">
      <span>Name this device</span>
      <input bind:value={name} maxlength="60" />
    </label>

    {#if error}<p class="error" role="alert" in:rise={{ y: 4, duration: 200 }}>{error}</p>{/if}

    <button class="btn btn-accent go" disabled={!ready}>{busy ? 'Pairing…' : 'Pair'}</button>
    <p class="note">Ant runs on your own computer. Paired devices can do everything you can, and you can remove them any time in Settings → Devices.</p>
  </form>
</div>

<style>
  .screen {
    display: grid;
    place-items: center;
    min-height: 100dvh;
    padding: 24px 16px;
    background: var(--bg-app);
  }

  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    width: 100%;
    max-width: 400px;
    text-align: center;
  }

  .mascot {
    margin-bottom: 4px;
  }

  h1 {
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 1.6rem;
  }

  .lede {
    font-family: var(--font-body);
    font-size: var(--text-md);
    line-height: 1.6;
    color: var(--text-muted);
  }

  .lede b {
    color: var(--text-soft);
    font-weight: 500;
  }

  .code {
    width: 100%;
    height: 60px;
    border-radius: var(--r-lg);
    border: 1px solid var(--border-strong);
    background: var(--bg-input);
    text-align: center;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 1.7rem;
    letter-spacing: 0.18em;
    transition:
      border-color var(--dur),
      box-shadow var(--dur);
  }

  .code:focus {
    border-color: var(--border-focus);
    box-shadow: 0 0 0 4px var(--accent-soft);
    outline: none;
  }

  .code::placeholder {
    color: var(--text-faint);
  }

  .shake {
    animation: shake 380ms var(--ease-out);
  }

  .name {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    text-align: left;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .name input {
    height: 40px;
    padding: 0 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--border);
    background: var(--bg-input);
    font-size: var(--text-md);
    color: var(--text);
  }

  .error {
    font-size: var(--text-sm);
    color: #f4a69b;
  }

  .go {
    width: 100%;
    height: 44px;
    justify-content: center;
    font-size: var(--text-md);
  }

  .note {
    font-size: var(--text-xs);
    line-height: 1.5;
    color: var(--text-faint);
  }

  @keyframes shake {
    20%,
    60% {
      transform: translateX(-8px);
    }
    40%,
    80% {
      transform: translateX(8px);
    }
  }
</style>
