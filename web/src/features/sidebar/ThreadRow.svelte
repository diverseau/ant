<script lang="ts">
  import Ant from '../../lib/ant/Ant.svelte'
  import AntStack from '../../lib/ant/AntStack.svelte'
  import { fmtTime } from '../../lib/format'
  import { app, colonyById, needsAttention, preview, renameAnt, select, threadMembers, threadTitle } from '../../lib/store.svelte'
  import type { Thread } from '../../lib/types'

  interface Props {
    thread: Thread
    collapsed: boolean
    renaming: boolean
    onrenamed: () => void
    onrequestrename: () => void
    oncontext: (e: MouseEvent) => void
    el?: HTMLElement
  }

  let { thread, collapsed, renaming, onrenamed, onrequestrename, oncontext, el = $bindable() }: Props = $props()

  const members = $derived(threadMembers(thread))
  const ant = $derived(thread.kind === 'ant' ? members[0] : undefined)
  const title = $derived(threadTitle(thread))
  const selected = $derived(app.selectedId === thread.id)
  const attention = $derived(needsAttention(thread))
  const working = $derived(!!app.typing[thread.id] || ant?.status === 'working')

  let input: HTMLInputElement | undefined = $state()
  $effect(() => {
    if (renaming && input) {
      input.focus()
      input.select()
    }
  })

  function commit() {
    const v = input?.value ?? ''
    if (thread.kind === 'ant') renameAnt(thread.refId, v)
    else {
      const c = colonyById(thread.refId)
      if (c && v.trim()) c.name = v.trim()
    }
    onrenamed()
  }
</script>

<button
  bind:this={el}
  class="row"
  class:selected
  class:collapsed
  class:unread={thread.unread > 0}
  aria-current={selected ? 'page' : undefined}
  title={collapsed ? title : undefined}
  onclick={() => select(thread.id)}
  oncontextmenu={(e) => {
    e.preventDefault()
    oncontext(e)
  }}
  ondblclick={() => !collapsed && onrequestrename()}
>
  <div class="avatar">
    {#if ant}
      <Ant color={ant.color} accessory={ant.accessory} status={ant.status} size={40} title={ant.name} />
    {:else}
      <AntStack ants={members} size={40} />
    {/if}
    {#if attention}
      <span class="badge attention" aria-label="Needs attention"></span>
    {:else if working}
      <span class="badge working" aria-label="Working"></span>
    {/if}
  </div>

  {#if !collapsed}
    <div class="text">
      <div class="line1">
        {#if renaming}
          <input
            bind:this={input}
            value={title}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') onrenamed()
            }}
            onblur={commit}
          />
        {:else}
          <span class="name">{title}</span>
          {#if ant?.label}<span class="chip">{ant.label}</span>{/if}
        {/if}
        <span class="time tabular">{fmtTime(thread.updatedAt)}</span>
      </div>
      <div class="line2">
        <span class="preview" class:live={working}>{preview(thread)}</span>
        {#if thread.unread > 0}
          <span class="count tabular">{thread.unread}</span>
        {/if}
      </div>
    </div>
  {/if}
</button>

<style>
  .row {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 9px 10px;
    border-radius: var(--r-lg);
    text-align: left;
    transition:
      background var(--dur) var(--ease-out),
      transform var(--dur-fast) var(--ease-out);
  }

  .row:hover:not(.selected) {
    background: var(--bg-hover);
  }

  .row:active {
    transform: scale(0.985);
  }

  .row.collapsed {
    justify-content: center;
    padding: 8px 0;
  }

  .avatar {
    position: relative;
    flex: none;
    transition: transform var(--dur) var(--ease-spring);
  }

  .row:hover .avatar {
    transform: rotate(-4deg) scale(1.04);
  }

  .badge {
    position: absolute;
    right: -1px;
    bottom: 1px;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    box-shadow: 0 0 0 2.5px var(--bg-sidebar);
    animation: badge-in 420ms var(--ease-spring) both;
  }

  .badge.attention {
    background: var(--accent);
  }

  .badge.attention::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--accent);
    animation: ping 1.8s var(--ease-out) infinite;
  }

  .badge.working {
    background: var(--ok);
  }

  .selected .badge {
    box-shadow: 0 0 0 2.5px var(--bg-selected);
  }

  .text {
    flex: 1;
    min-width: 0;
  }

  .line1,
  .line2 {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .name {
    flex: 0 0 auto;
    max-width: 65%;
    font-size: var(--text-md);
    font-weight: 500;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip {
    flex: 0 100 auto;
    min-width: 0;
    max-width: 92px;
    padding: 1px 6px;
    border-radius: var(--r-sm);
    border: 1px solid var(--border-strong);
    font-size: 10.5px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .time {
    margin-left: auto;
    flex: none;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .unread .time {
    color: var(--unread);
  }

  .line2 {
    margin-top: 2px;
  }

  .preview {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .unread .preview {
    color: var(--text-soft);
  }

  .preview.live {
    background: linear-gradient(90deg, var(--text-muted) 0%, var(--text) 45%, var(--text-muted) 90%);
    background-size: 220% 100%;
    background-clip: text;
    color: transparent;
    animation: shimmer 1.8s linear infinite;
  }

  .count {
    flex: none;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    display: grid;
    place-items: center;
    border-radius: var(--r-full);
    background: var(--unread);
    color: #fff;
    font-size: 10.5px;
    font-weight: 600;
    animation: badge-in 420ms var(--ease-spring) both;
  }

  input {
    flex: 1;
    min-width: 0;
    height: 22px;
    padding: 0 6px;
    margin-left: -6px;
    border-radius: var(--r-sm);
    border: 1px solid var(--border-focus);
    background: var(--bg-input);
    font-size: var(--text-md);
    font-weight: 500;
  }

  @keyframes badge-in {
    from {
      transform: scale(0);
    }
  }

  @keyframes ping {
    0% {
      transform: scale(1);
      opacity: 0.7;
    }
    80%,
    100% {
      transform: scale(2.4);
      opacity: 0;
    }
  }

  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -120% 0;
    }
  }
</style>
