<script lang="ts">
  import Pin from '@lucide/svelte/icons/pin'
  import PinOff from '@lucide/svelte/icons/pin-off'
  import Pencil from '@lucide/svelte/icons/pencil'
  import Trash from '@lucide/svelte/icons/trash-2'
  import PanelLeft from '@lucide/svelte/icons/panel-left'
  import Plus from '@lucide/svelte/icons/plus'
  import Search from '@lucide/svelte/icons/search'
  import Plug from '@lucide/svelte/icons/plug'
  import Settings from '@lucide/svelte/icons/settings-2'
  import { tick } from 'svelte'
  import { flip } from 'svelte/animate'
  import { Spring } from 'svelte/motion'
  import { mod } from '../../lib/format'
  import { collapse, rise } from '../../lib/motion'
  import { app, deleteThread, sortedThreads, togglePin } from '../../lib/store.svelte'
  import Menu, { type MenuItem } from '../../lib/ui/Menu.svelte'
  import UsageRing from '../../lib/ui/UsageRing.svelte'
  import ThreadRow from './ThreadRow.svelte'

  const sorted = $derived(sortedThreads())
  const pinned = $derived(sorted.filter((t) => t.pinned))
  const rest = $derived(sorted.filter((t) => !t.pinned))

  let rows: Record<string, HTMLElement | undefined> = $state({})
  let list: HTMLElement | undefined = $state()
  const pill = new Spring({ top: 0, height: 58, opacity: 0 }, { stiffness: 0.18, damping: 0.72 })

  let menu: { x: number; y: number; items: MenuItem[] } | null = $state(null)
  let renamingId: string | null = $state(null)

  async function place(instant = false, tries = 0) {
    await tick()
    await new Promise(requestAnimationFrame)
    const el = rows[app.selectedId]
    if (!el?.isConnected || !el.offsetParent || !list) {
      if (tries < 10) return place(instant, tries + 1)
      pill.target = { ...pill.target, opacity: 0 }
      return
    }
    // Measure the row's wrapper: while animate:flip runs, the wrapper is
    // transformed and becomes the row's offsetParent. Its own offsetTop is
    // the final layout position, ignoring the in-flight transform.
    const box = el.parentElement ?? el
    const next = { top: box.offsetTop, height: el.offsetHeight, opacity: 1 }
    if (instant || pill.current.opacity === 0) pill.set(next, { instant: true })
    else pill.target = next
  }

  $effect(() => {
    // Re-run when selection, order or density changes.
    void app.selectedId
    void sorted.map((t) => t.id).join()
    void app.sidebarCollapsed
    place()
  })

  $effect(() => {
    if (!list) return
    const ro = new ResizeObserver(() => place(true))
    ro.observe(list)
    return () => ro.disconnect()
  })

  function openMenu(e: MouseEvent, id: string) {
    const t = sorted.find((x) => x.id === id)!
    menu = {
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: t.pinned ? 'Unpin' : 'Pin to top', icon: t.pinned ? PinOff : Pin, onclick: () => togglePin(id) },
        { label: 'Rename', icon: Pencil, onclick: () => (renamingId = id) },
        { label: 'Delete', icon: Trash, danger: true, onclick: () => deleteThread(id) },
      ],
    }
  }
</script>

