<script lang="ts">
  import Chat from './features/chat/Chat.svelte'
  import Connectors from './features/connectors/Connectors.svelte'
  import NewAnt from './features/creator/NewAnt.svelte'
  import NewColony from './features/colony/NewColony.svelte'
  import Palette from './features/palette/Palette.svelte'
  import RightPanel from './features/panel/RightPanel.svelte'
  import Sidebar from './features/sidebar/Sidebar.svelte'
  import UsagePanel from './features/usage/UsagePanel.svelte'
  import Toasts from './lib/ui/Toasts.svelte'
  import FileViewer from './lib/ui/FileViewer.svelte'
  import Settings from './features/settings/Settings.svelte'
  import Pair from './features/auth/Pair.svelte'
  import { app, init, select, selectRelative, sortedThreads, togglePanel } from './lib/store.svelte'

  init()

  function shortcuts(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()

    if (e.key === 'Escape' && app.overlay) {
      app.overlay = null
      return
    }
    if (mod && k === 'k') {
      e.preventDefault()
      app.overlay = app.overlay === 'palette' ? null : 'palette'
    } else if (mod && k === 'n') {
      e.preventDefault()
      app.overlay = 'new-ant'
    } else if (mod && e.altKey && (k === 'b' || e.code === 'KeyB')) {
      e.preventDefault()
      togglePanel('details')
    } else if (mod && k === 'b') {
      e.preventDefault()
      app.sidebarCollapsed = !app.sidebarCollapsed
    } else if (mod && (k === 'i' || k === 'l')) {
      e.preventDefault()
      document.querySelector<HTMLTextAreaElement>('[data-composer]')?.focus()
    } else if (mod && /^[1-9]$/.test(e.key)) {
      const t = sortedThreads()[Number(e.key) - 1]
      if (t) {
        e.preventDefault()
        select(t.id)
      }
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      selectRelative(e.key === 'ArrowUp' ? -1 : 1)
    } else if (mod && e.key === ',') {
      e.preventDefault()
      app.overlay = 'settings'
    } else if (mod && e.shiftKey && k === 'm') {
      e.preventDefault()
      app.overlay = 'connectors'
    }
  }

  // Phone layout: swipe from the left edge of the chat to go back to the ant list.
  let drag = $state(0)
  let swipe: { x: number; y: number; on: boolean } | null = null
  const phone = () => matchMedia('(max-width: 720px)').matches

  function swipeStart(e: TouchEvent) {
    const t = e.touches[0]
    swipe = phone() && app.mobileChat && t.clientX < 28 ? { x: t.clientX, y: t.clientY, on: false } : null
  }
  function swipeMove(e: TouchEvent) {
    if (!swipe) return
    const t = e.touches[0]
    const dx = t.clientX - swipe.x
    if (!swipe.on && Math.abs(t.clientY - swipe.y) > Math.abs(dx)) return void (swipe = null)
    swipe.on = dx > 8
    if (swipe.on) drag = Math.max(0, dx)
  }
  function swipeEnd() {
    if (swipe?.on && drag > innerWidth * 0.33) app.mobileChat = false
    swipe = null
    drag = 0
  }

  $effect(() => {
    // The list is the phone's home screen; the compact sidebar makes no sense there.
    const mq = matchMedia('(max-width: 720px)')
    const apply = () => mq.matches && (app.sidebarCollapsed = false)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  })
</script>

<svelte:window onkeydown={shortcuts} />

{#if app.mode === 'pair'}
  <Pair />
{:else}
<div class="shell" class:collapsed={app.sidebarCollapsed} class:panel={!!app.panel} class:chat-open={app.mobileChat} class:dragging={drag > 0} style:--drag="{drag}px" inert={!!app.overlay}>
  <Sidebar />
  <main ontouchstart={swipeStart} ontouchmove={swipeMove} ontouchend={swipeEnd} ontouchcancel={swipeEnd}>
    <Chat />
  </main>
  <RightPanel />
</div>

<Toasts />

{#if app.viewer}
  <FileViewer />
{/if}

{#if app.overlay === 'palette'}
  <Palette />
{:else if app.overlay === 'new-ant'}
  <NewAnt />
{:else if app.overlay === 'new-colony'}
  <NewColony />
{:else if app.overlay === 'connectors'}
  <Connectors />
{:else if app.overlay === 'settings'}
  <Settings />
{:else if app.overlay === 'usage'}
  <UsagePanel />
{/if}
{/if}

<style>
  .shell {
    --sb: var(--sidebar-w);
    --rp: 0px;
    display: grid;
    grid-template-columns: var(--sb) minmax(0, 1fr) var(--rp);
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
    overflow: hidden;
    transition: grid-template-columns 420ms var(--ease-out);
  }

  .shell.collapsed {
    --sb: var(--sidebar-w-collapsed);
  }

  .shell.panel {
    --rp: var(--panel-w);
  }

  main {
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  @media (max-width: 1100px) {
    .shell.panel {
      --rp: min(var(--panel-w), 46vw);
    }
  }

  /* Narrow screens: the right panel slides over the chat instead of squeezing it. */
  @media (max-width: 960px) {
    .shell.panel {
      --rp: 0px;
    }
  }

  /* Phones: the ant list and the chat are two screens; the chat slides in over the list. */
  @media (max-width: 720px) {
    .shell {
      display: block;
      position: relative;
    }

    .shell > :global(.sidebar),
    main {
      position: absolute;
      inset: 0;
      transition: transform 420ms var(--ease-out);
      will-change: transform;
    }

    .shell > :global(.sidebar) {
      border-right: 0;
    }

    main {
      z-index: 2;
      background: var(--bg-app);
      transform: translateX(100%);
      box-shadow: -12px 0 32px -16px rgb(0 0 0 / 0.7);
    }

    .chat-open main {
      transform: translateX(var(--drag));
    }

    .chat-open > :global(.sidebar) {
      transform: translateX(calc(-28% + var(--drag) * 0.28));
    }

    .dragging main,
    .dragging > :global(.sidebar) {
      transition: none;
    }
  }
</style>
