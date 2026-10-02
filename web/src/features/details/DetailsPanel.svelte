<script lang="ts">
  import { slide } from 'svelte/transition'
  import { onMount } from 'svelte'
  import type { RoutineView } from '@ant/shared'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Repeat from '@lucide/svelte/icons/repeat'
  import ShieldCheck from '@lucide/svelte/icons/shield-check'
  import Trash from '@lucide/svelte/icons/trash-2'
  import Play from '@lucide/svelte/icons/play'
  import Pencil from '@lucide/svelte/icons/pencil'
  import Plus from '@lucide/svelte/icons/plus'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import Ant from '../../lib/ant/Ant.svelte'
  import { skills as mockSkills } from '../../lib/mock/data'
  import { api } from '../../lib/api'
  import type { RuleView } from '@ant/shared'
  import { app, deleteRoutine, deleteThread, selectAnt, setStatus, testRoutine, threadById, threadForAnt, threadMembers, updateAnt, updateRoutine } from '../../lib/store.svelte'
  import { collapse, rise } from '../../lib/motion'
  import Switch from '../../lib/ui/Switch.svelte'
  import RoutineEditor from '../routines/RoutineEditor.svelte'
  import RoutineRuns from '../routines/RoutineRuns.svelte'

  const thread = $derived(threadById(app.selectedId))
  const members = $derived(thread ? threadMembers(thread) : [])
  const ant = $derived(thread?.kind === 'ant' ? members[0] : undefined)

  const routines = $derived(app.routines.filter((r) => r.antId === ant?.id))
  let demoRoutines = $state([
    { name: 'Morning brief', when: 'Weekdays at 8:00 AM', on: true },
    { name: 'Friday wrap-up', when: 'Fridays at 4:30 PM', on: false },
  ])
  let editor = $state<{ antId: string; routine?: RoutineView } | null>(null)
  let expanded = $state<string[]>([])
  let confirmation = $state<{ id: string; action: 'test' | 'delete' } | null>(null)
  let pending = $state<Record<string, boolean>>({})
  let errors = $state<Record<string, string>>({})
  let messages = $state<Record<string, string>>({})
  let now = $state(Date.now())

  onMount(() => {
    const timer = setInterval(() => now = Date.now(), 60_000)
    return () => clearInterval(timer)
  })

  function nextRun(r: RoutineView) {
    if (!r.enabled) return 'Paused'
    if (r.trigger === 'webhook') return 'On webhook request'
    if (r.nextRunAt === null) return 'No next run'
    const minutes = Math.ceil((r.nextRunAt - now) / 60_000)
    if (minutes <= 0) return 'Due now'
    if (minutes < 60) return `in ${minutes}m`
    if (minutes < 24 * 60) return `in ${Math.floor(minutes / 60)}h`
    try {
      return new Intl.DateTimeFormat('en', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: r.tz }).format(r.nextRunAt)
    } catch {
      return new Date(r.nextRunAt).toLocaleString()
    }
  }

  async function toggleRoutine(id: string, enabled: boolean) {
    if (pending[id]) return
    pending[id] = true
    errors[id] = ''
    messages[id] = ''
    try {
      await updateRoutine(id, { enabled })
    } catch (err) {
      errors[id] = err instanceof Error ? err.message : String(err)
    } finally {
      pending[id] = false
    }
  }

  function confirmAction(id: string, action: 'test' | 'delete') {
    confirmation = { id, action }
    errors[id] = ''
    messages[id] = ''
  }

  async function perform(id: string, action: 'test' | 'delete') {
    if (pending[id]) return
    pending[id] = true
    errors[id] = ''
    try {
      if (action === 'delete') await deleteRoutine(id)
      else {
        await testRoutine(id)
        messages[id] = 'Test started. This is a real run.'
        if (!expanded.includes(id)) expanded = [...expanded, id]
      }
      confirmation = null
    } catch (err) {
      errors[id] = err instanceof Error ? err.message : String(err)
    } finally {
      pending[id] = false
    }
  }
  let liveRules: RuleView[] = $state([])
  $effect(() => {
    if (app.mode !== 'live' || !ant) return
    const id = ant.id
    void app.threads.length // refresh after new approvals land
    api.rules(id).then((r) => (liveRules = r)).catch(() => (liveRules = []))
  })
  async function revoke(id: string) {
    liveRules = liveRules.filter((r) => r.id !== id)
    await api.deleteRule(id).catch(() => {})
  }

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
      {#if app.mode === 'live'}
        <div class="model-pick" role="radiogroup" aria-label="Model">
          {#each ['haiku', 'sonnet', 'opus'] as m}
            <button role="radio" aria-checked={(ant.model ?? 'sonnet') === m} onclick={() => updateAnt(ant.id, { model: m })}>{m[0].toUpperCase() + m.slice(1)}</button>
          {/each}
        </div>
      {/if}
    </div>

    <section>
      <h3>Instructions</h3>
      <textarea value={ant.description} rows="4" onchange={(e) => updateAnt(ant.id, { description: e.currentTarget.value })}></textarea>
    </section>

    <section>
      <h3><Sparkles size={13} /> Skills</h3>
      {#each app.mode === 'live' ? app.skills : mockSkills.slice(0, 3) as s}
        <div class="item">
          <span class="mono">/{s.name}</span>
          <span class="sub">{s.description}</span>
          {#if 'scope' in s && s.scope === 'colony'}<span class="scope">colony</span>{/if}
        </div>
      {:else}
        <p class="hint">No skills yet. When {ant.name} figures out a repeatable process, ask it to save it as a skill.</p>
      {/each}
    </section>

    <section>
      <h3><Repeat size={13} /> Routines</h3>
      {#if app.mode === 'demo'}
        {#each demoRoutines as r}
          <div class="item row">
            <div><div>{r.name}</div><div class="sub">{r.when}</div></div>
            <Switch bind:checked={r.on} label="Toggle {r.name}" />
          </div>
        {/each}
        <p class="hint">Ask {ant.name} in chat to add a routine.</p>
      {:else}
        {#each routines as r (r.id)}
          <div class="routine" in:rise out:collapse>
            <div class="routine-row">
              <button class="routine-summary" aria-expanded={expanded.includes(r.id)} aria-controls="runs-{r.id}" onclick={() => expanded = expanded.includes(r.id) ? expanded.filter((id) => id !== r.id) : [...expanded, r.id]}>
                <span class="routine-name">
                  <span class="status-dot" class:succeeded={r.lastStatus === 'succeeded'} class:failed={r.lastStatus === 'failed'} class:running={r.lastStatus === 'running'} class:expired={r.lastStatus === 'expired'} title={r.lastStatus ? `Last run: ${r.lastStatus}` : 'No runs yet'}></span>
                  <span>{r.name}</span>
                  <ChevronDown size={12} class={expanded.includes(r.id) ? 'rotated' : ''} />
                </span>
                <span class="sr-only">{r.lastStatus ? `Last run: ${r.lastStatus}` : 'No runs yet'}</span>
                <span class="sub schedule-text">{r.when}</span>
                <span class="sub next-run" title={r.nextRunAt ? `${new Date(r.nextRunAt).toLocaleString()} · ${r.tz}` : r.tz}>{nextRun(r)}</span>
              </button>
              <div class="routine-controls">
                <div class="routine-actions">
                  <button class="icon-btn" disabled={pending[r.id]} aria-label="Test {r.name}" title="Test" onclick={() => confirmAction(r.id, 'test')}><Play size={13} /></button>
                  <button class="icon-btn" disabled={pending[r.id]} aria-label="Edit {r.name}" title="Edit" onclick={() => editor = { antId: ant.id, routine: r }}><Pencil size={13} /></button>
                  <button class="icon-btn" disabled={pending[r.id]} aria-label="Delete {r.name}" title="Delete" onclick={() => confirmAction(r.id, 'delete')}><Trash size={13} /></button>
                </div>
                <fieldset class="toggle" disabled={pending[r.id]}>
                  <Switch bind:checked={() => r.enabled, (enabled) => toggleRoutine(r.id, enabled)} label="Toggle {r.name}" />
                </fieldset>
              </div>
            </div>
            {#if confirmation?.id === r.id}
              <div class="confirm" transition:collapse>
                <p>{confirmation.action === 'test' ? 'This runs it for real' : `Delete “${r.name}” and its run history?`}</p>
                <div class="confirm-actions">
                  <button class="btn btn-ghost" disabled={pending[r.id]} onclick={() => confirmation = null}>Cancel</button>
                  <button class="btn" class:btn-danger={confirmation.action === 'delete'} class:btn-accent={confirmation.action === 'test'} disabled={pending[r.id]} onclick={() => confirmation && perform(r.id, confirmation.action)}>
                    {pending[r.id] ? 'Working…' : confirmation.action === 'test' ? 'Run test' : 'Delete routine'}
                  </button>
                </div>
              </div>
            {/if}
            {#if errors[r.id]}<p class="routine-error" role="alert" in:rise>{errors[r.id]}</p>{/if}
            {#if messages[r.id]}<p class="hint" role="status" in:rise>{messages[r.id]}</p>{/if}
            {#if expanded.includes(r.id)}
              <div id="runs-{r.id}" transition:collapse><RoutineRuns routine={r} /></div>
            {/if}
          </div>
        {/each}
        {#if routines.length === 0}<p class="hint empty">Ask {ant.name} in chat to set up a routine, or create one here.</p>{/if}
        <button class="btn btn-ghost new-routine" disabled={app.mode !== 'live'} onclick={() => editor = { antId: ant.id }}><Plus size={13} /> New routine</button>
      {/if}
    </section>

    <section>
      <h3><ShieldCheck size={13} /> Rules</h3>
      {#if app.mode === 'live'}
        {#each liveRules as r (r.id)}
          <div class="item row" out:slide={{ duration: 200 }}>
            <span class="rule">{r.label}</span>
            <span class="mode">{r.behaviour === 'allow' ? 'Always allowed' : r.behaviour}</span>
            <button class="revoke" onclick={() => revoke(r.id)} aria-label="Revoke">Revoke</button>
          </div>
        {/each}
        <p class="hint">
          {liveRules.length ? 'Added with “Always allow”.' : 'Nothing permanently allowed yet.'} By default {ant.name} asks before writing outside its folder, sending anything to people or changing connected services, and hands payments and sign-ins to you.
        </p>
      {:else}
        {#each rules as r}
          <div class="item row">
            <span class="rule">{r.text}</span>
            <span class="mode" class:ask={r.mode === 'Ask first'} class:hand={r.mode === 'Hand off'}>{r.mode}</span>
          </div>
        {/each}
      {/if}
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

{#if editor}<RoutineEditor antId={editor.antId} routine={editor.routine} onclose={() => editor = null} />{/if}

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

  .model-pick {
    display: flex;
    gap: 2px;
    margin-top: 10px;
    padding: 3px;
    border-radius: var(--r-md);
    background: var(--bg-input);
  }

  .model-pick button {
    height: 26px;
    padding: 0 12px;
    border-radius: var(--r-sm);
    font-size: var(--text-xs);
    color: var(--text-muted);
    transition: background var(--dur) var(--ease-out), color var(--dur);
  }

  .model-pick button[aria-checked='true'] {
    background: var(--bg-selected);
    color: var(--text);
  }

  .scope {
    margin-left: 8px;
    font-size: 10.5px;
    color: var(--text-faint);
  }

  .revoke {
    flex: none;
    font-size: var(--text-xs);
    color: var(--text-muted);
    padding: 2px 6px;
    border-radius: var(--r-sm);
    transition: background var(--dur-fast), color var(--dur-fast);
  }

  .revoke:hover {
    background: rgb(229 96 79 / 0.12);
    color: #f4a69b;
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

  .routine {
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }

  .routine-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .routine-summary {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
    text-align: left;
    border-radius: var(--r-sm);
  }

  .routine-name {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    font-size: var(--text-sm);
  }

  .routine-name > span:not(.status-dot) {
    overflow-wrap: anywhere;
  }

  .routine-name :global(svg) {
    flex: none;
    color: var(--text-faint);
    transition: transform var(--dur) var(--ease-out);
  }

  .routine-name :global(.rotated) {
    transform: rotate(180deg);
  }

  .schedule-text {
    overflow-wrap: anywhere;
  }

  .next-run {
    color: var(--text-faint);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: var(--r-full);
    background: var(--text-faint);
    transition: background var(--dur) var(--ease-out);
  }

  .status-dot.succeeded {
    background: var(--ok);
  }

  .status-dot.failed {
    background: var(--danger);
  }

  .status-dot.running {
    background: var(--brand-blue);
  }

  .status-dot.expired {
    background: var(--warn);
  }

  .routine-controls {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  .routine-actions {
    display: flex;
    opacity: 0;
    transform: translateY(3px);
    transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  }

  .routine:hover .routine-actions, .routine:focus-within .routine-actions {
    opacity: 1;
    transform: translateY(0);
  }

  .routine-actions .icon-btn {
    width: 26px;
    height: 24px;
  }

  .toggle {
    border: 0;
    padding: 0;
    margin: 0;
  }

  .toggle:disabled, .routine button:disabled {
    opacity: 0.5;
  }

  .confirm {
    padding: 10px;
    margin-top: 8px;
    border-radius: var(--r-md);
    background: var(--bg-input);
    font-size: var(--text-xs);
    color: var(--text-soft);
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 8px;
  }

  .routine-error {
    margin-top: 6px;
    font-size: var(--text-xs);
    color: var(--danger);
  }

  .empty {
    margin: 10px 0;
    line-height: 1.7;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .new-routine {
    margin-top: 10px;
  }

  @media (hover: none) {
    .routine-actions {
      opacity: 1;
      transform: none;
    }
  }
</style>
