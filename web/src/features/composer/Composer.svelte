<script lang="ts">
  import ArrowUp from '@lucide/svelte/icons/arrow-up'
  import Mic from '@lucide/svelte/icons/mic'
  import Plus from '@lucide/svelte/icons/plus'
  import Square from '@lucide/svelte/icons/square'
  import Paperclip from '@lucide/svelte/icons/paperclip'
  import Camera from '@lucide/svelte/icons/camera'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Plug from '@lucide/svelte/icons/plug'
  import { tick } from 'svelte'
  import Ant from '../../lib/ant/Ant.svelte'
  import { connectors, skills as mockSkills } from '../../lib/mock/data'
  import { pop, popOut } from '../../lib/motion'
  import { app, notify, send, stop, threadMembers } from '../../lib/store.svelte'
  import type { Thread } from '../../lib/types'
  import Menu, { type MenuItem } from '../../lib/ui/Menu.svelte'
  import RunOptions from './RunOptions.svelte'

  let { thread, placeholder, hero = false }: { thread: Thread; placeholder: string; hero?: boolean } = $props()

  let ta: HTMLTextAreaElement | undefined = $state()
  let caret = $state(0)
  let active = $state(0)
  let dismissed = $state('')
  let listening = $state(false)
  let menu: { x: number; y: number; items: MenuItem[] } | null = $state(null)

  const value = $derived(app.drafts[thread.id] ?? '')
  const working = $derived(!!app.typing[thread.id])
  const ant = $derived(thread.kind === 'ant' ? app.ants.find((a) => a.id === thread.refId) : undefined)
  // Attachments: uploaded straight away into the ant's inbox/, named in the message on send.
  type Attachment = { id: string; name: string; path?: string; bytes: number; state: 'uploading' | 'ready' | 'error'; error?: string }
  let attachments: Attachment[] = $state([])
  let fileInput: HTMLInputElement | undefined = $state()
  let dragging = $state(false)
  const uploading = $derived(attachments.some((a) => a.state === 'uploading'))
  const canSend = $derived((value.trim().length > 0 || attachments.some((a) => a.state === 'ready')) && !uploading)

  async function addFiles(list: FileList | File[] | null) {
    const files = [...(list ?? [])]
    if (!files.length) return
    if (app.mode !== 'live') {
      notify('Attachments need antd running.')
      return
    }
    for (const f of files.slice(0, 6 - attachments.length)) {
      const a: Attachment = { id: crypto.randomUUID(), name: f.name, bytes: f.size, state: 'uploading' }
      attachments.push(a)
      const live = attachments[attachments.length - 1]
      const form = new FormData()
      form.append('file', f)
      fetch(`/api/threads/${thread.id}/attachments`, { method: 'POST', body: form })
        .then(async (r) => {
          const j = await r.json()
          if (!r.ok) throw new Error(j.error ?? 'Upload failed')
          live.path = j.files[0].path
          live.name = j.files[0].name
          live.state = 'ready'
        })
        .catch((err) => {
          live.state = 'error'
          live.error = String(err.message ?? err)
        })
    }
  }

  function removeAttachment(id: string) {
    attachments = attachments.filter((a) => a.id !== id)
  }

  type Option = { key: string; label: string; sub: string; insert: string; ant?: (typeof app.ants)[number]; icon?: 'skill' | 'plug' }

  const trigger = $derived.by(() => {
    const m = value.slice(0, caret).match(/(^|\s)([/@])([\w-]*)$/)
    if (!m) return null
    return { ch: m[2] as '/' | '@', q: m[3].toLowerCase(), start: caret - m[3].length - 1 }
  })

  const options = $derived.by((): Option[] => {
    if (!trigger || `${trigger.ch}${trigger.start}` === dismissed) return []
    const q = trigger.q
    if (trigger.ch === '/') {
      if (trigger.start !== 0) return []
      return (app.mode === 'live' ? app.skills.map((s) => ({ id: s.name, name: s.name, description: s.description })) : mockSkills)
        .filter((s) => s.name.includes(q))
        .map((s) => ({ key: s.id, label: `/${s.name}`, sub: s.description, insert: `/${s.name} `, icon: 'skill' as const }))
    }
    const people = (thread.kind === 'colony' ? threadMembers(thread) : app.ants)
      .filter((a) => a.name.toLowerCase().startsWith(q))
      .map((a) => ({ key: a.id, label: a.name, sub: a.label ?? 'Ant', insert: `@${a.name} `, ant: a }))
    const tools = connectors
      .filter((c) => c.installed && c.name.toLowerCase().startsWith(q))
      .map((c) => ({ key: c.id, label: c.name, sub: 'Connector', insert: `@${c.name.replace(/\s/g, '')} `, icon: 'plug' as const }))
    return [...people, ...tools].slice(0, 7)
  })

  $effect(() => {
    void options.length
    active = 0
  })

  function set(v: string) {
    app.drafts[thread.id] = v
  }

  function resize() {
    if (!ta) return
    const prev = ta.style.height
    ta.style.height = 'auto'
    const next = Math.min(ta.scrollHeight, 260) + 'px'
    ta.style.height = prev
    // Next frame so the height transition can run.
    requestAnimationFrame(() => ta && (ta.style.height = next))
  }

  $effect(() => {
    void value
    resize()
  })

  function choose(o: Option) {
    if (!trigger) return
    const before = value.slice(0, trigger.start)
    const after = value.slice(caret)
    const next = before + o.insert + after
    set(next)
    placeCaret(before.length + o.insert.length)
  }

  // Set the caret as soon as Svelte has written the new value, before any
  // further keystrokes can land.
  async function placeCaret(pos: number) {
    await tick()
    ta?.focus()
    ta?.setSelectionRange(pos, pos)
    caret = pos
  }

  function submit() {
    if (!canSend) return
    const ready = attachments.filter((a) => a.state === 'ready' && a.path)
    const note = ready.length ? `\n\n[Attached: ${ready.map((a) => a.path).join(', ')}]` : ''
    send((value.trim() || 'See the attached files.') + note)
    attachments = []
    listening = false
  }

  function key(e: KeyboardEvent) {
    if (options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        choose(options[active])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        dismissed = `${trigger!.ch}${trigger!.start}`
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  function openAttach(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    menu = {
      x: r.left,
      y: r.top - 150,
      items: [
        { label: 'Upload a file', icon: Paperclip, onclick: () => fileInput?.click() },
        { label: 'Take a screenshot', icon: Camera, onclick: () => {} },
        { label: 'Use a skill', icon: Sparkles, hint: '/', onclick: () => insertTrigger('/') },
        { label: 'Attach a connector', icon: Plug, hint: '@', onclick: () => insertTrigger('@') },
      ],
    }
  }

  function insertTrigger(ch: string) {
    const v = ch === '/' ? '/' + value.replace(/^\//, '') : value + (value && !value.endsWith(' ') ? ' ' : '') + '@'
    set(v)
    placeCaret(ch === '/' ? 1 : v.length)
  }

  function toggleMic() {
    listening = !listening
    if (!listening) return
    // Fake dictation: type a phrase in after a beat.
    const phrase = 'Can you check the staging site for the checkout bug?'
    let i = 0
    const id = setInterval(() => {
      if (!listening || i >= phrase.length) {
        clearInterval(id)
        listening = false
        return
      }
      set(value + phrase[i++])
    }, 28)
  }
</script>

<div class="wrap" class:hero>
  {#if options.length}
    <div class="popover" role="listbox" in:pop={{ from: 0.97 }} out:popOut>
      <div class="pop-title">{trigger?.ch === '/' ? 'Skills' : 'Mention'}</div>
      {#each options as o, i (o.key)}
        <button
          role="option"
          aria-selected={i === active}
          class:active={i === active}
          onpointerenter={() => (active = i)}
          onpointerdown={(e) => {
            e.preventDefault()
            choose(o)
          }}
        >
          <span class="opt-icon">
            {#if o.ant}<Ant color={o.ant.color} size={22} />{:else if o.icon === 'skill'}<Sparkles size={15} />{:else}<Plug size={15} />{/if}
          </span>
          <span class="opt-label">{o.label}</span>
          <span class="opt-sub">{o.sub}</span>
        </button>
      {/each}
    </div>
  {/if}

  <input bind:this={fileInput} type="file" multiple hidden onchange={(e) => { addFiles(e.currentTarget.files); e.currentTarget.value = '' }} />
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="box"
    class:listening
    class:dragging
    ondragover={(e) => { e.preventDefault(); dragging = true }}
    ondragleave={() => (dragging = false)}
    ondrop={(e) => { e.preventDefault(); dragging = false; addFiles(e.dataTransfer?.files ?? null) }}
    onpaste={(e) => { if (e.clipboardData?.files.length) { e.preventDefault(); addFiles(e.clipboardData.files) } }}
  >
    {#if attachments.length}
      <div class="chips">
        {#each attachments as a (a.id)}
          <span class="chip {a.state}" title={a.error ?? a.name} in:pop out:popOut>
            {#if a.state === 'uploading'}<span class="spin"></span>{:else}<Paperclip size={12} />{/if}
            <span class="cname">{a.name}</span>
            <button aria-label="Remove {a.name}" onclick={() => removeAttachment(a.id)}>×</button>
          </span>
        {/each}
      </div>
    {/if}
    <textarea
      bind:this={ta}
      data-composer
      rows="1"
      {placeholder}
      value={value}
      oninput={(e) => {
        set(e.currentTarget.value)
        caret = e.currentTarget.selectionStart
        dismissed = ''
      }}
      onkeydown={key}
      onkeyup={(e) => (caret = e.currentTarget.selectionStart)}
      onclick={(e) => (caret = e.currentTarget.selectionStart)}
    ></textarea>

    <div class="bar">
      <button class="round ghost" aria-label="Add" onclick={openAttach}><Plus size={18} /></button>
      {#if listening}
        <div class="wave" in:pop out:popOut aria-label="Listening">
          {#each Array(14) as _, i}<i style:--i={i}></i>{/each}
        </div>
      {/if}
      <div class="right">
        <button class="round ghost" class:on={listening} aria-label="Dictate" aria-pressed={listening} onclick={toggleMic}>
          <Mic size={17} />
        </button>
        <div class="morph">
          {#if working && !canSend}
            <button class="round stop" aria-label="Stop" title="Stop now" onclick={() => stop(thread.id)} in:pop out:popOut>
              <Square size={12} fill="currentColor" />
            </button>
          {:else}
            <button class="round send" aria-label="Send" disabled={!canSend} onclick={submit} in:pop out:popOut>
              <ArrowUp size={17} strokeWidth={2.4} />
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="foot">
    {#if ant}
      <RunOptions {ant} busy={working} />
    {:else}
      <span class="colony-note">Each ant keeps its own model and permissions.</span>
    {/if}
  </div>
</div>

{#if menu}
  <Menu {...menu} onclose={() => (menu = null)} />
{/if}

<style>
  .wrap {
    position: relative;
    width: 100%;
    max-width: var(--column-w);
    margin: 0 auto;
  }

  .box {
    position: relative;
    border-radius: var(--r-2xl);
    background: var(--bg-raised);
    border: 1px solid var(--border-strong);
    box-shadow: 0 10px 30px -14px rgb(0 0 0 / 0.6);
    transition:
      border-color var(--dur) var(--ease-out),
      box-shadow var(--dur) var(--ease-out);
  }

  .box:focus-within {
    border-color: #4a4948;
    box-shadow:
      0 0 0 4px rgb(255 255 255 / 0.025),
      0 14px 34px -14px rgb(0 0 0 / 0.7);
  }

  .box.dragging {
    border-color: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 12px 14px 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 240px;
    height: 28px;
    padding: 0 4px 0 10px;
    border-radius: var(--r-full);
    background: var(--bg-active);
    font-size: var(--text-xs);
    color: var(--text-soft);
  }

  .chip.error {
    background: rgb(229 96 79 / 0.15);
    color: #f4a69b;
  }

  .cname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip button {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    color: var(--text-muted);
    transition: background var(--dur-fast);
  }

  .chip button:hover {
    background: var(--bg-selected);
    color: var(--text);
  }

  .spin {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 1.5px solid var(--text-faint);
    border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .box.listening {
    border-color: rgb(217 119 87 / 0.5);
  }

  textarea {
    display: block;
    width: 100%;
    height: 52px;
    min-height: 52px;
    max-height: 260px;
    padding: 15px 18px 4px;
    border: 0;
    resize: none;
    background: transparent;
    font-size: 15px;
    line-height: 1.55;
    transition: height 160ms var(--ease-out);
  }

  .hero textarea {
    min-height: 64px;
    height: 64px;
    padding-top: 18px;
  }

  textarea::placeholder {
    color: var(--text-muted);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px 10px;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }

  .round {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-fast) var(--ease-out),
      opacity var(--dur);
  }

  .round:active:not(:disabled) {
    transform: scale(0.9);
  }

  .ghost {
    color: var(--text-muted);
  }

  .ghost:hover {
    background: var(--bg-active);
    color: var(--text);
  }

  .ghost.on {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .morph {
    display: grid;
    width: 34px;
    height: 34px;
  }

  .morph > :global(*) {
    grid-area: 1 / 1;
  }

  .send {
    background: var(--accent);
    color: #141413;
  }

  .send:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .send:disabled {
    background: var(--bg-active);
    color: var(--text-faint);
  }

  .stop {
    background: var(--text);
    color: #141413;
  }

  .wave {
    display: flex;
    align-items: center;
    gap: 3px;
    height: 20px;
  }

  .wave i {
    width: 3px;
    height: 100%;
    border-radius: 2px;
    background: var(--accent);
    animation: wave 0.9s calc(var(--i) * -0.13s) ease-in-out infinite;
  }

  .foot {
    display: flex;
    align-items: center;
    min-height: 28px;
    padding: 6px 2px 0;
  }

  .colony-note {
    padding: 0 8px;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .popover {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% - 22px);
    z-index: 20;
    max-width: 420px;
    padding: 6px;
    border-radius: var(--r-xl);
    background: #1c1c1b;
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    transform-origin: bottom left;
  }

  .hero .popover {
    bottom: auto;
    top: calc(100% + 6px);
    transform-origin: top left;
  }

  .pop-title {
    padding: 4px 8px 6px;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .popover button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 38px;
    padding: 0 8px;
    border-radius: var(--r-md);
    text-align: left;
    transition: background var(--dur-fast);
  }

  .popover button.active {
    background: var(--bg-active);
  }

  .opt-icon {
    display: grid;
    place-items: center;
    width: 24px;
    color: var(--accent);
  }

  .opt-label {
    font-size: var(--text-md);
    font-weight: 500;
  }

  .opt-sub {
    margin-left: auto;
    font-size: var(--text-xs);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @keyframes wave {
    0%,
    100% {
      transform: scaleY(0.25);
    }
    50% {
      transform: scaleY(1);
    }
  }
</style>
