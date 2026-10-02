<script lang="ts">
  import ArrowDown from '@lucide/svelte/icons/arrow-down'
  import Copy from '@lucide/svelte/icons/copy'
  import Paperclip from '@lucide/svelte/icons/paperclip'
  import ThumbsUp from '@lucide/svelte/icons/thumbs-up'
  import ThumbsDown from '@lucide/svelte/icons/thumbs-down'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import Check from '@lucide/svelte/icons/check'
  import { tick } from 'svelte'
  import Ant from '../../lib/ant/Ant.svelte'
  import { clock } from '../../lib/format'
  import { pop, popOut, rise } from '../../lib/motion'
  import { antById, app, loadOlder } from '../../lib/store.svelte'
  import type { Message, Thread, ToolMessage } from '../../lib/types'
  import RichText from './RichText.svelte'
  import ApprovalCard from './cards/ApprovalCard.svelte'
  import ChecklistCard from './cards/ChecklistCard.svelte'
  import ComputerCard from './cards/ComputerCard.svelte'
  import DraftCard from './cards/DraftCard.svelte'
  import ToolGroup from './cards/ToolGroup.svelte'
  import FileCard from './cards/FileCard.svelte'
  import ErrorCard from './cards/ErrorCard.svelte'

  let { thread }: { thread: Thread } = $props()

  const colony = $derived(thread.kind === 'colony')
  const GAP = 5 * 60_000
  const same = (a?: Message, b?: Message) =>
    !!a && !!b && a.author === b.author && a.author !== 'system' && a.kind !== 'system' && b.kind !== 'system' && Math.abs(b.at - a.at) < GAP

  // Keep the first tool's key while its consecutive run grows.
  const rows = $derived.by(() => {
    const grouped: { m: Message; tools: ToolMessage[]; end: Message }[] = []
    for (const m of thread.messages) {
      const prev = grouped.at(-1)
      if (m.kind === 'tool' && prev?.m.kind === 'tool' && prev.m.author === m.author) {
        prev.tools.push(m)
        prev.end = m
      } else {
        grouped.push({ m, tools: m.kind === 'tool' ? [m] : [], end: m })
      }
    }
    return grouped
  })

  const typingId = $derived(app.typing[thread.id])
  const last = $derived(thread.messages.at(-1))
  const showTyping = $derived(!!typingId && !(last?.kind === 'text' && last.streaming))

  /** User messages end with "[Attached: inbox/a.png, …]" (composer); show those as chips. */
  function splitAttached(text: string): { text: string; files: string[] } | null {
    const m = text.match(/\n*\[Attached: ([^\]]+)\]\s*$/)
    if (!m) return null
    return { text: text.slice(0, m.index).trim() || ' ', files: m[1].split(',').map((f) => f.trim()).filter(Boolean) }
  }

  function openAttachment(path: string) {
    if (app.mode !== 'live') return
    const antId = thread.kind === 'ant' ? thread.refId : (app.colonies.find((c) => c.id === thread.refId)?.memberIds[0] ?? '')
    app.viewer = { antId, path, name: path.split('/').pop() ?? path }
  }

  let scroller: HTMLDivElement | undefined = $state()
  let focused: string | null = $state(null)

  // Jump to a message picked from search, then let the highlight fade.
  $effect(() => {
    const id = app.focusMessage
    if (!id || !scroller) return
    tick().then(() => {
      const el = scroller?.querySelector<HTMLElement>(`[data-mid="${id}"]`)
      if (!el) return
      atBottom = false
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      focused = id
      app.focusMessage = null
      setTimeout(() => (focused = null), 2200)
    })
  })
  let atBottom = $state(true)
  let copied: string | null = $state(null)

  function onScroll() {
    if (!scroller) return
    atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80
    if (scroller.scrollTop < 200) void older()
  }

  // Keep the reader's place when history is prepended above them.
  async function older() {
    if (!scroller) return
    const before = scroller.scrollHeight
    const added = await loadOlder(thread.id)
    if (!added || !scroller) return
    await tick()
    scroller.scrollTop += scroller.scrollHeight - before
  }

  function toBottom(smooth = true) {
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'instant' })
  }

  // Follow new content while the reader is at the bottom.
  $effect(() => {
    void thread.messages.length
    void (last?.kind === 'text' ? last.text.length : 0)
    void showTyping
    if (!atBottom) return
    tick().then(() => toBottom(!(last?.kind === 'text' && last.streaming)))
  })

  $effect(() => {
    if (scroller) toBottom(false)
  })

  function copy(m: Message) {
    if (m.kind !== 'text') return
    navigator.clipboard?.writeText(m.text)
    copied = m.id
    setTimeout(() => (copied = null), 1400)
  }
