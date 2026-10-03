<script lang="ts" module>
  import type { Component } from 'svelte'
  export interface OptionItem {
    id: string
    label: string
    note?: string
    badge?: string
    icon?: Component<{ size?: number }>
    selected?: boolean
    disabled?: boolean
    onpick: () => void
  }
  export interface OptionSection {
    title?: string
    hint?: string
    items: OptionItem[]
  }
</script>

<script lang="ts">
  // Sectioned single-choice list used by the effort and permission menus.
  let { sections, onclose, label }: { sections: OptionSection[]; onclose: () => void; label: string } = $props()

  const flat = $derived(sections.flatMap((s) => s.items))
  let active = $state(-1)
  let el: HTMLDivElement | undefined = $state()

  $effect(() => {
    el?.focus()
  })

  function key(e: KeyboardEvent) {
    const enabled = flat.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const at = enabled.indexOf(active)
      const next = at < 0 ? (e.key === 'ArrowDown' ? 0 : enabled.length - 1) : (at + (e.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length
      active = enabled[next] ?? -1
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      flat[active]?.onpick()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onclose()
    }
  }
</script>

<div bind:this={el} class="list" role="listbox" aria-label={label} tabindex="-1" onkeydown={key}>
  {#each sections as s, si}
    {#if si > 0}<div class="sep"></div>{/if}
    {#if s.title}<div class="title">{s.title}</div>{/if}
    {#each s.items as o (o.id)}
      {@const i = flat.indexOf(o)}
      <button
        role="option"
        aria-selected={!!o.selected}
        class:active={i === active}
        disabled={o.disabled}
        onpointermove={() => (active = o.disabled ? -1 : i)}
        onpointerleave={() => (active = -1)}
        onclick={o.onpick}
      >
        <span class="line">
          {#if o.icon}<span class="icon"><o.icon size={15} /></span>{/if}
          <span class="label">{o.label}</span>
          {#if o.badge}<span class="badge">{o.badge}</span>{/if}
        </span>
        {#if o.note}<span class="note" class:indent={!!o.icon}>{o.note}</span>{/if}
      </button>
    {/each}
    {#if s.hint}<div class="hint">{s.hint}</div>{/if}
  {/each}
</div>

<style>
  .list {
    padding: 6px;
    outline: none;
    overflow-y: auto;
    max-height: inherit;
  }

  .title {
    padding: 6px 8px 4px;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .sep {
    height: 1px;
    margin: 6px 4px;
    background: var(--border);
  }

  button {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 7px 9px;
    border-radius: var(--r-md);
    text-align: left;
    color: var(--text-soft);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-fast) var(--ease-out);
  }

  button.active {
    background: var(--bg-hover);
    color: var(--text);
  }

  button[aria-selected='true'] {
    background: var(--bg-active);
    color: var(--text);
  }

  button:active:not(:disabled) {
    transform: scale(0.985);
  }

  button:disabled {
    color: var(--text-faint);
    cursor: default;
  }

  .line {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .icon {
    display: grid;
    width: 16px;
    color: var(--text-muted);
  }

  button[aria-selected='true'] .icon {
    color: var(--text);
  }

  .label {
    font-size: var(--text-md);
  }

  .badge {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .note {
    font-size: var(--text-xs);
    line-height: 1.4;
    color: var(--text-faint);
  }

  .note.indent {
    padding-left: 24px;
  }

  .hint {
    padding: 2px 9px 6px;
    font-size: var(--text-xs);
    line-height: 1.4;
    color: var(--text-faint);
  }
</style>
