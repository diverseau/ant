<script lang="ts">
  import CheckCircle from '@lucide/svelte/icons/circle-check'
  import Globe from '@lucide/svelte/icons/globe'
  import Hand from '@lucide/svelte/icons/hand'
  import Minimize2 from '@lucide/svelte/icons/minimize-2'
  import type { Ant as AntT, ComputerState } from '@ant/shared'
  import { onMount } from 'svelte'
  import Ant from '../../lib/ant/Ant.svelte'
  import { modal, rise } from '../../lib/motion'
  import { setLease } from '../../lib/store.svelte'
  import LiveScreen from './LiveScreen.svelte'

  // Full-screen view of an ant's browser. Watching only; taking over stays a separate choice.
  let { ant, comp, onclose }: { ant: AntT; comp?: ComputerState; onclose: () => void } = $props()

  const control = $derived(comp?.lease === 'user')
  let el: HTMLDivElement | undefined = $state()
  let native = false

  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return { destroy: () => node.remove() }
  }

  onMount(() => {
    // Real full screen where the browser allows it; otherwise the overlay fills the window.
    el?.requestFullscreen?.({ navigationUI: 'hide' }).then(() => (native = true)).catch(() => {})
    const change = () => {
      if (!document.fullscreenElement && native) onclose()
    }
    document.addEventListener('fullscreenchange', change)
    return () => {
      document.removeEventListener('fullscreenchange', change)
      unlockEscape()
      if (document.fullscreenElement === el) document.exitFullscreen().catch(() => {})
    }
  })

  // While you drive in full screen, Esc should reach the page (hold Esc to leave, Chromium).
  type KeyboardLock = { lock?: (keys: string[]) => Promise<void>; unlock?: () => void }
  const keyboard = () => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard
  function unlockEscape() {
    keyboard()?.unlock?.()
  }
  $effect(() => {
    if (control && document.fullscreenElement) keyboard()?.lock?.(['Escape']).catch(() => {})
    else unlockEscape()
  })

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape' && !control) onclose()
  }
</script>

<svelte:window onkeydown={key} />

<div bind:this={el} use:portal class="viewer" role="dialog" aria-modal="true" aria-label="{ant.name}'s computer, full screen" transition:modal={{ duration: 320 }}>
  <header>
    <Ant color={ant.color} size={22} status={ant.status} />
    <div class="who">
      <div class="title">{ant.name}'s computer</div>
      <div class="sub">{control ? 'You are in control' : ant.status === 'working' ? 'Working · watching' : 'Watching'}</div>
    </div>
    <div class="url"><Globe size={13} /><span>{comp?.url && comp.url !== 'about:blank' ? comp.url.replace(/^https?:\/\//, '') : 'New tab'}</span></div>
    <div class="tools">
      {#if comp?.teaching}
        <span class="rec"><span class="dot-rec"></span>Teaching · {comp.teaching.steps} steps</span>
      {/if}
      {#if control}
        <button class="btn btn-primary" onclick={() => setLease(ant.id, 'ant')} in:rise={{ y: 4, duration: 200 }}><CheckCircle size={15} /> I'm done</button>
      {:else}
        <button class="btn btn-ghost" onclick={() => setLease(ant.id, 'user')} in:rise={{ y: 4, duration: 200 }}><Hand size={15} /> Take over</button>
      {/if}
      <button class="icon-btn exit" aria-label="Exit full screen" title="Exit full screen (Esc)" onclick={onclose}><Minimize2 size={17} /></button>
    </div>
  </header>

  <div class="stage">
    <div class="fit" class:control>
      <LiveScreen antId={ant.id} {control} />
    </div>
  </div>
</div>

<style>
  .viewer {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: flex;
    flex-direction: column;
    background: #0b0b0b;
  }

  header {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 56px;
    flex: none;
    padding: 0 14px 0 18px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-sidebar);
  }

  .who {
    flex: none;
  }

  .title {
    font-size: var(--text-md);
    font-weight: 500;
  }

  .sub {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .url {
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 1;
    min-width: 0;
    max-width: 560px;
    height: 30px;
    margin: 0 auto;
    padding: 0 12px;
    border-radius: var(--r-full);
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .url span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }

  .exit {
    width: 34px;
    height: 34px;
  }

  .rec {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-sm);
    color: var(--text-soft);
  }

  .dot-rec {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--danger);
    animation: rec 1.2s ease-in-out infinite;
  }

  .stage {
    display: grid;
    place-items: center;
    flex: 1;
    min-height: 0;
    padding: 20px;
  }

  /* Largest 16:10 box that fits the stage. */
  .fit {
    width: min(100%, calc((100vh - 56px - 40px) * 1.6));
    padding: 3px;
    border-radius: var(--r-lg);
    transition:
      background var(--dur-slow) var(--ease-out),
      box-shadow var(--dur-slow) var(--ease-out);
  }

  .fit.control {
    background: var(--accent);
    box-shadow: 0 0 0 6px var(--accent-soft);
  }

  @keyframes rec {
    50% {
      opacity: 0.35;
      transform: scale(0.8);
    }
  }
</style>
