<script lang="ts">
  // Pick which ants something applies to: optionally "All ants", else a set of ant heads.
  import Ant from '../../lib/ant/Ant.svelte'
  import { app } from '../../lib/store.svelte'

  interface Props {
    selected: string[]
    /** Show the "All ants" chip; `all` is its state. */
    allowAll?: boolean
    all?: boolean
    onchange: (all: boolean, ids: string[]) => void
  }

  let { selected, allowAll = false, all = false, onchange }: Props = $props()

  function toggle(id: string) {
    const set = new Set(all ? app.ants.map((a) => a.id) : selected)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    const ids = [...set]
    onchange(allowAll && ids.length === app.ants.length, ids)
  }
</script>

<div class="picker" role="group" aria-label="Ants">
  {#if allowAll}
    <button class="chip all" class:on={all} aria-pressed={all} onclick={() => onchange(!all, all ? [] : app.ants.map((a) => a.id))}>All ants</button>
  {/if}
  {#each app.ants as a (a.id)}
    {@const on = all || selected.includes(a.id)}
    <button class="chip" class:on aria-pressed={on} title={a.name} onclick={() => toggle(a.id)}>
      <Ant color={a.color} size={18} status={on ? 'idle' : 'paused'} />
      <span>{a.name}</span>
    </button>
  {/each}
</div>

<style>
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px 0 6px;
    border-radius: var(--r-full);
    border: 1px solid var(--border-strong);
    font-size: var(--text-xs);
    color: var(--text-muted);
    transition:
      background var(--dur) var(--ease-out),
      border-color var(--dur) var(--ease-out),
      color var(--dur),
      transform var(--dur-fast) var(--ease-out);
  }

  .chip.all {
    padding: 0 12px;
  }

  .chip:active {
    transform: scale(0.94);
  }

  .chip.on {
    border-color: rgb(217 119 87 / 0.55);
    background: var(--accent-soft);
    color: var(--text);
  }
</style>
