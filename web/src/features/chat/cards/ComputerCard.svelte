<script lang="ts">
  import Maximize from '@lucide/svelte/icons/maximize-2'
  import { app } from '../../../lib/store.svelte'
  import type { ComputerMessage } from '../../../lib/types'
  import FakeScreen from '../../computer/FakeScreen.svelte'
  import LiveScreen from '../../computer/LiveScreen.svelte'
  import StatusPill from './StatusPill.svelte'

  let { m }: { m: ComputerMessage } = $props()
</script>

<div class="card">
  <div class="head">
    <span class="title">{m.title}</span>
    <StatusPill state={m.state} />
  </div>
  <p class="text">{m.text}</p>
  <button class="thumb" onclick={() => (app.panel = 'computer')} aria-label="Open computer">
    {#if app.mode !== 'live'}
      <FakeScreen site={m.site} live={m.state === 'working'} />
    {:else if m.state === 'working'}
      <LiveScreen antId={m.author} control={false} />
    {:else if m.snapshot}
      <img class="snap" src="/api/ants/{m.author}/snapshots/{m.id}.jpg" alt="Last view of {m.site}" loading="lazy" />
    {:else}
      <div class="snap empty">{m.site || 'Browser'}</div>
    {/if}
    <span class="open"><Maximize size={13} /> Open computer</span>
  </button>
</div>

<style>
  .card {
    width: min(420px, 100%);
    padding: 12px 14px 14px;
    border-radius: var(--r-xl);
    background: var(--bg-bubble);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .title {
    font-size: var(--text-md);
    font-weight: 600;
  }

  .text {
    margin: 4px 0 10px;
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--text-soft);
  }

  .thumb {
    position: relative;
    display: block;
    width: 100%;
    border-radius: var(--r-md);
    transition: transform var(--dur) var(--ease-out);
  }

  .thumb:hover {
    transform: scale(1.012);
  }

  .snap {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    border-radius: var(--r-md);
    box-shadow: 0 0 0 1px rgb(255 255 255 / 0.06);
  }

  .snap.empty {
    display: grid;
    place-items: center;
    background: #0e0e0e;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .open {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: var(--r-full);
    background: rgb(20 20 19 / 0.82);
    backdrop-filter: blur(8px);
    font-size: var(--text-xs);
    font-weight: 500;
    opacity: 0;
    transform: translateY(4px);
    transition:
      opacity var(--dur) var(--ease-out),
      transform var(--dur) var(--ease-out);
  }

  .thumb:hover .open,
  .thumb:focus-visible .open {
    opacity: 1;
    transform: none;
  }
</style>
