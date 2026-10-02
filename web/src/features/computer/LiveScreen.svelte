<script lang="ts">
  // Live view of an ant's browser over antd's screencast socket. While the user holds the
  // lease, mouse, wheel and keyboard go straight to the page.
  let { antId, control }: { antId: string; control: boolean } = $props()

  let src = $state('')
  let error = $state('')
  let el: HTMLDivElement | undefined = $state()
  let ws: WebSocket | null = null

  $effect(() => {
    const id = antId
    src = ''
    error = ''
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/ants/${id}/screen`
    const sock = new WebSocket(url)
    ws = sock
    sock.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      if (msg.type === 'frame') src = `data:image/jpeg;base64,${msg.data}`
      else if (msg.type === 'error') error = msg.message
    }
    return () => {
      sock.close()
      if (ws === sock) ws = null
    }
  })

  $effect(() => {
    if (control) el?.focus()
  })

  const send = (o: object) => control && ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(o))

  function pos(e: MouseEvent) {
    const r = el!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  const BUTTONS = ['left', 'middle', 'right'] as const
  let lastMove = 0

  function mouse(action: 'mousePressed' | 'mouseReleased' | 'mouseMoved', e: MouseEvent) {
    if (!control) return
    if (action === 'mouseMoved') {
      const now = performance.now()
      if (now - lastMove < 30) return
      lastMove = now
    } else e.preventDefault()
    send({ type: 'mouse', action, ...pos(e), button: BUTTONS[e.button] ?? 'left', clickCount: e.detail || 1 })
  }

  function wheel(e: WheelEvent) {
    if (!control) return
    e.preventDefault()
    send({ type: 'wheel', ...pos(e), dx: e.deltaX, dy: e.deltaY })
  }

  function mods(e: KeyboardEvent) {
    return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0)
  }

  function key(action: 'keyDown' | 'keyUp', e: KeyboardEvent) {
    if (!control) return
    e.preventDefault()
    e.stopPropagation()
    const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey
    send({
      type: 'key',
      action: action === 'keyDown' && !printable ? 'rawKeyDown' : action,
      key: e.key,
      code: e.code,
      keyCode: e.keyCode,
      modifiers: mods(e),
      ...(action === 'keyDown' && printable && { text: e.key }),
      ...(action === 'keyDown' && e.key === 'Enter' && { text: '\r' }),
    })
  }

  function paste(e: ClipboardEvent) {
    if (!control) return
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain')
    if (text) send({ type: 'text', text })
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={el}
  class="screen"
  class:control
  tabindex={control ? 0 : -1}
  role="application"
  aria-label="Ant's browser"
  onmousedown={(e) => mouse('mousePressed', e)}
  onmouseup={(e) => mouse('mouseReleased', e)}
  onmousemove={(e) => mouse('mouseMoved', e)}
  oncontextmenu={(e) => control && e.preventDefault()}
  onwheel={wheel}
  onkeydown={(e) => key('keyDown', e)}
  onkeyup={(e) => key('keyUp', e)}
  onpaste={paste}
>
  {#if src}
    <img {src} alt="" draggable="false" />
  {:else}
    <div class="placeholder">{error || 'Starting the browser…'}</div>
  {/if}
</div>

<style>
  .screen {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    border-radius: var(--r-md);
    overflow: hidden;
    background: #0e0e0e;
    box-shadow: 0 0 0 1px rgb(255 255 255 / 0.06);
    user-select: none;
  }

  .screen.control {
    cursor: default;
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }

  .placeholder {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    text-align: center;
    font-size: var(--text-sm);
    color: var(--text-muted);
    animation: pulse 1.6s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
</style>
