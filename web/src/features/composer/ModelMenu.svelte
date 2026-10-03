<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import Search from '@lucide/svelte/icons/search'
  import Star from '@lucide/svelte/icons/star'
  import { MODELS, type ModelInfo } from '@ant/shared'
  import { reduced } from '../../lib/motion'
  import ClaudeMark from '../../lib/ui/ClaudeMark.svelte'

  let { current, onpick, onclose }: { current: string; onpick: (id: string) => void; onclose: () => void } = $props()

  const main = MODELS.filter((m) => !m.legacy)
  const legacy = MODELS.filter((m) => m.legacy)

  // Favourites and the rail tab are per-browser conveniences.
  function load<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key)
      return v ? (JSON.parse(v) as T) : fallback
    } catch {
      return fallback
    }
  }
  function save(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  }

  let favourites: string[] = $state(load('ant.models.favourites', []))
  let tab: 'favourites' | 'claude' = $state(load('ant.models.tab', 'claude'))
  let view: 'main' | 'legacy' = $state(legacy.some((m) => m.id === current) ? 'legacy' : 'main')
  let query = $state('')
  let active = $state(0)
  let dir = $state(1)
  let input: HTMLInputElement | undefined = $state()

  const rows = $derived.by((): ModelInfo[] => {
    const q = query.trim().toLowerCase()
    if (q) return MODELS.filter((m) => m.name.toLowerCase().includes(q) || m.id.includes(q))
    if (tab === 'favourites') return MODELS.filter((m) => favourites.includes(m.id))
    return view === 'legacy' ? legacy : main
  })
  const showLegacyRow = $derived(!query.trim() && tab === 'claude' && view === 'main')
  const count = $derived(rows.length + (showLegacyRow ? 1 : 0))

  $effect(() => {
    void rows
    const i = rows.findIndex((m) => m.id === current)
    active = Math.max(0, i)
  })

  $effect(() => {
    input?.focus()
  })

  function toggleFavourite(id: string) {
    favourites = favourites.includes(id) ? favourites.filter((f) => f !== id) : [...favourites, id]
    save('ant.models.favourites', favourites)
  }

  function setTab(t: typeof tab) {
    tab = t
    view = 'main'
    save('ant.models.tab', t)
    input?.focus()
  }

  function go(v: typeof view) {
    dir = v === 'legacy' ? 1 : -1
    view = v
    input?.focus()
  }

  function choose(i: number) {
    if (i === rows.length && showLegacyRow) return go('legacy')
    const m = rows[i]
    if (m) onpick(m.id)
  }

  function key(e: KeyboardEvent) {
    const shortcut = (e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key) ? main[Number(e.key) - 1] : undefined
    if (shortcut) {
      e.preventDefault()
      onpick(shortcut.id)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (count) active = (active + (e.key === 'ArrowDown' ? 1 : -1) + count) % count
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'ArrowRight' && showLegacyRow && active === rows.length) {
      e.preventDefault()
      go('legacy')
    } else if ((e.key === 'ArrowLeft' && !query) || (e.key === 'Escape' && view === 'legacy' && !query)) {
      if (view !== 'legacy') return
      e.preventDefault()
      go('main')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onclose()
    }
  }

  function slide(_node: Element, { d }: { d: number }) {
    return {
      duration: reduced ? 0 : 240,
      css: (t: number, u: number) => `opacity:${t};transform:translateX(${u * d * 24}px)`,
      easing: (t: number) => 1 - Math.pow(1 - t, 4),
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="menu" onkeydown={key}>
  <nav class="rail" aria-label="Model groups">
    <button class="rail-btn" class:on={tab === 'favourites'} aria-label="Favourites" aria-pressed={tab === 'favourites'} onclick={() => setTab('favourites')}>
      <Star size={17} fill={tab === 'favourites' ? 'currentColor' : 'none'} />
    </button>
    <span class="rail-sep"></span>
    <button class="rail-btn" class:on={tab === 'claude'} aria-label="Claude models" aria-pressed={tab === 'claude'} onclick={() => setTab('claude')}>
      <ClaudeMark size={19} />
    </button>
    <span class="rail-bar" style:transform="translateY({tab === 'favourites' ? 0 : 53}px)"></span>
  </nav>

  <div class="main">
    <label class="search">
      <Search size={15} />
      <input bind:this={input} bind:value={query} placeholder="Search models…" aria-label="Search models" />
    </label>

    {#key `${tab}:${view}:${query.trim() ? 'q' : ''}`}
      <div class="list" role="listbox" aria-label="Models" in:slide={{ d: query.trim() ? 0 : dir }}>
        {#if view === 'legacy' && !query.trim() && tab === 'claude'}
          <button class="back" onclick={() => go('main')}><ChevronLeft size={15} /> Legacy models</button>
        {/if}
        {#each rows as m, i (m.id)}
          {@const shortcut = main.indexOf(m)}
          <div
            class="row"
            role="option"
            tabindex="-1"
            aria-selected={m.id === current}
            class:active={i === active}
            onpointermove={() => (active = i)}
            onclick={() => onpick(m.id)}
            onkeydown={() => {}}
          >
            <div class="text">
              <div class="name">
                {m.name}
                {#if m.isNew}<span class="badge">New</span>{/if}
              </div>
              <div class="provider">
                <ClaudeMark size={12} />
                Claude
              </div>
            </div>
            {#if m.id === current}<span class="current"><Check size={15} /></span>{/if}
            {#if shortcut >= 0}<kbd>Ctrl+{shortcut + 1}</kbd>{/if}
            <button
              class="fav"
              class:on={favourites.includes(m.id)}
              aria-label={favourites.includes(m.id) ? `Unstar ${m.name}` : `Star ${m.name}`}
              onclick={(e) => {
                e.stopPropagation()
                toggleFavourite(m.id)
              }}
            >
              <Star size={15} fill={favourites.includes(m.id) ? 'currentColor' : 'none'} />
            </button>
          </div>
        {:else}
          <div class="empty">{query.trim() ? 'No models match.' : 'Star a model to keep it here.'}</div>
        {/each}
        {#if showLegacyRow}
          <button class="row legacy" class:active={active === rows.length} onpointermove={() => (active = rows.length)} onclick={() => go('legacy')}>
            <div class="text">
              <div class="name">Legacy models</div>
              <div class="provider">{legacy.length} models</div>
            </div>
            <ChevronRight size={16} />
          </button>
        {/if}
      </div>
    {/key}
  </div>
</div>

<style>
  .menu {
    display: flex;
    max-height: inherit;
  }

  .rail {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 50px;
    flex: none;
    padding: 8px 0;
    border-right: 1px solid var(--border);
  }

  .rail-btn {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: var(--r-md);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-fast) var(--ease-out);
  }

  .rail-btn:hover {
    background: var(--bg-active);
    color: var(--text);
  }

  .rail-btn:active {
    transform: scale(0.92);
  }

  .rail-btn.on {
    color: var(--text);
  }

  .rail-sep {
    width: 22px;
    height: 1px;
    margin: 2px 0;
    background: var(--border-strong);
  }

  .rail-bar {
    position: absolute;
    top: 14px;
    right: -1px;
    width: 3px;
    height: 24px;
    border-radius: 3px 0 0 3px;
    background: var(--accent);
    transition: transform 360ms var(--ease-spring);
  }

  .main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 44px;
    flex: none;
    padding: 0 14px;
    border-bottom: 1px solid var(--border);
    color: var(--text-faint);
  }

  .search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    background: transparent;
    font-size: var(--text-md);
    color: var(--text);
    outline: none;
  }

  .search input::placeholder {
    color: var(--text-faint);
  }

  .list {
    flex: 1;
    min-height: 0;
    padding: 6px;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 8px 7px 10px;
    border-radius: var(--r-md);
    text-align: left;
    cursor: pointer;
    transition: background var(--dur-fast);
  }

  .row.active {
    background: var(--bg-active);
  }

  .row[aria-selected='true'] .name {
    color: var(--text);
  }

  .text {
    flex: 1;
    min-width: 0;
  }

  .name {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: var(--text-md);
    color: var(--text-soft);
    white-space: nowrap;
  }

  .badge {
    padding: 1px 6px;
    border-radius: var(--r-sm);
    background: var(--bg-selected);
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text);
  }

  .provider {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 2px;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .current {
    display: grid;
    color: var(--accent);
  }

  kbd {
    font-family: inherit;
    font-size: var(--text-xs);
    color: var(--text-faint);
    white-space: nowrap;
  }

  .fav {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: var(--r-sm);
    color: var(--text-faint);
    opacity: 0.55;
    transition:
      opacity var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur) var(--ease-spring);
  }

  .row.active .fav,
  .fav:focus-visible {
    opacity: 1;
  }

  .fav:hover {
    color: var(--text);
  }

  .fav:active {
    transform: scale(0.8);
  }

  .fav.on {
    opacity: 1;
    color: var(--warn);
  }

  .legacy {
    color: var(--text-muted);
  }

  .back {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    height: 30px;
    padding: 0 6px;
    margin-bottom: 2px;
    border-radius: var(--r-sm);
    font-size: var(--text-xs);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      color var(--dur-fast);
  }

  .back:hover {
    background: var(--bg-active);
    color: var(--text);
  }

  .empty {
    padding: 22px 12px;
    text-align: center;
    font-size: var(--text-sm);
    color: var(--text-faint);
  }
</style>
