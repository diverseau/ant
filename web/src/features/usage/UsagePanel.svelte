<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import { onMount } from 'svelte'
  import Ant from '../../lib/ant/Ant.svelte'
  import { app, antById } from '../../lib/store.svelte'
  import Modal from '../../lib/ui/Modal.svelte'

  interface DailyUsage {
    date: string
    antId: string
    costUsd: number
    tokens: number
    runs: number
  }

  let days: DailyUsage[] | null = $state(null)
  let error = $state(false)
  let retry = $state(0)
  let period: 'today' | 'week' = $state('today')
  let now = $state(Date.now())
  const numbers = new Intl.NumberFormat()
  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })
  // The API aggregates runs by UTC date; local dates cannot recover those boundaries.
  const today = $derived(new Date(now).toISOString().slice(0, 10))
  const from = $derived(period === 'today' ? today : new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 864e5).toISOString().slice(0, 10))
  const windows = $derived([
    { label: '5-hour window', window: app.usage?.fiveHour, weekly: false },
    { label: 'Weekly', window: app.usage?.sevenDay, weekly: true },
  ])
  const rows = $derived.by(() => {
    const totals = new Map<string, Omit<DailyUsage, 'date'>>()
    for (const day of days ?? []) {
      if (day.date < from || day.date > today) continue
      const total = totals.get(day.antId) ?? { antId: day.antId, costUsd: 0, tokens: 0, runs: 0 }
      total.costUsd += day.costUsd
      total.tokens += day.tokens
      total.runs += day.runs
      totals.set(day.antId, total)
    }
    return [...totals.values()].map((row) => ({ ...row, ant: antById(row.antId) }))
      .sort((a, b) => b.costUsd - a.costUsd || a.antId.localeCompare(b.antId))
  })

  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 60_000)
    return () => clearInterval(timer)
  })

  $effect(() => {
    void app.usage?.updatedAt
    void today
    void retry
    if (app.mode === 'demo') return
    const controller = new AbortController()
    error = false
    async function load() {
      try {
        const response = await fetch('/api/usage', { signal: controller.signal })
        if (!response.ok) throw new Error('Usage unavailable')
        const data = await response.json() as { days: DailyUsage[] }
        if (!Array.isArray(data.days)) throw new Error('Usage unavailable')
        if (!controller.signal.aborted) days = data.days
      } catch {
        if (!controller.signal.aborted) error = true
      }
    }
    void load()
    return () => controller.abort()
  })

  function utilization(value: number) {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  }

  function resetTime(at: number, weekly: boolean) {
    const date = new Date(at)
    if (!Number.isFinite(date.getTime())) return 'unavailable'
    const minutes = Math.max(0, Math.ceil((at - now) / 60_000))
    const hours = Math.floor(minutes / 60)
    const remaining = minutes % 60
    const relative = minutes === 0 ? 'reset due' : hours >= 24
      ? `in ${numbers.format(Math.floor(hours / 24))}d ${numbers.format(hours % 24)}h`
      : `in ${hours ? `${numbers.format(hours)}h ` : ''}${numbers.format(remaining)}m`
    const clock = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    return `${relative} · ${weekly ? `${date.toLocaleDateString(undefined, { weekday: 'short' })}, ` : ''}${clock}`
  }
</script>

