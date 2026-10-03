<script lang="ts">
  // A brand's real logo (downloaded and cached by antd), with the letter tile as fallback.
  let { name, domain, size = 28 }: { name: string; domain: string | null; size?: number } = $props()

  let failed = $state(false)
  let loaded = $state(false)

  $effect(() => {
    void domain
    failed = false
    loaded = false
  })
</script>

<span class="logo" class:has-img={loaded && !failed} style:width="{size}px" style:height="{size}px" style:font-size="{Math.round(size * 0.46)}px">
  {#if domain && !failed}
    <img
      src="/api/logos/{domain}"
      alt=""
      class:loaded
      onload={() => (loaded = true)}
      onerror={() => (failed = true)}
    />
  {/if}
  {#if !domain || failed || !loaded}<span class="letter" class:hidden={domain && !failed}>{name.charAt(0).toUpperCase()}</span>{/if}
</span>

<style>
  .logo {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    overflow: hidden;
    border-radius: var(--r-md);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
    transition: background var(--dur) var(--ease-out);
  }

  .logo.has-img {
    background: transparent;
  }

  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transform: scale(0.9);
    transition:
      opacity var(--dur) var(--ease-out),
      transform var(--dur-slow) var(--ease-spring);
  }

  img.loaded {
    opacity: 1;
    transform: none;
  }

  .letter.hidden {
    opacity: 0;
  }
</style>
