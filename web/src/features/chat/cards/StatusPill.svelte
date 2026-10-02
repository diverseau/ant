<script lang="ts">
  import Sun from '@lucide/svelte/icons/loader'
  import Check from '@lucide/svelte/icons/check'
  import Hand from '@lucide/svelte/icons/hand'

  let { state }: { state: 'working' | 'needs-you' | 'done' } = $props()
  const label = $derived({ working: 'Working', 'needs-you': 'Needs you', done: 'Done' }[state])
</script>

{#key state}
  <span class="pill {state}">
    {#if state === 'working'}<span class="spin"><Sun size={12} /></span>{:else if state === 'done'}<Check size={12} />{:else}<Hand size={12} />{/if}
    {label}
  </span>
{/key}

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 9px;
    border-radius: var(--r-sm);
    font-size: var(--text-xs);
    font-weight: 500;
    animation: in 380ms var(--ease-spring) both;
  }

  .working {
    background: var(--warn-soft);
    color: var(--warn);
  }

  .done {
    background: rgb(66 194 142 / 0.12);
    color: var(--ok);
  }

  .needs-you {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .spin {
    display: inline-grid;
    animation: spin 1.4s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes in {
    from {
      transform: scale(0.7);
      opacity: 0;
    }
  }
</style>
