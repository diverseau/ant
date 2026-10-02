<script lang="ts">
  import Search from '@lucide/svelte/icons/search'
  import Plus from '@lucide/svelte/icons/plus'
  import Monitor from '@lucide/svelte/icons/monitor'
  import PanelLeft from '@lucide/svelte/icons/panel-left'
  import Plug from '@lucide/svelte/icons/plug'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import CornerDownLeft from '@lucide/svelte/icons/corner-down-left'
  import type { Component } from 'svelte'
  import Ant from '../../lib/ant/Ant.svelte'
  import AntStack from '../../lib/ant/AntStack.svelte'
  import { mod } from '../../lib/format'
  import { skills as mockSkills } from '../../lib/mock/data'
  import MessageSquare from '@lucide/svelte/icons/message-square'
  import type { SearchHit } from '@ant/shared'
  import { api } from '../../lib/api'
  import { antById, app, preview, select, sortedThreads, threadById, threadMembers, threadTitle, togglePanel } from '../../lib/store.svelte'
  import type { Thread } from '../../lib/types'
  import Modal from '../../lib/ui/Modal.svelte'

  type Item = { id: string; group: string; label: string; sub?: string; thread?: Thread; icon?: Component<{ size?: number }>; hint?: string; run: () => void }

  let q = $state('')
  let active = $state(0)
  let listEl: HTMLDivElement | undefined = $state()

  const close = () => (app.overlay = null)

  const all = $derived<Item[]>([
    ...sortedThreads().map((t) => ({
      id: t.id,
      group: 'Ants & colonies',
      label: threadTitle(t),
      sub: preview(t),
      thread: t,
      run: () => select(t.id),
    })),
    { id: 'new', group: 'Actions', label: 'New ant', icon: Plus, hint: `${mod} N`, run: () => setTimeout(() => (app.overlay = 'new-ant')) },
    { id: 'computer', group: 'Actions', label: 'Toggle computer panel', icon: Monitor, run: () => togglePanel('computer') },
    { id: 'sidebar', group: 'Actions', label: 'Toggle sidebar', icon: PanelLeft, hint: `${mod} B`, run: () => (app.sidebarCollapsed = !app.sidebarCollapsed) },
    { id: 'connectors', group: 'Actions', label: 'Connectors', icon: Plug, run: () => setTimeout(() => (app.overlay = 'connectors')) },
    ...(app.mode === 'live' ? app.skills.map((s) => ({ id: s.name, name: s.name, description: s.description })) : mockSkills).map((s) => ({
      id: 'skill-' + s.id,
      group: 'Skills',
      label: '/' + s.name,
      sub: s.description,
      icon: Sparkles,
      run: () => (app.drafts[app.selectedId] = `/${s.name} `),
    })),
  ])

  function score(i: Item): number {
    if (!q) return 1
    const s = q.toLowerCase()
    const l = i.label.toLowerCase()
    if (l.startsWith(s)) return 3
    if (l.includes(s)) return 2
    // subsequence match
    let k = 0
    for (const c of l) if (c === s[k]) k++
    if (k === s.length) return 1
    return (i.sub ?? '').toLowerCase().includes(s) ? 0.5 : 0
  }

  // Full-text search over every conversation (live mode only), debounced.
  let hits: SearchHit[] = $state([])
  $effect(() => {
    const term = q.trim()
    if (app.mode !== 'live' || term.length < 2) {
      hits = []
      return
    }
    const t = setTimeout(() => api.search(term).then((h) => (hits = h)).catch(() => (hits = [])), 160)
    return () => clearTimeout(t)
  })

  const hitItems = $derived<Item[]>(
    hits.map((h) => {
      const t = threadById(h.threadId)
      const who = h.author === 'user' ? 'You' : h.author === 'system' ? '' : (antById(h.author)?.name ?? '')
      return {
        id: 'hit-' + h.messageId,
        group: 'Messages',
        label: (t ? threadTitle(t) : 'Chat') + (who ? ` · ${who}` : ''),
        sub: h.snippet.replace(/[\u0001\u0002]/g, ''),
        icon: MessageSquare,
        run: () => {
          select(h.threadId)
          app.focusMessage = h.messageId
        },
      }
    }),
  )

  const results = $derived([
    ...all
      .map((i) => ({ i, s: score(i) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => (q ? b.s - a.s : 0))
      .map((x) => x.i),
    ...hitItems,
  ])

  const groups = $derived.by(() => {
    const g = new Map<string, Item[]>()
    for (const r of results) g.set(r.group, [...(g.get(r.group) ?? []), r])
    return [...g]
  })

  $effect(() => {
    void q
    active = 0
  })

  $effect(() => {
    void active
    listEl?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  })

  function run(i: Item) {
    close()
    i.run()
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(1, results.length)
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      run(results[active])
    }
  }
</script>

<Modal onclose={close} width={600} top label="Search">
  <div class="search">
    <Search size={17} />
    <input bind:value={q} placeholder="Search ants, messages, skills and actions" onkeydown={key} />
    <span class="kbd">esc</span>
  </div>
  <div class="list" bind:this={listEl} role="listbox">
    {#each groups as [group, items]}
      <div class="group">{group}</div>
      {#each items as item (item.id)}
        {@const idx = results.indexOf(item)}
        <button role="option" aria-selected={idx === active} class:active={idx === active} onpointermove={() => (active = idx)} onclick={() => run(item)}>
          <span class="icon">
            {#if item.thread}
              {@const ms = threadMembers(item.thread)}
              {#if item.thread.kind === 'ant' && ms[0]}<Ant color={ms[0].color} size={26} status={ms[0].status} />{:else}<AntStack ants={ms} size={26} />{/if}
            {:else if item.icon}
              <item.icon size={16} />
            {/if}
          </span>
          <span class="label">{item.label}</span>
          {#if item.sub}<span class="sub">{item.sub}</span>{/if}
          {#if item.hint}<span class="hint">{item.hint}</span>{/if}
          {#if idx === active}<span class="enter"><CornerDownLeft size={13} /></span>{/if}
        </button>
      {/each}
    {:else}
      <div class="empty">No matches for “{q}”</div>
    {/each}
  </div>
</Modal>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    height: 54px;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
  }

  input {
    flex: 1;
    height: 100%;
    border: 0;
    background: transparent;
    font-size: 15px;
    color: var(--text);
  }

  input::placeholder {
    color: var(--text-faint);
  }

  .list {
    max-height: 420px;
    overflow-y: auto;
    padding: 6px;
  }

  .group {
    padding: 10px 10px 4px;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    height: 42px;
    padding: 0 10px;
    border-radius: var(--r-md);
    text-align: left;
    transition: background var(--dur-fast);
  }

  button.active {
    background: var(--bg-active);
  }

  .icon {
    display: grid;
    place-items: center;
    width: 26px;
    flex: none;
    color: var(--text-muted);
  }

  .label {
    flex: none;
    font-size: var(--text-md);
    font-weight: 500;
  }

  .sub {
    flex: 1;
    min-width: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hint {
    margin-left: auto;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .enter {
    display: grid;
    margin-left: auto;
    color: var(--text-muted);
    animation: in 200ms var(--ease-out);
  }

  .hint + .enter {
    margin-left: 8px;
  }

  .empty {
    padding: 28px;
    text-align: center;
    font-size: var(--text-md);
    color: var(--text-muted);
  }

  @keyframes in {
    from {
      opacity: 0;
      transform: translateX(-4px);
    }
  }
</style>