<aside class="sidebar" class:collapsed={app.sidebarCollapsed}>
  <header>
    <button
      class="icon-btn"
      aria-label="Toggle sidebar"
      title="Toggle sidebar ({mod}+B)"
      onclick={() => (app.sidebarCollapsed = !app.sidebarCollapsed)}
    >
      <PanelLeft size={17} />
    </button>
    {#if !app.sidebarCollapsed}
      <span class="wordmark" in:rise={{ y: 4, duration: 260 }}>ant</span>
      <button class="icon-btn new" aria-label="New ant" title="New ant ({mod}+N)" onclick={() => (app.overlay = 'new-ant')}>
        <Plus size={18} />
      </button>
    {/if}
  </header>

  <button class="search" onclick={() => (app.overlay = 'palette')} title="Search ({mod}+K)">
    <Search size={15} />
    {#if !app.sidebarCollapsed}
      <span class="label">Search</span>
      <span class="kbd">{mod}</span><span class="kbd">K</span>
    {/if}
  </button>

  <div class="scroll">
    <div class="list" bind:this={list}>
      <div
        class="pill"
        style:transform="translateY({pill.current.top}px)"
        style:height="{pill.current.height}px"
        style:opacity={pill.current.opacity}
      ></div>

      {#if pinned.length}
        {#if !app.sidebarCollapsed}<div class="section">Pinned</div>{/if}
        {#each pinned as t (t.id)}
          <div animate:flip={{ duration: 380 }} in:rise={{ y: -8 }} out:collapse>
            <ThreadRow
              thread={t}
              collapsed={app.sidebarCollapsed}
              renaming={renamingId === t.id}
              onrenamed={() => (renamingId = null)}
              onrequestrename={() => (renamingId = t.id)}
              oncontext={(e) => openMenu(e, t.id)}
              bind:el={rows[t.id]}
            />
          </div>
        {/each}
      {/if}

      {#if !app.sidebarCollapsed}<div class="section">Ants & colonies</div>{:else}<div class="divider"></div>{/if}
      {#each rest as t (t.id)}
        <div animate:flip={{ duration: 380 }} in:rise={{ y: -8 }} out:collapse>
          <ThreadRow
            thread={t}
            collapsed={app.sidebarCollapsed}
            renaming={renamingId === t.id}
            onrenamed={() => (renamingId = null)}
            onrequestrename={() => (renamingId = t.id)}
            oncontext={(e) => openMenu(e, t.id)}
            bind:el={rows[t.id]}
          />
        </div>
      {/each}
    </div>
  </div>

  <footer>
    <button class="nav" title="Connectors" onclick={() => (app.overlay = 'connectors')}>
      <Plug size={16} />
      {#if !app.sidebarCollapsed}<span>Connectors</span>{/if}
    </button>
    <div class="account">
      <span class="me">{app.user.name[0]}</span>
      {#if !app.sidebarCollapsed}
        <span class="who">{app.user.name}<span class="plan"> · {app.user.plan}</span></span>
      {/if}
      {#if app.mode !== 'demo'}
        <button
          class="icon-btn usage"
          aria-label={app.usage?.fiveHour ? `Claude subscription usage: ${Math.round(app.usage.fiveHour.utilization * 100)}% of 5-hour window used. Open usage details.` : 'Claude subscription usage: no data yet. Open usage details.'}
          aria-haspopup="dialog"
          onclick={() => (app.overlay = 'usage')}
        >
          <UsageRing value={app.usage?.fiveHour?.utilization ?? null} size={16} />
        </button>
      {/if}
      {#if !app.sidebarCollapsed}
        <button class="icon-btn" aria-label="Settings" title="Settings ({mod}+,)"><Settings size={16} /></button>
      {/if}
    </div>
  </footer>
</aside>

{#if menu}
  <Menu {...menu} onclose={() => (menu = null)} />
{/if}

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 52px;
    padding: 0 10px 0 12px;
    flex: none;
  }

  .collapsed header {
    justify-content: center;
    padding: 0;
  }

  .wordmark {
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 23px;
    letter-spacing: -0.03em;
    color: var(--text);
    line-height: 1;
    margin-top: -3px;
  }

  .new {
    margin-left: auto;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 36px;
    margin: 2px 10px 8px;
    padding: 0 10px;
    border-radius: var(--r-md);
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: var(--text-md);
    transition:
      border-color var(--dur) var(--ease-out),
      background var(--dur) var(--ease-out);
  }

  .search:hover {
    border-color: var(--border-strong);
    background: #212120;
  }

  .collapsed .search {
    justify-content: center;
    padding: 0;
  }

  .search .label {
    flex: 1;
    text-align: left;
  }

  .search .kbd + .kbd {
    margin-left: -5px;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0 8px 12px;
  }

  .list {
    position: relative;
  }

  .pill {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    border-radius: var(--r-lg);
    background: var(--bg-selected);
    pointer-events: none;
    will-change: transform, height;
  }

  .section {
    position: relative;
    padding: 14px 10px 6px;
    font-size: var(--text-xs);
    color: var(--text-faint);
    font-weight: 500;
    letter-spacing: 0.01em;
  }

  .divider {
    height: 1px;
    margin: 8px 12px;
    background: var(--border);
  }

  footer {
    flex: none;
    border-top: 1px solid var(--border);
    padding: 8px;
  }

  .nav {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border-radius: var(--r-md);
    color: var(--text-soft);
    font-size: var(--text-md);
    transition: background var(--dur-fast);
  }

  .nav:hover {
    background: var(--bg-hover);
  }

  .collapsed .nav {
    justify-content: center;
  }

  .account {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 4px 0 6px;
  }

  .collapsed .account {
    flex-direction: column;
    justify-content: center;
    gap: 6px;
    height: auto;
    padding: 8px 0 0;
  }

  .usage {
    flex: none;
  }

  .collapsed .usage {
    padding: 0;
  }

  .me {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--bg-selected);
    font-size: 11px;
    font-weight: 600;
    color: var(--text-soft);
    flex: none;
  }

  .who {
    flex: 1;
    font-size: var(--text-md);
    color: var(--text);
  }

  .plan {
    color: var(--text-faint);
    font-size: var(--text-sm);
  }
</style>
