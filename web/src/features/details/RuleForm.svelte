<script lang="ts">
  import { rise } from '../../lib/motion'
  import { api } from '../../lib/api'
  import { app, notify } from '../../lib/store.svelte'

  // "When <ant> wants to <action> → Allow / Ask first / Hand off / Never". Saved as a tool
  // pattern, enforced by Ant on every tool call (not just the ones Claude Code asks about).
  let { antId, antName, onsaved, oncancel }: { antId: string; antName: string; onsaved: () => void; oncancel: () => void } = $props()

  type Preset = { id: string; label: string; pattern?: string; needs?: 'text' | 'connector' | 'pattern'; placeholder?: string; optional?: boolean }
  const PRESETS: Preset[] = [
    { id: 'email', label: 'send email', pattern: 'mcp__*mail*__*send*|mcp__*mail*__*reply*|mcp__*mail*__*forward*' },
    { id: 'slack', label: 'post in Slack', pattern: 'mcp__*slack*__*send*|mcp__*slack*__*post*|mcp__*slack*__*reply*' },
    { id: 'calendar', label: 'change my calendar', pattern: 'mcp__*calendar*__*create*|mcp__*calendar*__*update*|mcp__*calendar*__*delete*' },
    { id: 'connector', label: 'use a connector', needs: 'connector' },
    { id: 'site', label: 'open a website', pattern: 'mcp__browser__browser_navigate|WebFetch', needs: 'text', placeholder: 'example.com' },
    { id: 'shell', label: 'run a shell command with', pattern: 'Bash', needs: 'text', placeholder: 'git push' },
    { id: 'files', label: 'edit files', pattern: 'Write|Edit|MultiEdit|NotebookEdit', needs: 'text', placeholder: 'part of a path (optional)', optional: true },
    { id: 'custom', label: 'use a tool (advanced)', needs: 'pattern', placeholder: 'mcp__server__tool or a pattern with *' },
  ]
  const MODES = [
    { id: 'allow', label: 'Allow' },
    { id: 'ask', label: 'Ask first' },
    { id: 'handoff', label: 'Hand off' },
    { id: 'deny', label: 'Never' },
  ] as const

  let preset = $state('email')
  let text = $state('')
  let connector = $state('')
  let mode = $state<(typeof MODES)[number]['id']>('ask')
  let everyone = $state(false)
  let busy = $state(false)
  let connectors = $state<Array<{ key: string; name: string }>>([])

  const p = $derived(PRESETS.find((x) => x.id === preset)!)
  const ready = $derived(p.needs === 'connector' ? !!connector : p.needs && !p.optional ? !!text.trim() : true)

  $effect(() => {
    if (app.mode !== 'live') return
    api.connectors().then((v) => (connectors = v.claudeAi.map((c) => ({ key: c.key, name: c.name })))).catch(() => {})
  })

  /** Claude Code names MCP tools mcp__<server>__<tool>, with the server name's other characters as _. */
  const serverPrefix = (key: string) => `mcp__${key.replace(/[^A-Za-z0-9_-]/g, '_')}__*`

  async function save() {
    if (!ready || busy) return
    busy = true
    const pattern = p.needs === 'connector' ? serverPrefix(connector) : p.needs === 'pattern' ? text.trim() : p.pattern!
    const contains = p.needs === 'text' ? text.trim() : ''
    const target = p.needs === 'connector' ? `use ${connectors.find((c) => c.key === connector)?.name ?? connector}` : p.needs === 'pattern' ? `use ${text.trim()}` : `${p.label}${contains ? ` “${contains}”` : ''}`
    const label = `${target.charAt(0).toUpperCase()}${target.slice(1)}`
    try {
      await api.addRule({ antId: everyone ? null : antId, pattern, behaviour: mode, label, ...(contains && { inputContains: contains }) })
      onsaved()
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      busy = false
    }
  }
</script>

<form class="form" in:rise={{ y: 4, duration: 220 }} onsubmit={(e) => (e.preventDefault(), save())}>
  <label>
    <span>When {everyone ? 'any ant' : antName} wants to</span>
    <select bind:value={preset}>
      {#each PRESETS as x}<option value={x.id}>{x.label}</option>{/each}
    </select>
  </label>
  {#if p.needs === 'connector'}
    <select bind:value={connector} aria-label="Connector">
      <option value="" disabled>Choose a connector</option>
      {#each connectors as c}<option value={c.key}>{c.name}</option>{/each}
    </select>
  {:else if p.needs}
    <input bind:value={text} placeholder={p.placeholder} aria-label="Details" spellcheck="false" />
  {/if}
  <div class="seg" role="group" aria-label="What happens">
    {#each MODES as m}
      <button type="button" aria-pressed={mode === m.id} class:deny={m.id === 'deny'} onclick={() => (mode = m.id)}>{m.label}</button>
    {/each}
  </div>
  <label class="check"><input type="checkbox" bind:checked={everyone} /> Apply to all ants</label>
  <div class="actions">
    <button type="button" class="btn btn-ghost" onclick={oncancel}>Cancel</button>
    <button class="btn btn-accent" disabled={!ready || busy}>{busy ? 'Saving…' : 'Add rule'}</button>
  </div>
</form>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
    padding: 12px;
    border-radius: var(--r-lg);
    border: 1px solid var(--border);
    background: var(--bg-raised);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  select,
  input:not([type='checkbox']) {
    height: 34px;
    padding: 0 10px;
    border-radius: var(--r-md);
    border: 1px solid var(--border-strong);
    background: var(--bg-input);
    font-size: var(--text-sm);
    color: var(--text);
  }

  .seg {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }

  .seg button {
    height: 30px;
    border-radius: var(--r-sm);
    border: 1px solid var(--border);
    font-size: var(--text-xs);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      border-color var(--dur-fast),
      transform var(--dur-fast) var(--ease-out);
  }

  .seg button[aria-pressed='true'] {
    background: var(--bg-selected);
    border-color: var(--border-strong);
    color: var(--text);
  }

  .seg button.deny[aria-pressed='true'] {
    background: rgb(229 96 79 / 0.16);
    color: #f4a69b;
  }

  .seg button:active {
    transform: scale(0.95);
  }

  .check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    color: var(--text-soft);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
