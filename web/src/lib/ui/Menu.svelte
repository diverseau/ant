<script lang="ts" module>
  import type { Component } from 'svelte'
  export interface MenuItem {
    label: string
    icon?: Component<{ size?: number }>
    danger?: boolean
    hint?: string
    onclick: () => void
  }
</script>

<script lang="ts">
  import { pop, popOut } from '../motion'

  let { x, y, items, onclose }: { x: number; y: number; items: MenuItem[]; onclose: () => void } = $props()

  let el: HTMLDivElement | undefined = $state()
  let pos = $state({ left: 0, top: 0 })
  let active = $state(-1)

  $effect(() => {
    if (!el) return
    const r = el.getBoundingClientRect()
    pos = {
      left: Math.min(x, innerWidth - r.width - 8),
      top: Math.min(y, innerHeight - r.height - 8),
    }
    el.focus()
  })

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
    else if (e.key === 'ArrowDown') active = (active + 1) % items.length
    else if (e.key === 'ArrowUp') active = (active - 1 + items.length) % items.length
    else if (e.key === 'Enter' && active >= 0) run(items[active])
    else return
    e.preventDefault()
  }

  function run(item: MenuItem) {
    onclose()
    item.onclick()
  }
</script>

<svelte:window onpointerdown={(e) => el && !el.contains(e.target as Node) && onclose()} onblur={onclose} />

<div
  bind:this={el}
  class="menu"
  role="menu"
  tabindex="-1"
  style:left="{pos.left || x}px"
  style:top="{pos.top || y}px"
  onkeydown={key}
  in:pop
  out:popOut
>
  {#each items as item, i}
    <button
      role="menuitem"
      class:danger={item.danger}
      class:active={i === active}
      onpointerenter={() => (active = i)}
      onclick={() => run(item)}
    >
      {#if item.icon}<item.icon size={15} />{/if}
      <span>{item.label}</span>
      {#if item.hint}<span class="hint">{item.hint}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 60;
    min-width: 188px;
    padding: 5px;
    border-radius: var(--r-lg);
    background: #1c1c1b;
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    transform-origin: top left;
  }

  button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 32px;
    padding: 0 10px;
    border-radius: var(--r-sm);
    font-size: var(--text-sm);
    color: var(--text-soft);
    text-align: left;
    transition: background var(--dur-fast);
  }

  button.active {
    background: var(--bg-active);
    color: var(--text);
  }

  button.danger {
    color: #f19a8d;
  }

  .hint {
    margin-left: auto;
    color: var(--text-faint);
    font-size: var(--text-xs);
  }
</style>
