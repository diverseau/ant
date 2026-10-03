<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import type { ActivityView } from '@ant/shared'
  import { onMount } from 'svelte'
  import Ant from '../../lib/ant/Ant.svelte'
  import { api } from '../../lib/api'
  import { rise } from '../../lib/motion'
  import { antById, app, select, threadForAnt } from '../../lib/store.svelte'
  import Modal from '../../lib/ui/Modal.svelte'

  // Everything every ant is doing: working now, waiting on you, scheduled, and recent.
  let tab = $state<'now' | 'scheduled' | 'recent'>('now')
  const TABS = ['now', 'scheduled', 'recent'] as const
  let data = $state<ActivityView | null>(null)
  let now = $state(Date.now())

  async function load() {
    try {
      data = await api.activity()
    } catch {
      data = { working: [], waiting: [], recent: [] }
    }
  }

  onMount(() => {
    load()
    const t = setInterval(() => (now = Date.now()), 15_000)
    return () => clearInterval(t)
  })

  // Refresh when anything moves: turns starting/finishing, approvals, routines.
  $effect(() => {
    void Object.keys(app.typing).length
    void app.threads.reduce((n, t) => n + t.messages.length, 0)
    void app.routines.length
    load()
  })

  const scheduled = $derived(
    [...app.routines].filter((r) => r.enabled).sort((a, b) => (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity)),
  )

  function open(threadId: string | null, antId: string) {
    const id = threadId ?? threadForAnt(antId)?.id
    if (!id) return
    app.overlay = null
    select(id)
  }

  function ago(at: number) {
    const m = Math.round((now - at) / 60_000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.round(m / 60)
    return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
  }

  function until(at: number | null) {
    if (at === null) return 'Listening'
    const m = Math.round((at - now) / 60_000)
    if (m <= 0) return 'Due now'
    if (m < 60) return `in ${m}m`
    const h = Math.round(m / 60)
    return h < 24 ? `in ${h}h` : new Date(at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  }

  const SOURCE: Record<string, string> = { user: 'You asked', ant: 'Another ant asked', routine: 'Routine', webhook: 'Webhook', channel: 'From chat app', system: 'You asked' }
  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
</script>

<Modal onclose={() => (app.overlay = null)} width={680} label="Activity">
  <div class="head">
    <h2>Activity</h2>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'now'} onclick={() => (tab = 'now')}>
        Now{#if data && data.working.length + data.waiting.length}<span class="count">{data.working.length + data.waiting.length}</span>{/if}
      </button>
      <button role="tab" aria-selected={tab === 'scheduled'} onclick={() => (tab = 'scheduled')}>Scheduled</button>
      <button role="tab" aria-selected={tab === 'recent'} onclick={() => (tab = 'recent')}>Recent</button>
      <span class="tab-pill" style:transform="translateX({TABS.indexOf(tab) * 100}%)"></span>
    </div>
    <button class="icon-btn" aria-label="Close" onclick={() => (app.overlay = null)}><X size={16} /></button>
  </div>

  {#key tab}
    <div class="body" in:rise={{ y: 6, duration: 240 }}>
      {#if !data}
        <p class="empty">Loading…</p>
      {:else if tab === 'now'}
        {#if data.waiting.length}
          <h3>Waiting on you</h3>
          {#each data.waiting as w (w.messageId ?? w.createdAt)}
            {@const ant = antById(w.antId)}
            <button class="row" onclick={() => open(w.threadId, w.antId)}>
              {#if ant}<Ant color={ant.color} accessory={ant.accessory} size={26} status="attention" />{/if}
              <span class="main"><span class="title">{w.action}</span><span class="sub">{ant?.name} · {w.behaviour === 'handoff' ? 'Hand-off' : 'Approval'} · {ago(w.createdAt)}</span></span>
              <span class="pill attention">Needs you</span>
            </button>
          {/each}
        {/if}
        {#if data.working.length}
          <h3>Working</h3>
          {#each data.working as w (w.antId)}
            {@const ant = antById(w.antId)}
            <button class="row" onclick={() => open(w.threadId, w.antId)}>
              {#if ant}<Ant color={ant.color} accessory={ant.accessory} size={26} status="working" />{/if}
              <span class="main"><span class="title">{w.status ?? `${ant?.name} is working…`}</span><span class="sub">{ant?.name} · {SOURCE[w.source] ?? w.source} · started {ago(w.startedAt)}</span></span>
              <span class="pill working">Working</span>
            </button>
          {/each}
        {/if}
        {#if !data.waiting.length && !data.working.length}<p class="empty">All quiet. No ant is working or waiting on you.</p>{/if}
      {:else if tab === 'scheduled'}
        {#each scheduled as r (r.id)}
          {@const ant = antById(r.antId)}
          <button class="row" onclick={() => open(null, r.antId)}>
            {#if ant}<Ant color={ant.color} accessory={ant.accessory} size={26} />{/if}
            <span class="main"><span class="title">{r.name}</span><span class="sub">{ant?.name} · {r.when}</span></span>
            <span class="when">{r.trigger === 'webhook' ? 'On webhook' : r.trigger === 'event' && r.event?.source === 'slack' ? 'Listening' : r.trigger === 'event' || r.trigger === 'watch' ? 'Watching' : until(r.nextRunAt)}</span>
          </button>
        {:else}
          <p class="empty">No routines yet. Ask an ant to do something every morning, or when a page changes.</p>
        {/each}
      {:else}
        {#each data.recent as r (r.id)}
          {@const ant = antById(r.antId)}
          <button class="row" onclick={() => open(r.threadId, r.antId)}>
            {#if ant}<Ant color={ant.color} accessory={ant.accessory} size={26} />{/if}
            <span class="main">
              <span class="title">{r.routine ? `Routine: ${r.routine}` : SOURCE[r.trigger]}</span>
              <span class="sub">{ant?.name ?? 'Removed ant'} · {r.summary || (r.status === 'stopped' ? 'Stopped' : 'No reply')}</span>
            </span>
            <span class="meta">
              <span class="pill {r.status}">{r.status === 'succeeded' ? 'Done' : r.status === 'failed' ? 'Failed' : 'Stopped'}</span>
              <span class="when tabular">{ago(r.endedAt ?? r.startedAt)}{r.costUsd ? ` · ≈${money.format(r.costUsd)}` : ''}</span>
            </span>
          </button>
        {:else}
          <p class="empty">Nothing yet.</p>
        {/each}
      {/if}
    </div>
  {/key}
</Modal>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px 18px 12px 22px;
  }

  h2 {
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 1.35rem;
    margin-right: auto;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
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

  .count {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: var(--r-full);
    background: var(--accent);
    color: #141413;
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 12px 18px;
    min-height: 240px;
  }

  h3 {
    padding: 10px 10px 4px;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-faint);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 9px 10px;
    border-radius: var(--r-md);
    text-align: left;
    transition:
      background var(--dur-fast),
      transform var(--dur-fast) var(--ease-out);
  }

  .row:hover {
    background: var(--bg-hover);
  }

  .row:active {
    transform: scale(0.99);
  }

  .main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .title {
    font-size: var(--text-md);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .sub {
    font-size: var(--text-xs);
    color: var(--text-muted);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    flex: none;
  }

  .when {
    flex: none;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .pill {
    flex: none;
    padding: 2px 8px;
    border-radius: var(--r-full);
    font-size: 10.5px;
    font-weight: 500;
    background: var(--bg-active);
    color: var(--text-muted);
  }

  .pill.attention {
    background: var(--warn-soft);
    color: var(--warn);
  }

  .pill.working {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .pill.succeeded {
    color: var(--ok);
  }

  .pill.failed {
    color: #f4a69b;
  }

  .empty {
    padding: 40px 12px;
    text-align: center;
    font-size: var(--text-sm);
    color: var(--text-faint);
  }

  @media (max-width: 560px) {
    .head {
      flex-wrap: wrap;
    }
  }
</style>
