<script lang="ts">
  import Monitor from '@lucide/svelte/icons/monitor'
  import PanelRight from '@lucide/svelte/icons/panel-right'
  import Ant from '../../lib/ant/Ant.svelte'
  import AntStack from '../../lib/ant/AntStack.svelte'
  import { mod } from '../../lib/format'
  import { fade } from 'svelte/transition'
  import { rise } from '../../lib/motion'
  import { app, threadById, threadMembers, threadTitle, togglePanel } from '../../lib/store.svelte'
  import Composer from '../composer/Composer.svelte'
  import MessageList from './MessageList.svelte'

  const thread = $derived(threadById(app.selectedId))
  const members = $derived(thread ? threadMembers(thread) : [])
  const ant = $derived(thread?.kind === 'ant' ? members[0] : undefined)
  const empty = $derived(!!thread && thread.messages.length === 0)

  const status = $derived.by(() => {
    if (!thread) return ''
    const t = app.typing[thread.id]
    if (thread.kind === 'colony') return t ? `${members.find((m) => m.id === t)?.name} is working…` : `${members.length} ants`
    if (!ant) return ''
    if (t || ant.status === 'working') return 'Working…'
    if (ant.status === 'attention') return 'Needs you'
    if (ant.status === 'paused') return 'Paused'
    return ant.label ?? 'Idle'
  })

  const suggestions = $derived(
    ant
      ? [`What can you do, ${ant.name}?`, 'Check the staging site for bugs', 'Draft an email to Mara', '/morning-brief']
      : [],
  )
</script>

{#if thread}
  <section class="chat">
    <header>
      <div class="who">
        {#if ant}
          <Ant color={ant.color} accessory={ant.accessory} status={ant.status} size={26} />
        {:else}
          <AntStack ants={members} size={28} />
        {/if}
        <span class="title">{threadTitle(thread)}</span>
        {#key status}
          <span class="status" class:live={status.endsWith('…')} in:rise={{ y: 4, duration: 240 }}>{status}</span>
        {/key}
      </div>
      <div class="tools">
        <button
          class="icon-btn"
          aria-label="Computer"
          title="Computer"
          aria-pressed={app.panel === 'computer'}
          onclick={() => togglePanel('computer')}
        >
          <Monitor size={17} />
        </button>
        <button
          class="icon-btn"
          aria-label="Details"
          title="Details ({mod}+Alt+B)"
          aria-pressed={app.panel === 'details'}
          onclick={() => togglePanel('details')}
        >
          <PanelRight size={17} />
        </button>
      </div>
    </header>

    {#key thread.id}
      <div class="body" in:rise={{ y: 6, duration: 300 }}>
        {#if empty && ant}
          <div class="hero">
            <div class="hero-ant">
              <Ant color={ant.color} accessory={ant.accessory} mode="full" size={150} follow status="attention" />
            </div>
            <h1>Hi, I'm {ant.name}.</h1>
            <p class="desc">{ant.description}</p>
            <div class="hero-composer">
              <Composer {thread} placeholder="Give {ant.name} its first job…" hero />
            </div>
            <div class="chips">
              {#each suggestions as s, i}
                <button class="chip" style:--i={i} onclick={() => (app.drafts[thread.id] = s)}>{s}</button>
              {/each}
            </div>
          </div>
        {:else}
          <div class="convo" in:fade={{ duration: 260 }}>
            <MessageList {thread} />
            <div class="dock">
              <Composer {thread} placeholder={thread.kind === 'colony' ? `Message ${threadTitle(thread)}, @ to route` : `Message ${threadTitle(thread)}`} />
            </div>
          </div>
        {/if}
      </div>
    {/key}
  </section>
{:else}
  <section class="chat none">
    <p>Pick an ant, or press <span class="kbd">{mod}</span> <span class="kbd">N</span> to hatch one.</p>
  </section>
{/if}

<style>
  .chat {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    background: var(--bg-app);
  }

  .none {
    display: grid;
    place-items: center;
    color: var(--text-muted);
    font-size: var(--text-md);
  }

  header {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    padding: 0 14px 0 20px;
    border-bottom: 1px solid var(--border);
  }

  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .title {
    font-size: var(--text-md);
    font-weight: 500;
    white-space: nowrap;
  }

  .status {
    font-size: var(--text-sm);
    color: var(--text-faint);
    white-space: nowrap;
  }

  .status.live {
    color: var(--warn);
  }

  .tools {
    display: flex;
    gap: 4px;
  }

  .body {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .convo {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .dock {
    flex: none;
    padding: 0 24px 16px;
  }

  .hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 24px 24px 12vh;
    text-align: center;
  }

  .hero-ant {
    margin-bottom: 4px;
    animation: hatch 700ms var(--ease-spring) both;
  }

  h1 {
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 2.1rem;
    letter-spacing: -0.015em;
    animation: up 600ms 120ms var(--ease-out) both;
  }

  .desc {
    max-width: 520px;
    color: var(--text-muted);
    font-size: var(--text-md);
    line-height: 1.6;
    animation: up 600ms 200ms var(--ease-out) both;
  }

  .hero-composer {
    width: 100%;
    max-width: 640px;
    margin-top: 22px;
    text-align: left;
    animation: up 600ms 280ms var(--ease-out) both;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    max-width: 640px;
    margin-top: 14px;
  }

  .chip {
    height: 32px;
    padding: 0 13px;
    border-radius: var(--r-full);
    border: 1px solid var(--border-strong);
    font-size: var(--text-sm);
    color: var(--text-soft);
    animation: up 500ms calc(360ms + var(--i) * 60ms) var(--ease-out) both;
    transition:
      background var(--dur-fast),
      border-color var(--dur-fast),
      transform var(--dur-fast) var(--ease-out);
  }

  .chip:hover {
    background: var(--bg-hover);
    border-color: #4a4948;
    transform: translateY(-1px);
  }

  @keyframes up {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }

  @keyframes hatch {
    from {
      opacity: 0;
      transform: translateY(24px) scale(0.6) rotate(-8deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hero *,
    .chip {
      animation: none !important;
    }
  }
</style>
