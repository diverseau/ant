<script lang="ts">
  import Play from '@lucide/svelte/icons/play'
  import Share from '@lucide/svelte/icons/share-2'
  import Trash from '@lucide/svelte/icons/trash-2'
  import X from '@lucide/svelte/icons/x'
  import { onMount, untrack } from 'svelte'
  import { api } from '../../lib/api'
  import { rise } from '../../lib/motion'
  import { app, notify, refreshSkills } from '../../lib/store.svelte'
  import Modal from '../../lib/ui/Modal.svelte'

  // View, edit or write a skill: a SKILL.md the ant follows when you type /name.
  let {
    antId,
    antName,
    threadId,
    skill,
    onclose,
  }: { antId: string; antName: string; threadId: string; skill?: { name: string; scope: 'ant' | 'colony' }; onclose: () => void } = $props()

  // Opened for one skill; it doesn't follow later prop changes.
  const initial = untrack(() => skill)
  const editing = !!initial
  let name = $state(initial?.name ?? '')
  let description = $state('')
  let body = $state('')
  let scope = $state<'ant' | 'colony'>(initial?.scope ?? 'ant')
  let files = $state<string[]>([])
  let loading = $state(editing)
  let busy = $state(false)
  let error = $state('')
  let confirmDelete = $state(false)

  const slug = $derived(name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64))
  const ready = $derived(!!slug && !!description.trim() && !!body.trim() && !busy)

  onMount(() => {
    if (!skill) {
      body = '## When to use\n\n## Steps\n1. \n\n## Check it worked\n\n## What needs approval\n'
      return
    }
    api
      .skill(antId, skill.name, skill.scope)
      .then((s) => {
        description = s.description
        body = s.body.replace(/^\n+/, '')
        files = s.files
      })
      .catch((e) => (error = e.message))
      .finally(() => (loading = false))
  })

  async function save() {
    if (!ready) return
    busy = true
    error = ''
    try {
      const r = await api.saveSkill(antId, slug, { description: description.trim(), body: body.trim() + '\n', scope })
      if (r.warnings.length) notify(`Saved with warnings: ${r.warnings.join('; ')}`, 'warn')
      refreshSkills()
      onclose()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }

  async function share() {
    busy = true
    try {
      await api.shareSkill(antId, skill!.name)
      notify(`/${skill!.name} is now shared with every ant`)
      refreshSkills()
      onclose()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }

  async function remove() {
    busy = true
    try {
      await api.deleteSkill(antId, skill!.name, skill!.scope)
      refreshSkills()
      onclose()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      busy = false
    }
  }

  function run() {
    app.drafts[threadId] = `/${skill!.name} `
    onclose()
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[data-composer]')?.focus())
  }
</script>

<Modal onclose={() => !busy && onclose()} width={680} label={editing ? `Skill /${skill?.name}` : 'New skill'}>
  <form class="editor" onsubmit={(e) => (e.preventDefault(), save())}>
    <header>
      <h2>{editing ? `/${skill?.name}` : 'New skill'}</h2>
      {#if editing}<span class="scope">{scope === 'colony' ? 'Every ant' : antName}</span>{/if}
      <button type="button" class="icon-btn" aria-label="Close" onclick={onclose}><X size={16} /></button>
    </header>

    {#if loading}
      <p class="muted">Loading…</p>
    {:else}
      <div class="fields" in:rise={{ y: 6, duration: 240 }}>
        {#if !editing}
          <label>
            <span>Name</span>
            <input bind:value={name} placeholder="weekly-report" spellcheck="false" maxlength="64" />
            {#if name && slug !== name}<small>Saved as /{slug}</small>{/if}
          </label>
        {/if}
        <label>
          <span>When to use it</span>
          <input bind:value={description} maxlength="1024" placeholder="Writes the weekly report from Linear and the calendar. Use when asked for the weekly report." />
          <small>{antName} reads this to decide when the skill applies.</small>
        </label>
        <label class="grow">
          <span>Instructions</span>
          <textarea bind:value={body} spellcheck="true" rows="14"></textarea>
        </label>
        {#if files.length}<p class="muted">Supporting files: {files.join(', ')}</p>{/if}
        {#if !editing}
          <label class="check"><input type="checkbox" checked={scope === 'colony'} onchange={(e) => (scope = e.currentTarget.checked ? 'colony' : 'ant')} /> Share with every ant</label>
        {/if}
        {#if error}<p class="error" role="alert">{error}</p>{/if}
      </div>

      <div class="actions">
        {#if editing}
          {#if confirmDelete}
            <button type="button" class="btn danger" disabled={busy} onclick={remove}>Delete /{skill?.name}</button>
            <button type="button" class="btn btn-ghost" onclick={() => (confirmDelete = false)}>Keep</button>
          {:else}
            <button type="button" class="icon-btn" aria-label="Delete skill" title="Delete" onclick={() => (confirmDelete = true)}><Trash size={15} /></button>
            {#if scope === 'ant'}<button type="button" class="btn btn-ghost" disabled={busy} onclick={share}><Share size={14} /> Share with every ant</button>{/if}
            <button type="button" class="btn btn-ghost" onclick={run}><Play size={14} /> Use now</button>
          {/if}
        {/if}
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost" onclick={onclose}>Cancel</button>
        <button class="btn btn-accent" disabled={!ready}>{busy ? 'Saving…' : editing ? 'Save' : 'Create skill'}</button>
      </div>
    {/if}
  </form>
</Modal>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px 22px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  h2 {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: var(--text-lg);
    font-weight: 600;
  }

  header .icon-btn {
    margin-left: auto;
  }

  .scope {
    padding: 2px 8px;
    border-radius: var(--r-full);
    background: var(--bg-active);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  input:not([type='checkbox']),
  textarea {
    padding: 9px 11px;
    border-radius: var(--r-md);
    border: 1px solid var(--border-strong);
    background: var(--bg-input);
    font-size: var(--text-sm);
    color: var(--text);
  }

  textarea {
    min-height: 260px;
    resize: vertical;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 12.5px;
    line-height: 1.6;
  }

  small {
    color: var(--text-faint);
  }

  .check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    color: var(--text-soft);
  }

  .muted {
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .error {
    font-size: var(--text-sm);
    color: #f4a69b;
  }

  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .spacer {
    flex: 1;
  }

  .danger {
    background: rgb(229 96 79 / 0.16);
    color: #f4a69b;
  }
</style>
