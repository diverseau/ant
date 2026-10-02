<script lang="ts">
  import type { Snippet } from 'svelte'
  import { fade } from 'svelte/transition'
  import { modal } from '../motion'

  let { onclose, children, width = 560, top = false, label }: { onclose: () => void; children: Snippet; width?: number; top?: boolean; label: string } =
    $props()

  let panel: HTMLDivElement | undefined = $state()
  let opener: Element | null = null

  $effect(() => {
    opener = document.activeElement
    const first = panel?.querySelector<HTMLElement>('[autofocus], input, textarea, button')
    first?.focus()
    return () => (opener as HTMLElement | null)?.focus?.()
  })

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onclose()
    }
    if (e.key === 'Tab' && panel) {
      const f = [...panel.querySelectorAll<HTMLElement>('button, input, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'))
      if (!f.length) return
      const [a, z] = [f[0], f[f.length - 1]]
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault()
        z.focus()
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault()
        a.focus()
      }
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" class:top transition:fade={{ duration: 180 }} onpointerdown={(e) => e.target === e.currentTarget && onclose()} onkeydown={key}>
  <div bind:this={panel} class="panel" style:max-width="{width}px" role="dialog" aria-modal="true" aria-label={label} transition:modal>
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--bg-overlay);
    backdrop-filter: blur(6px) saturate(0.9);
  }

  .backdrop.top {
    place-items: start center;
    padding-top: 14vh;
  }

  .panel {
    width: 100%;
    max-height: 80vh;
    overflow: auto;
    border-radius: var(--r-xl);
    background: #1a1a19;
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
  }
</style>
