<script lang="ts">
  // The Claude starburst, drawn as rays so it stays crisp at icon sizes.
  let { size = 14 }: { size?: number } = $props()
  const rays = [0, 32, 61, 95, 124, 150, 183, 215, 243, 272, 301, 330]
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
  {#each rays as a, i}
    <rect x="11" y={i % 2 ? 2.6 : 1.4} width="2" height={i % 2 ? 8.4 : 9.6} rx="1" transform="rotate({a} 12 12)" />
  {/each}
</svg>

<style>
  svg {
    flex: none;
    fill: var(--accent);
  }
</style>
