<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import CircleAlert from '@lucide/svelte/icons/circle-alert'
  import Ant from '../../lib/ant/Ant.svelte'
  import { rise } from '../../lib/motion'
  import { app, saveSettings } from '../../lib/store.svelte'
  import Modal from '../../lib/ui/Modal.svelte'
  import Devices from './Devices.svelte'

  const close = () => (app.overlay = null)
  const s = $derived(app.settings)
  const h = $derived(app.health)

  const models = [
    { id: 'sonnet', label: 'Sonnet 5.5', note: 'Balanced. Good default.' },
    { id: 'opus', label: 'Opus 5.5', note: 'Strongest. Uses your limits fastest.' },
    { id: 'haiku', label: 'Haiku 4.5', note: 'Fastest and lightest. Good for routines.' },
  ]
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

  let tab: 'general' | 'devices' | 'health' = $state('general')
  const TABS = ['general', 'devices', 'health'] as const
  let name = $state(app.settings?.userName ?? '')

  const checks = $derived(
    h
      ? [
          { ok: h.claude.found, label: 'Claude Code installed', detail: h.claude.version ?? 'Install Claude Code' },
          { ok: h.claude.loggedIn, label: 'Signed in', detail: h.claude.loggedIn ? `${h.claude.authMethod}${h.claude.plan ? ` · ${h.claude.plan}` : ''}` : 'Run claude, then /login' },
          { ok: h.sandbox.ok, label: 'Sandbox', detail: h.sandbox.ok ? 'bubblewrap + socat' : `Missing ${h.sandbox.missing.join(', ')}` },
          { ok: h.computer?.chromium ?? false, label: 'Browser for ants', detail: h.computer?.chromium ? 'Chromium found' : 'Install chromium' },
        ]
      : [],
  )
</script>

