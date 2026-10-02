<script lang="ts">
  import CircleAlert from '@lucide/svelte/icons/circle-alert'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import { collapse } from '../../../lib/motion'
  import type { ErrorMessage } from '../../../lib/types'

  let { m }: { m: ErrorMessage } = $props()
  let expanded = $state(false)
  const disclosureId = $props.id()
</script>

<div class="card">
  <span class="icon"><CircleAlert size={16} /></span>
  <div class="copy">
    <p class="text">{m.text}</p>
    {#if m.detail}
      <button class="disclosure" aria-expanded={expanded} aria-controls={disclosureId} onclick={() => (expanded = !expanded)}>
        <span class="chevron" class:expanded><ChevronRight size={12} /></span>Details
      </button>
      {#if expanded}
        <div id={disclosureId} transition:collapse><pre>{m.detail}</pre></div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .card {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    width: min(440px, 100%);
    padding: 12px 14px;
    border-radius: var(--r-xl);
    background: color-mix(in srgb, var(--danger) 5%, var(--bg-bubble));
    border: 1px solid color-mix(in srgb, var(--danger) 18%, transparent);
  }

  .icon {
    display: grid;
    flex: none;
    margin-top: 3px;
    color: color-mix(in srgb, var(--danger) 70%, var(--text-muted));
  }

  .copy {
    flex: 1;
    min-width: 0;
  }

  .text {
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.5;
    color: var(--text-soft);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .disclosure {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    padding: 2px 0;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .disclosure:hover {
    color: var(--text-soft);
  }

  .chevron {
    display: grid;
    transition: transform var(--dur) var(--ease-out);
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  pre {
    margin: 8px 0 0;
    padding: 9px 10px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--danger) 4%, var(--bg-app));
    font-family: monospace;
    font-size: var(--text-xs);
    line-height: 1.6;
    color: var(--text-muted);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
