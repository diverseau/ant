<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import Minus from '@lucide/svelte/icons/minus'
  import type { ChecklistMessage } from '../../../lib/types'

  let { m }: { m: ChecklistMessage } = $props()
</script>

<ul class="card">
  {#each m.items as item, i}
    <li style:--i={i}>
      <span class="mark" class:ok={item.ok}>
        {#if item.ok}<Check size={13} strokeWidth={2.6} />{:else}<Minus size={13} strokeWidth={2.6} />{/if}
      </span>
      <span>
        <strong>{item.service}</strong>
        <span class="arrow">→</span>
        {item.result}{#if item.detail}<span class="detail">&nbsp;· {item.detail}</span>{/if}
      </span>
    </li>
  {/each}
</ul>

<style>
  .card {
    margin: 0;
    padding: 11px 14px;
    list-style: none;
    border-radius: var(--r-xl);
    background: var(--bg-bubble);
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.5;
  }

  li {
    display: flex;
    align-items: baseline;
    gap: 9px;
    animation: item 420ms calc(var(--i) * 90ms + 80ms) var(--ease-out) both;
  }

  li + li {
    margin-top: 3px;
  }

  .mark {
    flex: none;
    display: grid;
    place-items: center;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    transform: translateY(3px);
    background: rgb(255 255 255 / 0.06);
    color: var(--text-faint);
    animation: mark 460ms calc(var(--i) * 90ms + 160ms) var(--ease-spring) both;
  }

  .mark.ok {
    background: rgb(66 194 142 / 0.16);
    color: var(--ok);
  }

  strong {
    font-family: var(--font-ui);
    font-size: 0.9em;
    font-weight: 600;
  }

  .arrow,
  .detail {
    color: var(--text-muted);
  }

  @keyframes item {
    from {
      opacity: 0;
      transform: translateX(-6px);
    }
  }

  @keyframes mark {
    from {
      transform: translateY(3px) scale(0);
    }
  }
</style>