</script>

<div class="scroller" bind:this={scroller} onscroll={onScroll}>
  <div class="column">
    {#each rows as row, i (row.m.id)}
      {@const m = row.m}
      {@const prev = rows[i - 1]?.end}
      {@const next = rows[i + 1]?.m}
      {@const ant = m.author !== 'user' && m.author !== 'system' ? antById(m.author) : undefined}
      {@const first = !same(prev, m)}
      {@const lastInGroup = !same(row.end, next)}

      <div class="msg" class:first class:user={m.author === 'user' && m.kind !== 'tool'} class:colony class:focused={focused === m.id} data-mid={m.id} in:rise>
        {#if m.kind === 'system'}
          <div class="system">{m.text}</div>
        {:else if m.kind === 'routine'}
          <div class="system">
            <span class="routine {m.result}"><span class="dot"></span>Ran <strong>{m.name}</strong> · {m.result} · {clock(m.at)}</span>
          </div>
        {:else}
          {#if colony && ant && first}
            <div class="sender">{ant.name}</div>
          {/if}
          <div class="line">
            {#if colony && m.author !== 'user'}
              <div class="gutter">
                {#if lastInGroup && ant}
                  <Ant color={ant.color} size={30} status={ant.status} />
                {/if}
              </div>
            {/if}
            <div class="content">
              {#if m.kind === 'text'}
                <div class="bubble" class:mine={m.author === 'user'}>
                  {@const att = m.author === 'user' ? splitAttached(m.text) : null}
                  <RichText text={att ? att.text : m.text} streaming={m.streaming} />
                  {#if att?.files.length}
                    <div class="att">
                      {#each att.files as f}
                        <button class="att-chip" onclick={() => openAttachment(f)}><Paperclip size={12} />{f.split('/').pop()}</button>
                      {/each}
                    </div>
                  {/if}
                  {#if m.author !== 'user' && !m.streaming && m !== last}
                    <div class="hoverbar">
                      <button class="icon-btn sm" aria-label="Copy" onclick={() => copy(m)}>
                        {#if copied === m.id}<span in:pop><Check size={14} /></span>{:else}<Copy size={14} />{/if}
                      </button>
                      <button class="icon-btn sm" aria-label="Good response"><ThumbsUp size={14} /></button>
                      <button class="icon-btn sm" aria-label="Bad response"><ThumbsDown size={14} /></button>
                      <span class="time tabular">{clock(m.at)}</span>
                    </div>
                  {/if}
                </div>
                {#if m.author !== 'user' && !m.streaming && m === last}
                  <div class="actions">
                    <button class="icon-btn sm" aria-label="Copy" onclick={() => copy(m)}>
                      {#if copied === m.id}<span in:pop><Check size={14} /></span>{:else}<Copy size={14} />{/if}
                    </button>
                    <button class="icon-btn sm" aria-label="Good response"><ThumbsUp size={14} /></button>
                    <button class="icon-btn sm" aria-label="Bad response"><ThumbsDown size={14} /></button>
                    <button class="icon-btn sm" aria-label="Retry"><RotateCcw size={14} /></button>
                    <span class="time tabular">{clock(m.at)}</span>
                  </div>
                {/if}
              {:else if m.kind === 'computer'}
                <ComputerCard {m} />
              {:else if m.kind === 'checklist'}
                <ChecklistCard {m} />
              {:else if m.kind === 'approval'}
                <ApprovalCard {m} threadId={thread.id} />
              {:else if m.kind === 'draft'}
                <DraftCard {m} threadId={thread.id} />
              {:else if m.kind === 'tool'}
                <ToolGroup messages={row.tools} />
              {:else if m.kind === 'file'}
                <FileCard {m} onopen={(path) => app.mode === 'live' && (app.viewer = { antId: m.author, path, name: m.name })} />
              {:else if m.kind === 'error'}
                <ErrorCard {m} />
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}

    {#if showTyping && typingId}
      {@const ant = antById(typingId)}
      {#if ant}
        <div class="msg first typing-row" class:colony in:rise out:popOut>
          <div class="line">
            <div class="gutter"><Ant color={ant.color} size={30} status="working" /></div>
            <div class="typing" aria-label="{ant.name} is working">
              <i></i><i></i><i></i>
            </div>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if !atBottom}
  <button class="jump" onclick={() => toBottom()} in:pop out:popOut aria-label="Jump to latest">
    <ArrowDown size={16} />
  </button>
{/if}

<style>
  .scroller {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overflow-anchor: none;
    padding: 20px 24px 28px;
  }

  .column {
    max-width: var(--column-w);
    margin: 0 auto;
  }

  .msg {
    margin-top: 4px;
  }

  .msg {
    border-radius: var(--r-xl);
    transition: background 600ms var(--ease-out), box-shadow 600ms var(--ease-out);
  }

  .msg.focused {
    background: var(--accent-soft);
    box-shadow: 0 0 0 8px var(--accent-soft);
  }

  .msg.first {
    margin-top: 18px;
  }

  .sender {
    margin: 0 0 5px 42px;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .line {
    display: flex;
    align-items: flex-end;
    gap: 12px;
  }

  .gutter {
    flex: none;
    width: 30px;
    padding-bottom: 2px;
  }

  .content {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    max-width: 100%;
  }

  .user .line {
    justify-content: flex-end;
  }

  .user .content {
    align-items: flex-end;
    max-width: 82%;
  }

  .bubble {
    position: relative;
    padding: 10px 15px;
    border-radius: var(--r-2xl);
    background: var(--bg-bubble);
    max-width: 100%;
  }

  .att {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 8px;
  }

  .att-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-full);
    background: rgb(255 255 255 / 0.08);
    font-size: var(--text-xs);
    color: var(--text-soft);
    transition: background var(--dur-fast), transform var(--dur-fast) var(--ease-out);
  }

  .att-chip:hover {
    background: rgb(255 255 255 / 0.14);
    transform: translateY(-1px);
  }

  .bubble.mine {
    background: var(--bg-selected);
    border-bottom-right-radius: 8px;
  }

  .bubble.mine :global(.rich) {
    font-family: var(--font-ui);
    font-size: 14.5px;
  }

  .colony .content :global(.bubble:not(.mine)) {
    border-bottom-left-radius: 8px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-top: 4px;
    margin-left: 4px;
    animation: fade-up 300ms 120ms var(--ease-out) both;
  }

  .hoverbar {
    position: absolute;
    top: -16px;
    right: 10px;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 2px 8px 2px 2px;
    border-radius: var(--r-md);
    background: #1c1c1b;
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-md);
    opacity: 0;
    transform: translateY(4px) scale(0.96);
    transform-origin: right bottom;
    pointer-events: none;
    transition:
      opacity 160ms var(--ease-out),
      transform 220ms var(--ease-out);
  }

  .bubble:hover .hoverbar,
  .hoverbar:focus-within {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }

  .hoverbar .time {
    margin-left: 4px;
  }

  @keyframes fade-up {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }

  .icon-btn.sm {
    width: 28px;
    height: 28px;
  }

  .icon-btn.sm span {
    display: grid;
  }

  .time {
    margin-left: 8px;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .system {
    display: flex;
    justify-content: center;
    margin: 6px 0;
    font-size: var(--text-sm);
    color: var(--text-faint);
    text-align: center;
  }

  .routine {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 4px 12px;
    border-radius: var(--r-full);
    border: 1px solid var(--border);
    text-transform: none;
  }

  .routine strong {
    font-weight: 500;
    color: var(--text-soft);
  }

  .routine .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ok);
  }

  .routine.failed .dot {
    background: var(--danger);
  }

  .routine.running .dot {
    background: var(--warn);
    animation: blink 1s ease-in-out infinite;
  }

  .typing {
    display: flex;
    gap: 5px;
    padding: 14px 16px;
    border-radius: var(--r-2xl);
    border-bottom-left-radius: 8px;
    background: var(--bg-bubble);
  }

  .typing i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
    animation: dot 1.2s ease-in-out infinite;
  }

  .typing i:nth-child(2) {
    animation-delay: 0.15s;
  }

  .typing i:nth-child(3) {
    animation-delay: 0.3s;
  }

  .jump {
    position: absolute;
    left: 50%;
    bottom: 132px;
    translate: -50% 0;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--bg-raised);
    border: 1px solid var(--border-strong);
    color: var(--text-soft);
    box-shadow: var(--shadow-md);
    transition: background var(--dur-fast);
    z-index: 5;
  }

  .jump:hover {
    background: var(--bg-active);
  }

  @keyframes dot {
    0%,
    60%,
    100% {
      transform: translateY(0);
      opacity: 0.45;
    }
    30% {
      transform: translateY(-5px);
      opacity: 1;
    }
  }

  @keyframes blink {
    50% {
      opacity: 0.3;
    }
  }
</style>
