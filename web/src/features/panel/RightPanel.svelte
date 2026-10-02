<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import { fade } from 'svelte/transition'
  import { app } from '../../lib/store.svelte'
  import ComputerPanel from '../computer/ComputerPanel.svelte'
  import DetailsPanel from '../details/DetailsPanel.svelte'

  // Keep the last panel rendered while the column animates closed.
  let shown: 'computer' | 'details' = $state('computer')
  $effect(() => {
    if (app.panel) shown = app.panel
  })
</script>

<aside class="right" class:open={!!app.panel} aria-hidden={!app.panel} inert={!app.panel}>
  <div class="inner">
    <div class="head">
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={shown === 'computer'} onclick={() => (app.panel = 'computer')}>Computer</button>
        <button role="tab" aria-selected={shown === 'details'} onclick={() => (app.panel = 'details')}>Details</button>
        <span class="tab-pill" style:transform="translateX({shown === 'computer' ? 0 : 100}%)"></span>
      </div>
      <button class="icon-btn" aria-label="Close panel" onclick={() => (app.panel = null)}><X size={16} /></button>
    </div>
    <div class="body">
      {#key shown + app.selectedId}
        <div in:fade={{ duration: 180, delay: 60 }}>
          {#if shown === 'computer'}<ComputerPanel />{:else}<DetailsPanel />{/if}
        </div>
      {/key}
    </div>
  </div>
</aside>

<style>
  .right {
    height: 100%;
    overflow: hidden;
    background: var(--bg-sidebar);
    border-left: 1px solid var(--border);
  }

  @media (max-width: 960px) {
    .right {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 30;
      width: min(var(--panel-w), 92vw);
      transform: translateX(102%);
      transition: transform 380ms var(--ease-out);
      box-shadow: var(--shadow-lg);
    }

    .right.open {
      transform: none;
    }

    .right .inner {
      width: 100%;
    }
  }

  .inner {
    display: flex;
    flex-direction: column;
    width: var(--panel-w);
    height: 100%;
  }

  .head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    padding: 0 10px 0 14px;
    border-bottom: 1px solid var(--border);
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
    height: 26px;
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
    height: 26px;
    border-radius: var(--r-sm);
    background: var(--bg-selected);
    transition: transform 340ms var(--ease-spring);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
