<script lang="ts">
  import { onMount } from 'svelte'
  import type { RoutineRunView, RoutineView } from '@ant/shared'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import Copy from '@lucide/svelte/icons/copy'
  import { app, routineRuns } from '../../lib/store.svelte'
  import { collapse, rise } from '../../lib/motion'

  let { routine }: { routine: RoutineView } = $props()
  let runs = $state<RoutineRunView[]>([])
  let loading = $state(true)
  let error = $state('')
  let expanded = $state<string[]>([])
  let refresh = $state(0)
  let now = $state(Date.now())
  let copied = $state(false)
  let copyError = $state('')

  $effect(() => {
    const id = routine.id
    // Run lifecycle events carry these fields. Reconnect and explicit refresh also reload history.
    void routine.lastRunAt
    void routine.lastStatus
    void app.online
    void refresh
    let active = true
    routineRuns(id).then((result) => {
      if (!active) return
      runs = result.sort((a, b) => b.startedAt - a.startedAt).slice(0, 20)
      error = ''
    }).catch((err: unknown) => {
      if (active) error = err instanceof Error ? err.message : String(err)
    }).finally(() => {
      if (active) loading = false
    })
    return () => {
      active = false
    }
  })

  onMount(() => {
    const timer = setInterval(() => {
      now = Date.now()
      if (runs.some((r) => r.status === 'running')) refresh++
    }, 15_000)
    return () => clearInterval(timer)
  })

  function duration(run: RoutineRunView) {
    const seconds = Math.max(0, Math.floor(((run.endedAt ?? now) - run.startedAt) / 1000))
    if (seconds < 60) return `${seconds}s${run.endedAt === null ? ' so far' : ''}`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  function started(at: number) {
    try {
      return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: routine.tz }).format(at)
    } catch {
      return new Date(at).toLocaleString()
    }
  }

  async function copyUrl() {
    copyError = ''
    try {
      await navigator.clipboard.writeText(routine.webhookUrl ?? '')
      copied = true
    } catch {
      copyError = 'Could not copy. Select the URL and copy it manually.'
    }
  }
</script>

<div class="history">
  {#if routine.trigger === 'webhook' && routine.webhookUrl}
    <div class="webhook">
      <div class="heading"><span>Webhook URL</span><button class="icon-btn" aria-label="Copy webhook URL" title="Copy URL" onclick={copyUrl}><Copy size={13} /></button></div>
      <code>{routine.webhookUrl}</code>
      <p>POST with Authorization: Bearer &lt;your saved key&gt;. The key was shown only when created.</p>
      {#if copied}<p aria-live="polite">URL copied</p>{/if}
      {#if copyError}<p class="error" role="alert">{copyError}</p>{/if}
    </div>
  {/if}
  <div class="heading"><h4>Last 20 runs</h4><button class="refresh" onclick={() => refresh++}>Refresh</button></div>
  {#if error}
    <p class="error" role="alert">{error}</p>
    <button class="refresh" onclick={() => refresh++}>Try again</button>
  {:else if loading}
    <p class="empty" role="status">Loading runs…</p>
  {:else if runs.length === 0}
    <p class="empty">No runs yet.</p>
  {/if}
  {#each runs as run (run.id)}
    <div class="run" in:rise out:collapse>
      <div class="meta">
        <span class="status" class:succeeded={run.status === 'succeeded'} class:failed={run.status === 'failed'} class:running={run.status === 'running'} class:expired={run.status === 'expired'}>{run.status}</span>
        <span class="tabular">{duration(run)}{run.costUsd ? ` · ≈$${run.costUsd.toFixed(2)}` : ''}</span>
      </div>
      <time datetime={new Date(run.startedAt).toISOString()} title={new Date(run.startedAt).toLocaleString()}>{started(run.startedAt)} · {routine.tz}</time>
      {#if run.output}
        <button class="output-toggle" aria-expanded={expanded.includes(run.id)} onclick={() => expanded = expanded.includes(run.id) ? expanded.filter((id) => id !== run.id) : [...expanded, run.id]}>
          <span>{run.output.split(/\r?\n/)[0] || 'Read output'}</span>
          <ChevronDown size={13} class={expanded.includes(run.id) ? 'rotated' : ''} />
        </button>
        {#if expanded.includes(run.id)}<div transition:collapse><pre>{run.output}</pre></div>{/if}
      {:else}
        <p class="empty">{run.status === 'running' ? 'Running…' : 'No output.'}</p>
      {/if}
    </div>
  {/each}
</div>

<style>
  .history {
    padding: 10px 12px;
    border-radius: var(--r-md);
    background: var(--bg-input);
    margin: 8px 0;
  }

  .heading, .meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  h4, .heading > span {
    margin: 0;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-muted);
  }

  .refresh {
    padding: 4px;
    font-size: var(--text-xs);
    color: var(--text-muted);
    transition: color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  }

  .refresh:hover {
    color: var(--text);
  }

  .refresh:active {
    transform: scale(0.96);
  }

  .run {
    padding: 10px 0;
    border-top: 1px solid var(--border);
    margin-top: 6px;
  }

  .meta {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .status {
    text-transform: capitalize;
  }

  .succeeded {
    color: var(--ok);
  }

  .failed {
    color: var(--danger);
  }

  .running {
    color: var(--brand-blue);
  }

  .expired {
    color: var(--warn);
  }

  time {
    display: block;
    margin: 4px 0;
    color: var(--text-faint);
    font-size: var(--text-xs);
  }

  .output-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    text-align: left;
    color: var(--text-soft);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .output-toggle span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .output-toggle :global(svg) {
    flex: none;
    transition: transform var(--dur) var(--ease-out);
  }

  .output-toggle :global(.rotated) {
    transform: rotate(180deg);
  }

  pre {
    margin: 8px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    line-height: 1.65;
    color: var(--text-soft);
  }

  .empty, .webhook p {
    margin: 6px 0;
    font-size: var(--text-xs);
    line-height: 1.6;
    color: var(--text-muted);
  }

  .error, .webhook .error {
    color: var(--danger);
    font-size: var(--text-xs);
  }

  .webhook {
    margin-bottom: 12px;
  }

  code {
    display: block;
    font-size: var(--text-xs);
    line-height: 1.7;
    overflow-wrap: anywhere;
    user-select: all;
  }
</style>
