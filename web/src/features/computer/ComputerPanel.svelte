<script lang="ts">
  import Hand from '@lucide/svelte/icons/hand'
  import GraduationCap from '@lucide/svelte/icons/graduation-cap'
  import CheckCircle from '@lucide/svelte/icons/circle-check'
  import { slide } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import Ant from '../../lib/ant/Ant.svelte'
  import { rise } from '../../lib/motion'
  import { antById, app, threadById } from '../../lib/store.svelte'
  import FakeScreen from './FakeScreen.svelte'

  const thread = $derived(threadById(app.selectedId))
  const antId = $derived(
    thread?.kind === 'ant' ? thread.refId : (app.typing[thread?.id ?? ''] ?? app.colonies.find((c) => c.id === thread?.refId)?.memberIds[0]),
  )
  const ant = $derived(antId ? antById(antId) : undefined)
  const card = $derived(thread?.messages.findLast((m) => m.kind === 'computer'))
  const live = $derived(!app.takeover && (card?.kind === 'computer' && card.state === 'working'))
  const site = $derived(card?.kind === 'computer' ? card.site : 'about:blank')

  const steps = ['Opened browser', 'Signed in with saved session', 'Navigated to checkout', 'Clicked "Pay now"', 'Captured console output']
  let shown = $state(1)

  $effect(() => {
    if (!live) return
    shown = 1
    const id = setInterval(() => (shown = Math.min(steps.length, shown + 1)), 1500)
    return () => clearInterval(id)
  })
</script>

<div class="panel">
  <div class="head">
    {#if ant}<Ant color={ant.color} size={22} status={live ? 'working' : 'idle'} />{/if}
    <div>
      <div class="title">{ant?.name ?? 'Ant'}'s computer</div>
      <div class="sub">{app.takeover ? 'You are in control' : live ? 'Working' : 'Idle'} · {site}</div>
    </div>
  </div>

  {#if !card}
    <div class="empty">
      <div class="empty-screen"><span>{ant?.name ?? 'This ant'} hasn't used its computer yet.</span></div>
      <p>When it browses, clicks or signs in somewhere, you'll watch it live here and can take over at any time.</p>
    </div>
  {:else}
  <div class="screen-wrap" class:control={app.takeover}>
    <FakeScreen {site} {live} />
    {#if app.takeover}
      <div class="banner" transition:slide={{ duration: 240, easing: cubicOut }}>
        <Hand size={14} /> You're in control. {ant?.name} is paused.
      </div>
    {/if}
  </div>

  <div class="actions">
    {#if app.takeover}
      <button class="btn btn-primary" onclick={() => (app.takeover = false)} in:rise={{ y: 4, duration: 200 }}>
        <CheckCircle size={15} /> I'm done
      </button>
    {:else}
      <button class="btn btn-ghost" onclick={() => (app.takeover = true)} in:rise={{ y: 4, duration: 200 }}>
        <Hand size={15} /> Take over
      </button>
    {/if}
    <button class="btn btn-ghost"><GraduationCap size={15} /> Teach a task</button>
  </div>

  <div class="log">
    <div class="log-title">Activity</div>
    <ol>
      {#each steps.slice(0, live ? shown : steps.length) as s, i (s)}
        <li in:rise={{ y: 6 }}>
          <span class="dot" class:current={live && i === shown - 1}></span>
          {s}
        </li>
      {/each}
    </ol>
  </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .title {
    font-size: var(--text-md);
    font-weight: 500;
  }

  .sub {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .screen-wrap {
    position: relative;
    border-radius: var(--r-lg);
    padding: 3px;
    background: transparent;
    transition:
      background var(--dur-slow) var(--ease-out),
      box-shadow var(--dur-slow) var(--ease-out);
  }

  .screen-wrap.control {
    background: var(--accent);
    box-shadow: 0 0 0 6px var(--accent-soft);
  }

  .banner {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 10px 5px;
    font-size: var(--text-sm);
    font-weight: 500;
    color: #141413;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .empty-screen {
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 10;
    border-radius: var(--r-md);
    border: 1px dashed var(--border-strong);
    background: repeating-linear-gradient(-45deg, transparent 0 10px, rgb(255 255 255 / 0.015) 10px 20px);
    font-size: var(--text-sm);
    color: var(--text-muted);
    text-align: center;
    padding: 20px;
  }

  .empty p {
    margin-top: 12px;
    font-size: var(--text-sm);
    line-height: 1.55;
    color: var(--text-faint);
  }

  .log-title {
    margin-bottom: 8px;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-faint);
  }

  ol {
    margin: 0;
    padding: 0;
    list-style: none;
    border-left: 1px solid var(--border-strong);
    margin-left: 4px;
  }

  li {
    position: relative;
    padding: 4px 0 4px 16px;
    font-size: var(--text-sm);
    color: var(--text-soft);
  }

  .dot {
    position: absolute;
    left: -4.5px;
    top: 11px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-strong);
    box-shadow: 0 0 0 3px var(--bg-sidebar);
    transition: background var(--dur);
  }

  .dot.current {
    background: var(--warn);
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      box-shadow:
        0 0 0 3px var(--bg-sidebar),
        0 0 0 7px rgb(242 177 60 / 0.25);
    }
  }
</style>
