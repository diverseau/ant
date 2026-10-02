<script lang="ts">
  import { Spring } from 'svelte/motion'
  import type { Accessory, AntColor, AntStatus } from '../types'

  interface Props {
    color: AntColor
    size?: number
    mode?: 'head' | 'full'
    status?: AntStatus
    accessory?: Accessory
    /** Pupils track the pointer. */
    follow?: boolean
    /** Static look direction, -1..1 on each axis. */
    look?: { x: number; y: number }
    title?: string
  }

  let { color, size = 40, mode = 'head', status = 'idle', accessory = 'none', follow = false, look = { x: 0.35, y: 0.1 }, title }: Props = $props()

  let svg: SVGSVGElement | undefined = $state()
  const gaze = new Spring({ x: 0.35, y: 0.1 }, { stiffness: 0.12, damping: 0.55 })

  $effect(() => {
    if (!follow) gaze.set(look)
  })

  $effect(() => {
    if (!follow || !svg) return
    const onMove = (e: PointerEvent) => {
      const r = svg!.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      const d = Math.hypot(dx, dy) || 1
      const reach = Math.min(1, d / 260)
      gaze.target = { x: (dx / d) * reach, y: (dy / d) * reach }
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  })

  // Desync blink timing across instances.
  const blinkDelay = `${(Math.random() * 4).toFixed(2)}s`
  const swayDelay = `${(Math.random() * 2).toFixed(2)}s`

  const px = $derived(gaze.current.x * 5)
  const py = $derived(gaze.current.y * 5.5)
  const asleep = $derived(status === 'paused')
</script>

{#snippet head()}
  <g class="antenna left">
    <path d="M41 36 C 37 24, 31 17, 25 14" />
    <ellipse cx="22" cy="12.5" rx="8.5" ry="6.2" transform="rotate(-24 22 12.5)" />
  </g>
  <g class="antenna right">
    <path d="M59 35 C 63 23, 69 16, 76 13" />
    <ellipse cx="79" cy="11.5" rx="8.5" ry="6.2" transform="rotate(22 79 11.5)" />
  </g>
  <path class="skull" d="M50 30 C 76 30 91 46 91 64 C 91 83 74 95 50 95 C 26 95 9 83 9 64 C 9 46 24 30 50 30 Z" />
  {#if asleep}
    <g class="closed">
      <path d="M29 63 Q 38 69 47 63" />
      <path d="M54 61 Q 63 67 72 61" />
    </g>
  {:else}
    <g class="eyes">
      <ellipse class="white" cx="37.5" cy="62" rx="14" ry="17.5" />
      <ellipse class="white" cx="63" cy="60" rx="14" ry="17.5" />
      <ellipse class="pupil" cx={39.5 + px} cy={63 + py} rx="6.6" ry="9.6" />
      <ellipse class="pupil" cx={65 + px} cy={61 + py} rx="6.6" ry="9.6" />
    </g>
  {/if}
  {#if accessory === 'glasses'}
    <g class="glasses">
      <rect x="23.5" y="49" width="30" height="26" rx="10" />
      <rect x="47" y="47" width="30" height="26" rx="10" />
      <path d="M53.5 61 L 47 61" />
    </g>
  {/if}
{/snippet}

<svg
  bind:this={svg}
  class="ant {mode} s-{status}"
  style:--c="var(--ant-{color})"
  style:--blink-delay={blinkDelay}
  style:--sway-delay={swayDelay}
  width={size}
  height={size}
  viewBox={mode === 'head' ? '0 0 100 100' : '0 0 150 150'}
  role="img"
  aria-label={title ?? `${color} ant`}
>
  {#if mode === 'head'}
    <g class="bob">{@render head()}</g>
  {:else}
    <g class="bob">
      <!-- back legs -->
      <g class="legs back">
        <path class="leg l1" d="M98 112 Q 104 126 98 136" />
        <path class="leg l2" d="M118 110 Q 126 124 122 134" />
      </g>
      <!-- abdomen -->
      <ellipse class="body" cx="106" cy="98" rx="32" ry="27" />
      <!-- thorax + neck, tucked under the head so it reads as one body -->
      <ellipse class="body" cx="66" cy="100" rx="17" ry="15" />
      <ellipse class="body" cx="58" cy="88" rx="13" ry="11" />
      <!-- front legs -->
      <g class="legs front">
        <path class="leg l3" d="M60 110 Q 54 126 58 138" />
        <path class="leg l4" d="M76 110 Q 82 124 80 137" />
      </g>
      <!-- arm -->
      <g class="arm">
        <path d="M58 104 Q 44 110 34 108" />
        <circle cx="31" cy="107" r="6.5" />
      </g>

      {#if accessory === 'satchel'}
        <g class="satchel">
          <path class="strap" d="M56 88 L 96 112" />
          <rect x="82" y="102" width="30" height="24" rx="6" />
          <path class="flap" d="M82 110 Q 97 116 112 110" />
          <circle cx="97" cy="117" r="2.6" />
        </g>
      {:else if accessory === 'leaf'}
        <g class="leaf" transform="translate(31 107) rotate(-115) scale(0.78) translate(-34 -86)">
          <path d="M34 86 C 10 78, 6 52, 16 38 C 34 44, 48 66, 34 86 Z" />
          <path class="rib" d="M34 86 C 26 70, 22 56, 16 40" />
        </g>
      {:else if accessory === 'wrench'}
        <g class="wrench" transform="translate(31 107) rotate(-125) scale(0.85) translate(-33 -88)">
          <path d="M33 88 L 22 58" />
          <path class="jaw" d="M14 52 a 10 10 0 1 1 16 -4 l -6 2 l -2 -6 z" />
        </g>
      {/if}

      <g transform="translate(2 12) scale(0.82)">{@render head()}</g>
    </g>
  {/if}
</svg>

<style>
  .ant {
    display: block;
    overflow: visible;
    flex: none;
    --shade: color-mix(in oklab, var(--c) 78%, #000);
  }

  .skull,
  .body,
  .arm circle {
    fill: var(--c);
  }

  .antenna path,
  .arm path,
  .leg {
    fill: none;
    stroke: var(--c);
    stroke-width: 6.5;
    stroke-linecap: round;
  }

  .full .leg {
    stroke-width: 9;
  }

  .full .legs.back .leg {
    stroke: var(--shade);
  }

  .full .arm path {
    stroke-width: 9;
  }

  .antenna ellipse {
    fill: var(--c);
  }

  .white {
    fill: var(--ant-eye);
  }

  .pupil {
    fill: var(--ant-pupil);
  }

  .closed path {
    fill: none;
    stroke: var(--ant-pupil);
    stroke-width: 3.5;
    stroke-linecap: round;
  }

  .glasses rect,
  .glasses path {
    fill: none;
    stroke: #1a1a19;
    stroke-width: 3.5;
  }

  .satchel rect {
    fill: #f4f1ea;
  }

  .satchel .strap {
    stroke: #f4f1ea;
    stroke-width: 4;
    stroke-linecap: round;
  }

  .satchel .flap {
    fill: none;
    stroke: #d8d3c8;
    stroke-width: 2;
  }

  .satchel circle {
    fill: #1a1a19;
  }

  .leaf path {
    fill: var(--leaf);
  }

  .leaf .rib {
    fill: none;
    stroke: #4f8f2c;
    stroke-width: 2;
  }

  .wrench path {
    fill: none;
    stroke: #c9c7c2;
    stroke-width: 7;
    stroke-linecap: round;
  }

  .wrench .jaw {
    fill: #c9c7c2;
    stroke: none;
  }

  /* ---------- motion ---------- */

  .eyes {
    transform-box: fill-box;
    transform-origin: center;
    animation: blink 5.2s var(--blink-delay) infinite;
  }

  .antenna {
    transform-box: view-box;
    animation: sway 3.6s var(--sway-delay) ease-in-out infinite alternate;
  }

  .antenna.left {
    transform-origin: 41px 36px;
  }

  .antenna.right {
    transform-origin: 59px 35px;
    animation-direction: alternate-reverse;
  }

  .bob {
    transform-box: view-box;
    transform-origin: 50% 100%;
  }

  .s-working .bob {
    animation: bob 0.9s ease-in-out infinite;
  }

  .s-working .antenna {
    animation-duration: 0.45s;
  }

  .s-attention .bob {
    animation: hop 2.4s var(--ease-out) infinite;
  }

  .s-paused {
    filter: saturate(0.35) brightness(0.8);
  }

  .s-paused .antenna {
    animation: none;
    transform: rotate(8deg);
  }

  .full .leg {
    transform-box: fill-box;
    transform-origin: 50% 0%;
  }

  .full.s-working .l1,
  .full.s-working .l3 {
    animation: step 0.5s ease-in-out infinite alternate;
  }

  .full.s-working .l2,
  .full.s-working .l4 {
    animation: step 0.5s ease-in-out infinite alternate-reverse;
  }

  .full .arm {
    transform-box: view-box;
    transform-origin: 58px 104px;
  }

  .full.s-attention .arm {
    animation: wave 1.2s ease-in-out infinite;
  }

  @keyframes blink {
    0%,
    94%,
    100% {
      transform: scaleY(1);
    }
    96.5% {
      transform: scaleY(0.08);
    }
  }

  @keyframes sway {
    from {
      transform: rotate(-5deg);
    }
    to {
      transform: rotate(6deg);
    }
  }

  @keyframes bob {
    0%,
    100% {
      transform: translateY(0) scale(1, 1);
    }
    50% {
      transform: translateY(-3%) scale(1.01, 0.985);
    }
  }

  @keyframes hop {
    0%,
    60%,
    100% {
      transform: translateY(0) scale(1, 1);
    }
    66% {
      transform: translateY(0) scale(1.06, 0.92);
    }
    76% {
      transform: translateY(-9%) scale(0.97, 1.04);
    }
    86% {
      transform: translateY(0) scale(1.03, 0.97);
    }
  }

  @keyframes step {
    from {
      transform: rotate(-14deg);
    }
    to {
      transform: rotate(14deg);
    }
  }

  @keyframes wave {
    0%,
    100% {
      transform: rotate(0deg);
    }
    25% {
      transform: rotate(18deg);
    }
    75% {
      transform: rotate(-10deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ant * {
      animation: none !important;
    }
  }
</style>
