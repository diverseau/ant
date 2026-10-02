<script lang="ts">
  import type { Ant as AntT } from '../types'
  import Ant from './Ant.svelte'

  let { ants, size = 40, max = 3 }: { ants: AntT[]; size?: number; max?: number } = $props()

  const shown = $derived(ants.slice(0, ants.length > max ? max - 1 : max))
  const extra = $derived(ants.length - shown.length)
  const s = $derived(Math.round(size * 0.62))
</script>

<div class="stack" style:width="{size}px" style:height="{size}px">
  {#each shown as a, i (a.id)}
    <div class="slot s{i}" style:--s="{s}px">
      <Ant color={a.color} size={s} status={a.status} />
    </div>
  {/each}
  {#if extra > 0}
    <div class="more" style:--s="{s}px">+{extra}</div>
  {/if}
</div>

<style>
  .stack {
    position: relative;
    flex: none;
  }

  .slot,
  .more {
    position: absolute;
    width: var(--s);
    height: var(--s);
    transition: transform var(--dur) var(--ease-spring);
  }

  .s0 {
    left: 0;
    top: 0;
  }

  .s1 {
    right: 0;
    top: 6%;
  }

  .s2 {
    left: 10%;
    bottom: 0;
  }

  .more {
    right: 0;
    bottom: 0;
    display: grid;
    place-items: center;
    border-radius: var(--r-full);
    background: var(--bg-selected);
    font-size: 11px;
    font-weight: 600;
    color: var(--text-soft);
    box-shadow: 0 0 0 2px var(--bg-sidebar);
  }

  .stack:hover .s0 {
    transform: translate(-6%, -4%) rotate(-6deg);
  }

  .stack:hover .s1 {
    transform: translate(6%, -4%) rotate(6deg);
  }

  .stack:hover .s2 {
    transform: translateY(4%);
  }
</style>
