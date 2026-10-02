<script lang="ts">
  import Chat from './features/chat/Chat.svelte'
  import Connectors from './features/connectors/Connectors.svelte'
  import NewAnt from './features/creator/NewAnt.svelte'
  import Palette from './features/palette/Palette.svelte'
  import RightPanel from './features/panel/RightPanel.svelte'
  import Sidebar from './features/sidebar/Sidebar.svelte'
  import UsagePanel from './features/usage/UsagePanel.svelte'
  import Toasts from './lib/ui/Toasts.svelte'
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
    } else if (mod && e.shiftKey && k === 'm') {
      e.preventDefault()
      app.overlay = 'connectors'
    }
  }
</script>

<svelte:window onkeydown={shortcuts} />

<div class="shell" class:collapsed={app.sidebarCollapsed} class:panel={!!app.panel} inert={!!app.overlay}>
  <Sidebar />
  <main>
    <Chat />
  </main>
  <RightPanel />
</div>

<Toasts />

{#if app.overlay === 'palette'}
  <Palette />
{:else if app.overlay === 'new-ant'}
  <NewAnt />
{:else if app.overlay === 'connectors'}
  <Connectors />
{:else if app.overlay === 'usage'}
  <UsagePanel />
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
</style>
