<script lang="ts">
  import { reduced } from '../../lib/motion'

  let { site, live = false, compact = false }: { site: string; live?: boolean; compact?: boolean } = $props()

  const targets = [
    { x: 18, y: 26, row: -1 },
    { x: 70, y: 38, row: 0 },
    { x: 70, y: 50, row: 1 },
    { x: 70, y: 62, row: 2 },
    { x: 84, y: 14, row: -1 },
    { x: 70, y: 74, row: 3 },
  ]

  let step = $state(0)
  let clicks = $state(0)
  let done = $state<number[]>([])

  $effect(() => {
    if (!live || reduced) return
    const id = setInterval(() => {
      step = (step + 1) % targets.length
      const t = targets[step]
      setTimeout(() => {
        clicks++
        if (t.row >= 0 && !done.includes(t.row)) done = [...done, t.row]
        if (step === targets.length - 1) setTimeout(() => (done = []), 900)
      }, 520)
    }, 1500)
    return () => clearInterval(id)
  })

  const cur = $derived(targets[step])
  const rows = [0.82, 0.64, 0.74, 0.58, 0.7]
</script>

<div class="screen" class:compact>
  <div class="chrome">
    <span class="dots"><i></i><i></i><i></i></span>
    <span class="url">{site}</span>
  </div>
  <div class="page">
    <div class="side">
      {#each [0.7, 0.5, 0.6, 0.45] as w}<i style:width="{w * 100}%"></i>{/each}
    </div>
    <div class="main">
      <div class="top">
        <i class="title"></i>
        <span class="btn-fake" class:hit={live && step === 4}></span>
      </div>
      {#each rows as w, i}
        <div class="row" class:done={done.includes(i)}>
          <span class="check"></span>
          <i style:width="{w * 60}%"></i>
          <i class="tail"></i>
        </div>
      {/each}
    </div>
    {#if live}
      <div class="cursor" style:left="{cur.x}%" style:top="{cur.y}%">
        {#key clicks}<span class="ripple"></span>{/key}
        <svg viewBox="0 0 16 16" width="15" height="15"><path d="M2 1 L 2 13 L 5.5 9.8 L 8 15 L 10 14 L 7.6 9 L 12.5 9 Z" /></svg>
      </div>
    {/if}
  </div>
</div>

<style>
  .screen {
    --s-bg: #f4f2ee;
    --s-ink: #dcd8d0;
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    border-radius: var(--r-md);
    overflow: hidden;
    background: var(--s-bg);
    box-shadow: 0 0 0 1px rgb(255 255 255 / 0.06);
    container-type: inline-size;
    user-select: none;
  }

  .chrome {
    display: flex;
    align-items: center;
    gap: 3cqw;
    height: 7.5cqw;
    padding: 0 3cqw;
    background: #e6e3dc;
  }

  .dots {
    display: flex;
    gap: 1cqw;
  }

  .dots i {
    width: 1.6cqw;
    height: 1.6cqw;
    border-radius: 50%;
    background: #c9c5bc;
  }

  .url {
    flex: 1;
    max-width: 60%;
    padding: 0.6cqw 2cqw;
    border-radius: 99px;
    background: #f7f5f1;
    color: #85817a;
    font-size: max(7px, 2.6cqw);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .page {
    position: absolute;
    inset: 7.5cqw 0 0;
    display: flex;
  }

  .side {
    width: 22%;
    padding: 4cqw 3cqw;
    display: flex;
    flex-direction: column;
    gap: 2.6cqw;
    background: #ece9e3;
  }

  .side i,
  .main i {
    display: block;
    height: 1.7cqw;
    border-radius: 9px;
    background: var(--s-ink);
  }

  .main {
    flex: 1;
    padding: 4cqw 5cqw;
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4cqw;
  }

  .top .title {
    width: 30%;
    height: 2.6cqw;
    background: #c3beb4;
  }

  .btn-fake {
    width: 13cqw;
    height: 4.4cqw;
    border-radius: 1.2cqw;
    background: #d97757;
    transition:
      transform 160ms var(--ease-out),
      filter 160ms;
  }

  .btn-fake.hit {
    transform: scale(0.94);
    filter: brightness(1.1);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 2.4cqw;
    height: 6cqw;
    border-bottom: 1px solid #e7e3dc;
  }

  .row .tail {
    margin-left: auto;
    width: 10%;
  }

  .check {
    width: 2.6cqw;
    height: 2.6cqw;
    border-radius: 50%;
    border: 0.35cqw solid #cfcac1;
    transition:
      background 260ms var(--ease-out),
      border-color 260ms,
      transform 380ms var(--ease-spring);
  }

  .row.done .check {
    background: #42c28e;
    border-color: #42c28e;
    transform: scale(1.15);
  }

  .row.done i:not(.tail) {
    background: #bfe6d3;
  }

  .row i {
    transition: background 300ms;
  }

  .cursor {
    position: absolute;
    width: 0;
    height: 0;
    transition:
      left 900ms var(--ease-in-out),
      top 900ms var(--ease-in-out);
    pointer-events: none;
  }

  .cursor svg {
    position: absolute;
    left: -2px;
    top: -1px;
    width: max(11px, 3.2cqw);
    height: auto;
    fill: #141413;
    stroke: #fff;
    stroke-width: 1.2;
    filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.35));
  }

  .ripple {
    position: absolute;
    left: -6cqw;
    top: -6cqw;
    width: 12cqw;
    height: 12cqw;
    border-radius: 50%;
    background: rgb(217 119 87 / 0.45);
    animation: ripple 600ms var(--ease-out) both;
  }

  @keyframes ripple {
    from {
      transform: scale(0.1);
      opacity: 1;
    }
    to {
      transform: scale(1);
      opacity: 0;
    }
  }
</style>
