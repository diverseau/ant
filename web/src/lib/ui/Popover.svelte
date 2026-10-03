<script lang="ts">
  import type { Snippet } from 'svelte'
  import { pop, popOut } from '../motion'

  // A menu panel anchored to a trigger: opens above it, flips below when there's no room.
  let {
    anchor,
    onclose,
    children,
    label,
    width,
  }: { anchor: HTMLElement; onclose: () => void; children: Snippet; label: string; width?: number } = $props()

  let el: HTMLDivElement | undefined = $state()
  let pos = $state({ left: 0, y: 0, below: false, ready: false })

  // offset sizes ignore the entrance scale. Above the trigger the panel is pinned by its
  // bottom edge, so content that changes height grows upward, away from the trigger.
  $effect(() => {
    if (!el) return
    const a = anchor.getBoundingClientRect()
    const gap = 8
    const below = a.top - el.offsetHeight - gap < 8 && a.bottom + el.offsetHeight + gap < innerHeight
    pos = {
      left: Math.max(8, Math.min(a.left - 6, innerWidth - el.offsetWidth - 8)),
      y: below ? a.bottom + gap : innerHeight - a.top + gap,
      below,
      ready: true,
    }
  })

  // Render on <body>: a transformed ancestor (e.g. a running entrance animation) would
  // otherwise become the containing block for position: fixed.
  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return { destroy: () => node.remove() }
  }

  function outside(e: PointerEvent) {
    const t = e.target as Node
    if (el?.contains(t) || anchor.contains(t)) return
    onclose()
  }
</script>

<svelte:window onpointerdown={outside} onblur={onclose} onresize={onclose} />

<div
  bind:this={el}
  use:portal
  class="popover"
  class:below={pos.below}
  role="dialog"
  aria-label={label}
  style:left="{pos.left}px"
  style:top={pos.below ? `${pos.y}px` : undefined}
  style:bottom={pos.below ? undefined : `${pos.y}px`}
  style:width={width ? `${width}px` : undefined}
  style:visibility={pos.ready ? 'visible' : 'hidden'}
  in:pop={{ from: 0.96 }}
  out:popOut
>
  {@render children()}
</div>

<style>
  .popover {
    position: fixed;
    z-index: 60;
    max-height: min(440px, calc(100vh - 24px));
    border-radius: var(--r-xl);
    background: #1a1a19;
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    transform-origin: bottom left;
    overflow: hidden;
  }

  .popover.below {
    transform-origin: top left;
  }
</style>
