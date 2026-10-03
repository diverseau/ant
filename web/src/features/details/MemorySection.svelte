<script lang="ts">
  import Brain from '@lucide/svelte/icons/brain'
  import { slide } from 'svelte/transition'
  import { api } from '../../lib/api'
  import { rise } from '../../lib/motion'
  import { notify } from '../../lib/store.svelte'

  // What the ant remembers, and the shared profile of you, entry by entry. Both refresh the
  // ant's instructions on its next session.
  let { antId, antName }: { antId: string; antName: string } = $props()

  type Target = 'memory' | 'user'
  let data = $state<{ memory: string[]; user: string[]; limits: { memory: number; user: number } } | null>(null)
  let editing = $state<{ target: Target; old: string; text: string } | null>(null)
  let adding = $state<Record<Target, string>>({ memory: '', user: '' })

  $effect(() => {
    const id = antId
    api.memory(id).then((d) => (data = d)).catch(() => (data = null))
  })

  async function apply(target: Target, op: 'add' | 'replace' | 'remove', text = '', old?: string) {
    try {
      const r = await api.editMemory(antId, { target, op, text, old })
      if (data) data = { ...data, ...r }
      return true
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
      return false
    }
  }

  const used = (t: Target) => (data ? data[t].join('\n§\n').length : 0)
  const groups = $derived([
    { target: 'memory' as const, title: `${antName} remembers`, empty: `Nothing yet. ${antName} saves things worth keeping as it works.`, placeholder: 'Add something to remember' },
    { target: 'user' as const, title: 'About you (every ant)', empty: 'Nothing yet. Ants note your preferences here.', placeholder: 'e.g. I prefer short answers' },
  ])
</script>

<section>
  <h3><Brain size={13} /> Memory</h3>
  {#if data}
    {#each groups as g (g.target)}
      <div class="group">
        <div class="ghead">
          <span>{g.title}</span>
          <span class="meter tabular" class:full={used(g.target) > data.limits[g.target] * 0.9}>{used(g.target)}/{data.limits[g.target]}</span>
        </div>
        {#each data[g.target] as entry (entry)}
          <div class="entry" in:rise={{ y: 4, duration: 200 }} out:slide={{ duration: 180 }}>
            {#if editing && editing.target === g.target && editing.old === entry}
              <form
                class="edit"
                onsubmit={async (e) => {
                  e.preventDefault()
                  const ed = editing!
                  if (ed.text.trim() && ed.text.trim() !== ed.old && (await apply(ed.target, 'replace', ed.text.trim(), ed.old))) editing = null
                  else if (ed.text.trim() === ed.old) editing = null
                }}
              >
                <textarea bind:value={editing.text} rows="3"></textarea>
                <div class="row">
                  <button type="button" class="link" onclick={() => (editing = null)}>Cancel</button>
                  <button class="link strong">Save</button>
                </div>
              </form>
            {:else}
              <button class="text" title="Edit" onclick={() => (editing = { target: g.target, old: entry, text: entry })}>{entry}</button>
              <button class="link" aria-label="Forget this" onclick={() => apply(g.target, 'remove', '', entry)}>Forget</button>
            {/if}
          </div>
        {:else}
          <p class="hint">{g.empty}</p>
        {/each}
        <form
          class="add"
          onsubmit={async (e) => {
            e.preventDefault()
            const t = adding[g.target].trim()
            if (t && (await apply(g.target, 'add', t))) adding[g.target] = ''
          }}
        >
          <input bind:value={adding[g.target]} placeholder={g.placeholder} maxlength={data.limits[g.target]} />
        </form>
      </div>
    {/each}
  {/if}
</section>

<style>
  /* Same as the Details panel's own sections. */
  section {
    padding: 14px 0;
    border-top: 1px solid var(--border);
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 8px;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-faint);
  }

  .group + .group {
    margin-top: 12px;
  }

  .ghead {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .meter {
    color: var(--text-faint);
  }

  .meter.full {
    color: var(--warn);
  }

  .entry {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }

  .text {
    flex: 1;
    min-width: 0;
    text-align: left;
    font-size: var(--text-sm);
    line-height: 1.45;
    color: var(--text-soft);
    white-space: pre-wrap;
    border-radius: var(--r-sm);
    transition: color var(--dur-fast);
  }

  .text:hover {
    color: var(--text);
  }

  .link {
    flex: none;
    font-size: var(--text-xs);
    color: var(--text-faint);
    transition: color var(--dur-fast);
  }

  .link:hover,
  .link.strong {
    color: var(--text);
  }

  .edit {
    flex: 1;
  }

  .edit textarea,
  .add input {
    width: 100%;
    padding: 7px 10px;
    border-radius: var(--r-md);
    border: 1px solid var(--border);
    background: var(--bg-input);
    font-size: var(--text-sm);
    color: var(--text);
  }

  .edit .row {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 4px;
  }

  .add {
    margin-top: 6px;
  }

  .hint {
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
</style>
