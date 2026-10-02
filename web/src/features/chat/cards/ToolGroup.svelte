<script lang="ts">
  import Terminal from '@lucide/svelte/icons/terminal'
  import File from '@lucide/svelte/icons/file'
  import Globe from '@lucide/svelte/icons/globe'
  import Plug from '@lucide/svelte/icons/plug'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Users from '@lucide/svelte/icons/users'
  import Search from '@lucide/svelte/icons/search'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import Loader from '@lucide/svelte/icons/loader-circle'
  import Check from '@lucide/svelte/icons/check'
  import X from '@lucide/svelte/icons/x'
  import ShieldBan from '@lucide/svelte/icons/shield-ban'
  import { fade } from 'svelte/transition'
  import { collapse, reduced, rise } from '../../../lib/motion'
  import type { ToolMessage } from '../../../lib/types'

  let { messages }: { messages: ToolMessage[] } = $props()
  let expanded = $state(false)
  const disclosureId = $props.id()
  const latest = $derived(messages.at(-1))
  const labels = { running: 'Running', ok: 'Completed', error: 'Failed', denied: 'Denied' }

  function icon(name: string) {
    if (name === 'Bash') return Terminal
    if (['Read', 'Write', 'Edit', 'MultiEdit'].includes(name)) return File
    if (name.startsWith('Web')) return Globe
    if (name.startsWith('mcp__')) return Plug
    if (name === 'Skill') return Sparkles
    if (name === 'Task') return Users
    return Search
  }
</script>

{#if latest}
  <div class="group">
    <button class="summary" aria-expanded={expanded} aria-controls={disclosureId} onclick={() => (expanded = !expanded)}>
      <span class="summary-copy">
        {#key latest.id + latest.title}
          {@const Icon = icon(latest.name)}
          <span class="summary-layer" in:fade={{ duration: reduced ? 0 : 200 }} out:fade={{ duration: reduced ? 0 : 120 }}>
            <Icon size={14} />
            <span class="title" class:running={latest.state === 'running'}>{latest.title}</span>
          </span>
        {/key}
      </span>
      {#if messages.length > 1}<span class="count">+{messages.length - 1} more</span>{/if}
      <span class="chevron" class:expanded><ChevronRight size={13} /></span>
    </button>
    {#if expanded}
      <div id={disclosureId} transition:collapse>
        <ul class="rows">
          {#each messages as m (m.id)}
            {@const Icon = icon(m.name)}
            <li in:rise={{ y: 4, duration: 240 }}>
              <span class="family"><Icon size={14} /></span>
              <div class="copy">
                <span class="title" class:running={m.state === 'running'}>{m.title}</span>
                {#if m.detail}<p class="detail" class:command={m.name === 'Bash'}>{m.detail}</p>{/if}
              </div>
              {#if m.durationMs !== undefined}<span class="duration tabular">{(m.durationMs / 1000).toFixed(1)}s</span>{/if}
              <span class="state {m.state}" role="img" aria-label={labels[m.state]}>
                {#if m.state === 'running'}
                  <span class="spin"><Loader size={13} /></span>
                {:else if m.state === 'ok'}
                  <Check size={13} />
                {:else if m.state === 'error'}
                  <X size={13} />
                {:else}
                  <ShieldBan size={13} /><span>Denied</span>
                {/if}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<style>
  .group {
    width: min(520px, 100%);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .summary {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 8px 10px;
    border-radius: var(--r-md);
    text-align: left;
  }

  .summary:hover,
  .summary:focus-visible {
    color: var(--text-soft);
  }

  .summary:active {
    transform: translateY(1px);
  }

  .summary,
  .chevron {
    transition: transform var(--dur) var(--ease-out);
  }

  .summary-copy {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .summary-layer {
    grid-area: 1 / 1;
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  .summary-layer :global(svg) {
    flex: none;
  }

  .title {
    position: relative;
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .count,
  .duration {
    flex: none;
    color: var(--text-faint);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .chevron,
  .family,
  .spin {
    display: grid;
    flex: none;
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 2px 10px 8px;
  }

  li {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 7px 0;
  }

  .family,
  .state {
    margin-top: 3px;
  }

  .copy {
    flex: 1;
    min-width: 0;
  }

  .copy .title {
    color: var(--text-soft);
  }

  .detail {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    margin-top: 3px;
    font-family: var(--font-body);
    font-size: var(--text-xs);
    line-height: 1.5;
  }

  .detail.command {
    font-family: monospace;
  }

  .duration {
    margin-top: 2px;
  }

  .state {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    font-size: var(--text-xs);
  }

  .state.error {
    color: var(--danger);
  }

  .state.ok {
    color: var(--text-muted);
  }

  .spin {
    animation: spin 1.4s linear infinite;
  }

  .title.running::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 40%;
    background: linear-gradient(90deg, transparent, var(--text), transparent);
    opacity: 0;
    pointer-events: none;
    animation: shimmer 2.6s var(--ease-in-out) infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes shimmer {
    0% { transform: translateX(-150%); opacity: 0; }
    30%, 60% { opacity: 0.08; }
    100% { transform: translateX(400%); opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin,
    .title.running::after {
      animation: none;
    }
  }
</style>
