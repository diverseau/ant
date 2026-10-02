<script lang="ts">
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Repeat from '@lucide/svelte/icons/repeat'
  import ShieldCheck from '@lucide/svelte/icons/shield-check'
  import Trash from '@lucide/svelte/icons/trash-2'
  import Ant from '../../lib/ant/Ant.svelte'
  import { skills } from '../../lib/mock/data'
  import { app, deleteThread, selectAnt, setStatus, threadById, threadForAnt, threadMembers, updateAnt } from '../../lib/store.svelte'
  import Switch from '../../lib/ui/Switch.svelte'

  const thread = $derived(threadById(app.selectedId))
  const members = $derived(thread ? threadMembers(thread) : [])
  const ant = $derived(thread?.kind === 'ant' ? members[0] : undefined)

  // Local demo state; wired to a backend later.
  let routines = $state([
    { name: 'Morning brief', when: 'Weekdays at 8:00 AM', on: true },
    { name: 'Friday wrap-up', when: 'Fridays at 4:30 PM', on: false },
  ])
  let rules = $state([
    { text: 'Sending email or Slack to anyone outside the team', mode: 'Ask first' },
    { text: 'Reading calendars, docs and inboxes', mode: 'Allow' },
    { text: 'Purchases and payments', mode: 'Hand off' },
  ])
</script>

<div class="panel">
  {#if ant}
    <div class="identity">
      <div class="portrait"><Ant color={ant.color} accessory={ant.accessory} mode="full" size={112} status={ant.status} follow /></div>
      <input class="name" value={ant.name} aria-label="Name" onchange={(e) => e.currentTarget.value.trim() && updateAnt(ant.id, { name: e.currentTarget.value.trim() })} />
      <input class="label" value={ant.label ?? ''} placeholder="Add a label" aria-label="Label" onchange={(e) => updateAnt(ant.id, { label: e.currentTarget.value.trim() })} />
    </div>

    <section>
      <h3>Instructions</h3>
      <textarea value={ant.description} rows="4" onchange={(e) => updateAnt(ant.id, { description: e.currentTarget.value })}></textarea>
    </section>

    <section>
      <h3><Sparkles size={13} /> Skills</h3>
      {#each skills.slice(0, 3) as s}
        <div class="item">
          <span class="mono">/{s.name}</span>
          <span class="sub">{s.description}</span>
        </div>
      {/each}
    </section>

    <section>
      <h3><Repeat size={13} /> Routines</h3>
      {#each routines as r}
        <div class="item row">
          <div>
            <div>{r.name}</div>
            <div class="sub">{r.when}</div>
          </div>
          <Switch bind:checked={r.on} label="Toggle {r.name}" />
        </div>
      {/each}
      <p class="hint">Ask {ant.name} in chat to add a routine.</p>
    </section>

    <section>
      <h3><ShieldCheck size={13} /> Rules</h3>
      {#each rules as r}
        <div class="item row">
          <span class="rule">{r.text}</span>
          <span class="mode" class:ask={r.mode === 'Ask first'} class:hand={r.mode === 'Hand off'}>{r.mode}</span>
        </div>
      {/each}
    </section>

    <section class="danger">
      <div class="item row">
        <div>
          <div>Pause {ant.name}</div>
          <div class="sub">Stops the current task. Routines stay scheduled.</div>
        </div>
        <Switch
          bind:checked={() => ant.status === 'paused', (v) => setStatus(ant.id, v ? 'paused' : 'idle')}
          label="Pause"
        />
      </div>
      <button class="btn btn-danger" onclick={() => deleteThread(threadForAnt(ant.id)?.id ?? ant.id)}><Trash size={14} /> Delete ant</button>
    </section>
  {:else if thread}
    <section>
      <h3>Members</h3>
      {#each members as m}
        <button class="item row member" onclick={() => selectAnt(m.id)}>
          <Ant color={m.color} size={28} status={m.status} />
          <div>
            <div>{m.name}</div>
            <div class="sub">{m.label}</div>
          </div>
        </button>
      {/each}
    </section>
  {/if}
</div>

<style>
  .panel {
    padding: 8px 16px 24px;
  }

  .identity {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 0 14px;
  }

  .portrait {
    margin-bottom: 6px;
  }

  input {
    width: 100%;
    border: 0;
    background: transparent;
    text-align: center;
    border-radius: var(--r-sm);
    transition: background var(--dur-fast);
  }

  input:hover,
  input:focus {
    background: var(--bg-hover);
  }

  .name {
    font-family: var(--font-body);
    font-size: 1.45rem;
    font-weight: 500;
  }

  .label {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

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

  textarea {
    width: 100%;
    padding: 10px 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--border);
    background: var(--bg-input);
    resize: vertical;
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.55;
    color: var(--text-soft);
    transition: border-color var(--dur-fast);
  }

  textarea:focus {
    border-color: var(--border-strong);
  }

  .item {
    padding: 7px 0;
    font-size: var(--text-sm);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .member {
    justify-content: flex-start;
    width: 100%;
    padding: 6px 8px;
    margin: 0 -8px;
    border-radius: var(--r-md);
    text-align: left;
    transition: background var(--dur-fast);
  }

  .member:hover {
    background: var(--bg-hover);
  }

  .mono {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 12.5px;
    color: var(--accent);
    margin-right: 8px;
  }

  .sub {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .hint {
    margin-top: 6px;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .rule {
    color: var(--text-soft);
  }

  .mode {
    flex: none;
    padding: 2px 8px;
    border-radius: var(--r-sm);
    font-size: var(--text-xs);
    background: rgb(66 194 142 / 0.12);
    color: var(--ok);
  }

  .mode.ask {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .mode.hand {
    background: var(--warn-soft);
    color: var(--warn);
  }

  .danger .btn {
    margin-top: 10px;
  }
</style>