<Modal onclose={() => (app.overlay = null)} width={640} label="Claude subscription usage">
  <div class="head">
    <h2>Claude subscription usage</h2>
    <button class="icon-btn" aria-label="Close usage" onclick={() => (app.overlay = null)}><X size={18} /></button>
  </div>
  <p class="lede">Ants use your Claude subscription. These numbers come from Claude Code.</p>

  <div class="windows tabular">
    {#if app.usage === null}
      <p class="empty">Usage appears after your first ant runs.</p>
    {:else}
      {#each windows as item (item.label)}
        {@const value = item.window ? utilization(item.window.utilization) : 0}
        <div class="window" class:warn={value >= 0.75} class:danger={value >= 0.9}>
          <p class="window-label">
            <span>{item.label}</span>
            {#if item.window}
              <span> · {numbers.format(Math.round(value * 100))}% · resets {resetTime(item.window.resetsAt, item.weekly)}</span>
            {:else}
              <span> · Usage unavailable</span>
            {/if}
          </p>
          <div
            class="bar"
            role="progressbar"
            aria-label={item.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={item.window ? Math.round(value * 100) : undefined}
            aria-valuetext={item.window ? undefined : 'Usage unavailable'}
          >
            <span class="fill" style:transform="scaleX({value})"></span>
          </div>
          {#if value >= 0.75}
            <p class="warning" role="status">{value >= 0.9 ? 'Almost at the limit. Ants may pause until this window resets.' : 'Getting close to the limit. Keep an eye on this window.'}</p>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <section class="activity" aria-label="Per-ant usage">
    <div class="activity-head">
      <h3>By ant</h3>
      <div class="period" role="group" aria-label="Usage period">
        <button aria-pressed={period === 'today'} onclick={() => (period = 'today')}>Today</button>
        <button aria-pressed={period === 'week'} onclick={() => (period = 'week')}>Last 7 days</button>
      </div>
    </div>
    <p class="note">{period === 'today' ? 'Today (UTC)' : 'Last 7 days (UTC), including today'} · ≈ value at API prices</p>
    {#if error}
      <div class="empty" role="status">Couldn’t load ant activity. <button class="btn btn-ghost" onclick={() => (retry += 1)}>Try again</button></div>
    {:else if days === null}
      <p class="empty" role="status">Loading ant activity…</p>
    {:else if !rows.length}
      <p class="empty">No ant activity {period === 'today' ? 'today' : 'in the last 7 days'}.</p>
    {:else}
      <div class="table-scroll">
        <table class="tabular">
          <thead><tr><th scope="col">Ant</th><th scope="col">Runs</th><th scope="col">Tokens</th><th scope="col">≈ API value</th></tr></thead>
          <tbody>
            {#each rows as row (row.antId)}
              <tr>
                <th scope="row">
                  <div class="ant-name">
                    <span aria-hidden="true"><Ant color={row.ant?.color ?? 'coral'} accessory={row.ant?.accessory ?? 'none'} mode="head" size={26} /></span>
                    <span>{row.ant?.name ?? 'Removed ant'}</span>
                  </div>
                </th>
                <td>{numbers.format(row.runs)}</td><td>{numbers.format(row.tokens)}</td><td>{money.format(row.costUsd)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</Modal>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 22px 0;
  }

  h2 {
    font-size: var(--text-lg);
    font-weight: 500;
  }

  .lede {
    padding: 8px 22px 20px;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    line-height: 1.6;
    color: var(--text-muted);
  }

  .windows {
    display: grid;
    gap: 20px;
    padding: 0 22px 22px;
  }

  .window {
    --meter: var(--text-muted);
  }

  .warn {
    --meter: var(--warn);
  }

  .danger {
    --meter: var(--danger);
  }

  .window-label {
    margin-bottom: 9px;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.7;
  }

  .window-label span:first-child {
    color: var(--text);
    font-weight: 500;
  }

  .bar {
    height: 6px;
    overflow: hidden;
    border-radius: var(--r-full);
    background: var(--border-strong);
  }

  .fill {
    display: block;
    height: 100%;
    background: var(--meter);
    transform-origin: left;
    transition: transform var(--dur-slow) var(--ease-spring);
  }

  .warning {
    margin-top: 8px;
    color: var(--meter);
    font-size: var(--text-xs);
  }

  .activity {
    padding: 18px 22px 22px;
    border-top: 1px solid var(--border);
  }

  .activity-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  h3 {
    font-size: var(--text-md);
    font-weight: 500;
  }

  .period {
    display: flex;
    gap: 3px;
    padding: 3px;
    border-radius: var(--r-md);
    background: var(--bg-input);
  }

  .period button {
    padding: 6px 10px;
    border-radius: var(--r-sm);
    font-size: var(--text-xs);
    color: var(--text-muted);
    transition: transform var(--dur-fast) var(--ease-out);
  }

  .period button[aria-pressed='true'] {
    background: var(--bg-selected);
    color: var(--text);
  }

  .period button:active {
    transform: scale(0.96);
  }

  .note {
    margin: 10px 0 14px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .empty {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px 0;
    color: var(--text-muted);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .table-scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    text-align: right;
  }

  th,
  td {
    padding: 12px 8px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  th {
    font-weight: 500;
  }

  thead th {
    padding-top: 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  th:first-child {
    padding-left: 0;
    text-align: left;
  }

  th:last-child,
  td:last-child {
    padding-right: 0;
  }

  tbody tr:last-child th,
  tbody tr:last-child td {
    border-bottom: 0;
  }

  .ant-name {
    display: flex;
    align-items: center;
    gap: 10px;
  }
</style>
