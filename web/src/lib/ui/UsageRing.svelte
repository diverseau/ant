<script lang="ts">
  import { Spring } from 'svelte/motion'
  import { reduced } from '../motion'

  let { value = null, size = 16 }: { value?: number | null; size?: number } = $props()
  const id = $props.id()
  const target = $derived(value !== null && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0)
  const progress = new Spring(0, { stiffness: 0.18, damping: 0.72 })
  const shown = $derived(Math.max(0, Math.min(1, progress.current)))

  $effect(() => {
    progress.set(target, { instant: reduced })
  })
</script>

<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" class:warn={target >= 0.75} class:danger={target >= 0.9}>
  <defs>
    <clipPath id="{id}-right"><rect x="8" width="8" height="16" /></clipPath>
    <clipPath id="{id}-left"><rect width="8" height="16" /></clipPath>
  </defs>
  <circle class="track" cx="8" cy="8" r="6.5" />
  <!-- Rotate clipped semicircles so only transforms change during the spring. -->
  <g clip-path="url(#{id}-right)" opacity={shown > 0 ? 1 : 0}>
    <path d="M8 1.5 A6.5 6.5 0 0 0 8 14.5" transform="rotate({Math.min(shown * 2, 1) * 180} 8 8)" />
  </g>
  <g clip-path="url(#{id}-left)" opacity={shown > 0.5 ? 1 : 0}>
    <path d="M8 1.5 A6.5 6.5 0 0 1 8 14.5" transform="rotate({Math.max(shown * 2 - 1, 0) * 180} 8 8)" />
  </g>
</svg>

<style>
  svg {
    display: block;
    flex: none;
    fill: none;
    stroke: var(--text-muted);
    stroke-width: 2;
  }

  .track {
    stroke: var(--border-strong);
  }

  .warn {
    stroke: var(--warn);
  }

  .danger {
    stroke: var(--danger);
  }
</style>
