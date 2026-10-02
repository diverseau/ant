<script lang="ts">
  import Shield from '@lucide/svelte/icons/shield-check'
  import Check from '@lucide/svelte/icons/check'
  import X from '@lucide/svelte/icons/x'
  import Clock from '@lucide/svelte/icons/clock'
  import { slide } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import Monitor from '@lucide/svelte/icons/monitor'
  import { app, decideApproval, setLease } from '../../../lib/store.svelte'
  import type { ApprovalMessage } from '../../../lib/types'

  let { m, threadId }: { m: ApprovalMessage; threadId: string } = $props()

  const result = $derived(
    m.decision === 'once' && m.behaviour === 'handoff'
      ? { icon: Check, text: 'Handed back', tone: 'ok' }
      : m.decision === 'once'
      ? { icon: Check, text: 'Allowed once', tone: 'ok' }
      : m.decision === 'always'
        ? { icon: Check, text: `Always allowed for ${m.connector}`, tone: 'ok' }
        : m.decision === 'deny'
          ? { icon: X, text: 'Denied', tone: 'muted' }
          : m.decision === 'expired'
            ? { icon: Clock, text: 'Expired', tone: 'muted' }
            : null,
  )
</script>

<div class="card" class:pending={!m.decision}>
  <div class="head">
    <span class="icon"><Shield size={15} /></span>
    <span class="kicker">{m.behaviour === 'handoff' ? (m.decision ? 'Hand-off' : 'Needs you on the computer') : m.decision ? 'Approval' : 'Needs your approval'}</span>
  </div>
  <p class="action">{m.action}</p>
  <p class="detail">{m.detail}</p>

  {#if !m.decision && m.behaviour === 'handoff'}
    <div class="actions" out:slide={{ duration: 220, easing: cubicOut }}>
      <button class="btn btn-ghost" onclick={() => decideApproval(threadId, m.id, 'deny')}>Not now</button>
      <button
        class="btn btn-accent"
        onclick={() => {
          app.panel = 'computer'
          setLease(m.author, 'user')
        }}><Monitor size={14} /> Take over</button
      >
    </div>
  {:else if !m.decision}
    <div class="actions" out:slide={{ duration: 220, easing: cubicOut }}>
      <button class="btn btn-ghost" onclick={() => decideApproval(threadId, m.id, 'deny')}>Deny</button>
      <button class="btn btn-ghost" onclick={() => decideApproval(threadId, m.id, 'always')}>Always allow</button>
      <button class="btn btn-accent" onclick={() => decideApproval(threadId, m.id, 'once')}>Allow once</button>
    </div>
  {:else if result}
    <div class="result {result.tone}" in:slide={{ duration: 260, delay: 160, easing: cubicOut }}>
      <span class="ri"><result.icon size={13} strokeWidth={2.6} /></span>
      {result.text}
    </div>
  {/if}
</div>

<style>
  .card {
    width: min(440px, 100%);
    padding: 13px 14px;
    border-radius: var(--r-xl);
    background: var(--bg-bubble);
    border: 1px solid transparent;
    transition:
      border-color var(--dur-slow) var(--ease-out),
      background var(--dur-slow) var(--ease-out);
  }

  .card.pending {
    border-color: rgb(217 119 87 / 0.4);
    background: linear-gradient(180deg, rgb(217 119 87 / 0.07), transparent 70%), var(--bg-bubble);
    animation: glow 2.6s ease-in-out infinite;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--accent);
  }

  .card:not(.pending) .head {
    color: var(--text-muted);
  }

  .kicker {
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .icon {
    display: grid;
  }

  .action {
    margin-top: 8px;
    font-size: var(--text-md);
    font-weight: 500;
  }

  .detail {
    margin-top: 2px;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 12px;
  }

  .result {
    display: flex;
    align-items: center;
    gap: 7px;
    padding-top: 10px;
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .ri {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    animation: stamp 480ms 200ms var(--ease-spring) both;
  }

  .ok {
    color: var(--ok);
  }

  .ok .ri {
    background: rgb(66 194 142 / 0.16);
  }

  .muted {
    color: var(--text-muted);
  }

  .muted .ri {
    background: rgb(255 255 255 / 0.07);
  }

  @keyframes stamp {
    from {
      transform: scale(0) rotate(-30deg);
    }
  }

  @keyframes glow {
    50% {
      border-color: rgb(217 119 87 / 0.65);
    }
  }
</style>
