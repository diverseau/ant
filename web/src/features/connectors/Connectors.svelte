<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import Loader from '@lucide/svelte/icons/loader'
  import { flip } from 'svelte/animate'
  import { connectors as seed } from '../../lib/mock/data'
  import { pop } from '../../lib/motion'
  import { app } from '../../lib/store.svelte'
  import Modal from '../../lib/ui/Modal.svelte'

  let list = $state(seed)
  let tab: 'all' | 'installed' = $state('all')
  let busy: string | null = $state(null)

  const shown = $derived(tab === 'all' ? list : list.filter((c) => c.installed))

  function connect(id: string) {
    busy = id
    setTimeout(() => {
      const c = list.find((x) => x.id === id)
      if (c) c.installed = !c.installed
      busy = null
    }, 900)
  }
</script>

<Modal onclose={() => (app.overlay = null)} width={680} label="Connectors">
  <div class="head">
    <h2>Connectors</h2>
    <div class="tabs" role="tablist">
      {#each ['all', 'installed'] as const as t}
        <button role="tab" aria-selected={tab === t} onclick={() => (tab = t)}>{t === 'all' ? 'All' : 'Installed'}</button>
      {/each}
      <span class="tab-pill" style:transform="translateX({tab === 'all' ? 0 : 100}%)"></span>
    </div>
  </div>
  <p class="lede">Connectors are shared by all your ants. Tokens never reach the model.</p>
  <div class="grid">
    {#each shown as c (c.id)}
      <div class="card" animate:flip={{ duration: 320 }} in:pop>
        <span class="logo" style:--h={c.hue}>{c.name[0]}</span>
        <div class="meta">
          <div class="name">{c.name}</div>
          <div class="desc">{c.description}</div>
        </div>
        <button class="btn" class:btn-ghost={!c.installed} class:connected={c.installed} onclick={() => connect(c.id)} disabled={busy === c.id}>
          {#if busy === c.id}<span class="spin"><Loader size={14} /></span>{:else if c.installed}<Check size={14} /> Connected{:else}Connect{/if}
        </button>
      </div>
    {/each}
  </div>
</Modal>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 22px 0;
  }

  h2 {
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 1.35rem;
  }

  .tabs {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
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
    width: calc(50% - 3px);
    height: 28px;
    border-radius: var(--r-sm);
    background: var(--bg-selected);
    transition: transform 340ms var(--ease-spring);
  }

  .lede {
    padding: 6px 22px 14px;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: 8px;
    padding: 0 16px 18px;
  }

  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: var(--r-lg);
    border: 1px solid var(--border);
    background: var(--bg-raised);
    transition: border-color var(--dur-fast);
  }

  .card:hover {
    border-color: var(--border-strong);
  }

  .logo {
    display: grid;
    place-items: center;
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: var(--r-md);
    background: hsl(var(--h) 55% 55% / 0.18);
    color: hsl(var(--h) 70% 72%);
    font-weight: 600;
  }

  .meta {
    flex: 1;
    min-width: 0;
  }

  .name {
    font-size: var(--text-md);
    font-weight: 500;
  }

  .desc {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .connected {
    color: var(--ok);
  }

  .spin {
    display: grid;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
