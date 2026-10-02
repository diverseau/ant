<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import WifiOff from '@lucide/svelte/icons/wifi-off'
  import FlaskConical from '@lucide/svelte/icons/flask-conical'
  import { flip } from 'svelte/animate'
  import { pop, popOut } from '../motion'
  import { app, dismiss } from '../store.svelte'
</script>

<div class="stack" aria-live="polite">
  {#if app.mode === 'demo'}
    <div class="toast banner" in:pop out:popOut>
      <FlaskConical size={15} />
      <span>Demo mode: antd isn't running, so these ants are scripted. Start it with <code>npm run dev:server</code>.</span>
    </div>
  {:else if app.mode === 'live' && !app.online}
    <div class="toast banner warn" in:pop out:popOut>
      <WifiOff size={15} />
      <span>Lost connection to antd. Reconnecting…</span>
    </div>
  {/if}
  {#each app.notices as n (n.id)}
    <div class="toast {n.level}" animate:flip={{ duration: 260 }} in:pop out:popOut role={n.level === 'error' ? 'alert' : 'status'}>
      <span>{n.text}</span>
      <button class="icon-btn" aria-label="Dismiss" onclick={() => dismiss(n.id)}><X size={14} /></button>
    </div>
  {/each}
</div>

<style>
  .stack {
    position: fixed;
    right: 16px;
    top: 62px;
    z-index: 70;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    max-width: min(420px, calc(100vw - 32px));
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 14px;
    border-radius: var(--r-lg);
    background: #1c1c1b;
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    font-size: var(--text-sm);
    color: var(--text-soft);
    transform-origin: top right;
  }

  .toast span {
    flex: 1;
  }

  .banner {
    padding: 10px 14px;
    color: var(--text-muted);
  }

  .warn {
    border-color: rgb(242 177 60 / 0.4);
    color: var(--warn);
  }

  .error {
    border-color: rgb(229 96 79 / 0.45);
    color: #f4a69b;
  }

  code {
    font-size: 0.9em;
    color: var(--text-soft);
  }

  .icon-btn {
    width: 26px;
    height: 26px;
  }
</style>
