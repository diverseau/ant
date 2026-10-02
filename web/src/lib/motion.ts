import { backOut, cubicOut, quintOut } from 'svelte/easing'
import type { TransitionConfig } from 'svelte/transition'

export const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const d = (ms: number) => (reduced ? 0 : ms)

/** Messages and cards entering the stream. */
export function rise(_node: Element, { delay = 0, y = 10, duration = 360 } = {}): TransitionConfig {
  return {
    delay: d(delay),
    duration: d(duration),
    easing: quintOut,
    css: (t, u) => `opacity:${Math.min(1, t * 1.6)};transform:translateY(${u * y}px) scale(${0.985 + 0.015 * t})`,
  }
}

/** Popovers and menus: scale from their transform-origin. */
export function pop(_node: Element, { duration = 220, from = 0.94 } = {}): TransitionConfig {
  return {
    duration: d(duration),
    easing: backOut,
    css: (t, u) => `opacity:${Math.min(1, t * 2)};transform:scale(${from + (1 - from) * t}) translateY(${u * -4}px)`,
  }
}

/** Faster, quieter exit for pop. */
export function popOut(_node: Element, { duration = 140 } = {}): TransitionConfig {
  return {
    duration: d(duration),
    easing: cubicOut,
    css: (t) => `opacity:${t};transform:scale(${0.97 + 0.03 * t})`,
  }
}

/** Modal dialogs. */
export function modal(_node: Element, { duration = 380 } = {}): TransitionConfig {
  return {
    duration: d(duration),
    easing: quintOut,
    css: (t, u) => `opacity:${Math.min(1, t * 1.8)};transform:translateY(${u * 14}px) scale(${0.96 + 0.04 * t})`,
  }
}

/** Height + fade, for collapsing rows/cards. */
export function collapse(node: Element, { duration = 260 } = {}): TransitionConfig {
  const h = (node as HTMLElement).offsetHeight
  return {
    duration: d(duration),
    easing: cubicOut,
    css: (t) => `opacity:${t};height:${t * h}px;overflow:hidden`,
  }
}
