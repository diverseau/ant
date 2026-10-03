<script lang="ts">
  import Ant from '../../lib/ant/Ant.svelte'
  import { parse, type Inline } from '../../lib/rich'
  import { app, selectAnt } from '../../lib/store.svelte'

  let { text, streaming = false }: { text: string; streaming?: boolean } = $props()

  const blocks = $derived(parse(text, app.ants))

  // A bare URL shows without its scheme, shortened; the full address is in the tooltip.
  function short(url: string) {
    const s = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
    return s.length > 52 ? s.slice(0, 50) + '…' : s
  }
</script>

{#snippet inl(parts: Inline[], last: boolean)}
  {#each parts as p}
    {#if p.t === 'text'}{#each p.v.split('\n') as line, li}{#if li}<br />{/if}{line}{/each}{:else if p.t === 'bold'}<strong>{p.v}</strong>{:else if p.t === 'em'}<em>{p.v}</em>{:else if p.t === 'code'}<code>{p.v}</code>{:else if p.t === 'link'}<a href={p.href} target="_blank" rel="noopener noreferrer" title={p.href}>{p.v === p.href || p.v + '/' === p.href ? short(p.v) : p.v}</a>{:else if p.t === 'tag'}<span class="tag">{p.v}</span>{:else if p.t === 'mention'}<button class="mention" onclick={() => selectAnt(p.ant.id)}><Ant color={p.ant.color} size={17} />{p.ant.name}</button>{/if}
  {/each}{#if last && streaming}<span class="caret"></span>{/if}
{/snippet}

<div class="rich">
  {#each blocks as b, bi}
    {@const last = bi === blocks.length - 1}
    {#if b.t === 'p'}
      <p>{@render inl(b.inl, last)}</p>
    {:else if b.t === 'h'}
      <svelte:element this={`h${b.level + 2}`} class="h">{@render inl(b.inl, last)}</svelte:element>
    {:else if b.t === 'quote'}
      <blockquote>{@render inl(b.inl, false)}</blockquote>
    {:else if b.t === 'pre'}
      <pre>{b.v}</pre>
    {:else if b.t === 'table'}
      <div class="table">
        <table>
          <thead>
            <tr>{#each b.head as c, ci}<th style:text-align={b.align[ci]}>{@render inl(c, false)}</th>{/each}</tr>
          </thead>
          <tbody>
            {#each b.rows as row}
              <tr>{#each row as c, ci}<td style:text-align={b.align[ci]}>{@render inl(c, false)}</td>{/each}</tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <svelte:element this={b.t} start={b.t === 'ol' && b.start !== 1 ? b.start : undefined}>
        {#each b.items as item, ii}
          <li>{@render inl(item, last && ii === b.items.length - 1)}</li>
        {/each}
      </svelte:element>
    {/if}
  {/each}
  {#if !blocks.length && streaming}<p><span class="caret"></span></p>{/if}
</div>

<style>
  .rich {
    font-family: var(--font-body);
    font-size: 15.5px;
    line-height: 1.62;
    color: var(--text);
    overflow-wrap: anywhere;
  }

  blockquote {
    margin: 0;
    padding: 2px 0 2px 10px;
    border-left: 2px solid var(--border-strong);
    font-size: 0.9em;
    color: var(--text-muted);
  }

  .rich > * + * {
    margin-top: 0.7em;
  }

  .h {
    margin: 0;
    font-weight: 600;
    line-height: 1.35;
  }

  h3.h {
    font-size: 1.15em;
  }

  h4.h {
    font-size: 1.05em;
  }

  h5.h {
    font-size: 1em;
  }

  .rich > * + .h {
    margin-top: 1.1em;
  }

  ul,
  ol {
    margin: 0;
    padding-left: 1.25em;
  }

  pre {
    margin: 0;
    padding: 10px 12px;
    border-radius: var(--r-md);
    background: rgb(0 0 0 / 0.22);
    font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
    font-size: 0.8em;
    line-height: 1.55;
    white-space: pre;
    overflow-x: auto;
    overflow-wrap: normal;
  }

  /* Wide tables scroll sideways inside the bubble rather than squashing. */
  .table {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88em;
    line-height: 1.5;
    overflow-wrap: normal;
  }

  th,
  td {
    min-width: 7em;
    padding: 7px 12px;
    text-align: left;
    vertical-align: top;
  }

  th {
    font-family: var(--font-ui);
    font-size: 0.9em;
    font-weight: 500;
    color: var(--text-muted);
    background: rgb(255 255 255 / 0.03);
    border-bottom: 1px solid var(--border);
  }

  tbody tr + tr td {
    border-top: 1px solid var(--border);
  }

  th + th,
  td + td {
    border-left: 1px solid var(--border);
  }

  li {
    padding-left: 0.2em;
  }

  li + li {
    margin-top: 0.3em;
  }

  li::marker {
    color: var(--text-faint);
  }

  strong {
    font-weight: 600;
  }

  a {
    color: var(--accent);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent);
    text-underline-offset: 0.18em;
    transition: text-decoration-color var(--dur-fast);
  }

  a:hover {
    text-decoration-color: var(--accent);
  }

  code {
    font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
    font-size: 0.84em;
    padding: 0.1em 0.38em;
    border-radius: 5px;
    background: rgb(255 255 255 / 0.07);
    color: #f2c3b3;
  }

  .tag {
    font-family: var(--font-ui);
    font-size: 0.86em;
    color: var(--accent);
  }

  .mention {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    vertical-align: -0.3em;
    height: 1.55em;
    padding: 0 8px 0 4px;
    border-radius: var(--r-sm);
    background: rgb(255 255 255 / 0.06);
    font-family: var(--font-ui);
    font-size: 0.82em;
    font-weight: 500;
    transition:
      background var(--dur-fast),
      transform var(--dur-fast) var(--ease-out);
  }

  .mention:hover {
    background: rgb(255 255 255 / 0.11);
    transform: translateY(-1px);
  }

  .caret {
    display: inline-block;
    width: 0.5em;
    height: 0.5em;
    margin-left: 3px;
    border-radius: 50%;
    background: var(--accent);
    vertical-align: 0.05em;
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      transform: scale(0.6);
      opacity: 0.5;
    }
  }
</style>
