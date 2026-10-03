<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
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
        <button class="icon-btn back" aria-label="Back to ants" onclick={() => (app.mobileChat = false)}><ChevronLeft size={20} /></button>
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
{:else if app.mode === 'connecting'}
  <section class="chat none"></section>
{:else if app.threads.length === 0}
  <section class="chat none">
    <div class="welcome">
      <div class="hero-ant"><Ant color="coral" accessory="satchel" mode="full" size={170} follow status="attention" /></div>
      <h1>Welcome to your colony</h1>
      <p class="desc">Ants are persistent Claude agents with their own folder, memory and tools. They work while you're away and ask before anything that matters.</p>
      {#if app.health && (!app.health.claude.found || !app.health.claude.loggedIn || !app.health.sandbox.ok)}
        <div class="health">
          {#if !app.health.claude.found}<p>Claude Code isn't installed. Install it, then reload.</p>
          {:else if !app.health.claude.loggedIn}<p>Claude Code isn't signed in. Run <code>claude</code> in a terminal and use <code>/login</code>.</p>{/if}
          {#if !app.health.sandbox.ok}<p>The sandbox needs <code>{app.health.sandbox.missing.join(', ')}</code> installed.</p>{/if}
        </div>
      {/if}
      <button class="btn btn-accent hatch" onclick={() => (app.overlay = 'new-ant')}>Hatch your first ant</button>
      <p class="hint">Their folders live in <code>{app.health?.antHome ?? '~/Ants'}</code></p>
    </div>
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

  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    max-width: 520px;
    padding: 24px;
    text-align: center;
  }

  .welcome h1 {
    color: var(--text);
  }

  .hatch {
    height: 40px;
    margin-top: 18px;
    padding: 0 20px;
    font-size: var(--text-md);
    animation: up 600ms 320ms var(--ease-out) both;
  }

  .hint {
    margin-top: 6px;
    font-size: var(--text-xs);
    color: var(--text-faint);
    animation: up 600ms 400ms var(--ease-out) both;
  }

  .health {
    margin-top: 12px;
    padding: 10px 14px;
    border-radius: var(--r-lg);
    border: 1px solid rgb(242 177 60 / 0.35);
    background: var(--warn-soft);
    color: var(--warn);
    font-size: var(--text-sm);
    text-align: left;
  }

  code {
    font-size: 0.92em;
    color: var(--text-soft);
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

  .back {
    display: none;
  }

  @media (max-width: 720px) {
    header {
      padding: 0 8px 0 4px;
    }

    .back {
      display: grid;
      margin-right: -2px;
    }

    .dock {
      padding: 0 10px calc(10px + env(safe-area-inset-bottom));
    }

    .hero {
      padding: 20px 16px 6vh;
    }
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