<Modal onclose={close} width={620} label="Settings">
  <div class="head">
    <h2>Settings</h2>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'general'} onclick={() => (tab = 'general')}>General</button>
      <button role="tab" aria-selected={tab === 'devices'} onclick={() => (tab = 'devices')}>Devices</button>
      <button role="tab" aria-selected={tab === 'health'} onclick={() => (tab = 'health')}>Health</button>
      <span class="tab-pill" style:transform="translateX({TABS.indexOf(tab) * 100}%)"></span>
    </div>
  </div>

  {#if app.mode !== 'live' || !s}
    <p class="muted pad">Settings are available when antd is running.</p>
  {:else if tab === 'devices'}
    <Devices />
  {:else if tab === 'general'}
    <div class="body" in:rise={{ y: 6, duration: 260 }}>
      <label class="field">
        <span>Your name</span>
        <input
          bind:value={name}
          maxlength="40"
          onchange={() => name.trim() && name.trim() !== s.userName && saveSettings({ userName: name.trim() })}
        />
        <small>Ants address you by this name.</small>
      </label>

      <label class="field">
        <span>Time zone</span>
        <select value={s.timezone} onchange={(e) => saveSettings({ timezone: e.currentTarget.value })}>
          {#each zones.length ? zones : [s.timezone] as z}<option value={z}>{z.replace(/_/g, ' ')}</option>{/each}
        </select>
        <small>Used for routine schedules.</small>
      </label>

      <div class="field">
        <span>Default model for new ants</span>
        <div class="models" role="radiogroup" aria-label="Default model">
          {#each models as m}
            <button role="radio" aria-checked={s.defaultModel === m.id} class="model" onclick={() => saveSettings({ defaultModel: m.id })}>
              <strong>{m.label}</strong>
              <small>{m.note}</small>
              {#if s.defaultModel === m.id}<span class="tick" in:rise={{ y: 2, duration: 200 }}><Check size={13} strokeWidth={2.6} /></span>{/if}
            </button>
          {/each}
        </div>
        <small>Each ant can switch model, effort and permissions under its chat box.</small>
      </div>

      <div class="field">
        <span>Ants working at once</span>
        <div class="stepper">
          {#each [1, 2, 3, 4, 5] as n}
            <button class:on={s.maxBusy === n} onclick={() => saveSettings({ maxBusy: n })}>{n}</button>
          {/each}
        </div>
        <small>Others wait their turn. Lower numbers stretch your Claude usage limits further.</small>
      </div>

      <div class="field">
        <span>Where ants live</span>
        <code>{h?.antHome}</code>
      </div>
    </div>
  {:else}
    <div class="body" in:rise={{ y: 6, duration: 260 }}>
      <div class="health-hero">
        <Ant color={checks.every((c) => c.ok) ? 'green' : 'yellow'} mode="full" size={84} status={checks.every((c) => c.ok) ? 'idle' : 'attention'} />
        <p>{checks.every((c) => c.ok) ? 'Everything your ants need is in place.' : 'Some things need attention.'}</p>
      </div>
      <ul class="checks">
        {#each checks as c, i}
          <li style:--i={i}>
            <span class="mark" class:ok={c.ok}>{#if c.ok}<Check size={13} strokeWidth={2.6} />{:else}<CircleAlert size={13} />{/if}</span>
            <span class="label">{c.label}</span>
            <span class="detail">{c.detail}</span>
          </li>
        {/each}
      </ul>
      <p class="muted">Ant {h?.version}</p>
    </div>
  {/if}
</Modal>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 22px 6px;
  }

  h2 {
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 1.35rem;
  }

  .tabs {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 3px;
    border-radius: var(--r-md);
    background: var(--bg-input);
  }

  .tabs button {
    position: relative;
    z-index: 1;
    height: 28px;
    padding: 0 14px;
    font-size: var(--text-sm);
    color: var(--text-muted);
    transition: color var(--dur);
  }

  .tabs button[aria-selected='true'] {
    color: var(--text);
  }

  .tab-pill {
    position: absolute;
    top: 3px;
    left: 3px;
    width: calc(33.333% - 2px);
    height: 28px;
    border-radius: var(--r-sm);
    background: var(--bg-selected);
    transition: transform 340ms var(--ease-spring);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 14px 22px 24px;
  }

  .pad {
    padding: 20px 22px 26px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field > span {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-faint);
  }

  small,
  .muted {
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  input,
  select {
    height: 38px;
    padding: 0 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--border);
    background: var(--bg-input);
    font-size: var(--text-md);
    transition: border-color var(--dur-fast);
  }

  input:focus,
  select:focus {
    border-color: #4a4948;
  }

  code {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 12.5px;
    color: var(--text-soft);
  }

  .models {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .model {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 11px 12px;
    border-radius: var(--r-lg);
    border: 1px solid var(--border-strong);
    text-align: left;
    transition:
      border-color var(--dur) var(--ease-out),
      background var(--dur) var(--ease-out),
      transform var(--dur-fast) var(--ease-out);
  }

  .model:hover {
    background: var(--bg-hover);
  }

  .model:active {
    transform: scale(0.98);
  }

  .model[aria-checked='true'] {
    border-color: rgb(217 119 87 / 0.6);
    background: var(--accent-soft);
  }

  .model strong {
    font-size: var(--text-md);
    font-weight: 500;
  }

  .tick {
    position: absolute;
    top: 9px;
    right: 9px;
    display: grid;
    color: var(--accent);
  }

  .stepper {
    display: flex;
    gap: 6px;
  }

  .stepper button {
    width: 38px;
    height: 34px;
    border-radius: var(--r-md);
    border: 1px solid var(--border-strong);
    font-size: var(--text-md);
    color: var(--text-soft);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-fast) var(--ease-out);
  }

  .stepper button:active {
    transform: scale(0.92);
  }

  .stepper button.on {
    background: var(--text);
    border-color: var(--text);
    color: #141413;
  }

  .health-hero {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .health-hero p {
    font-family: var(--font-body);
    font-size: 1.05rem;
  }

  .checks {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .checks li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-top: 1px solid var(--border);
    font-size: var(--text-sm);
    animation: item 380ms calc(var(--i) * 70ms) var(--ease-out) both;
  }

  .mark {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--warn-soft);
    color: var(--warn);
  }

  .mark.ok {
    background: rgb(66 194 142 / 0.14);
    color: var(--ok);
  }

  .label {
    font-weight: 500;
  }

  .detail {
    margin-left: auto;
    color: var(--text-muted);
  }

  @keyframes item {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
</style>
