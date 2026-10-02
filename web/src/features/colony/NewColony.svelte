<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import Crown from '@lucide/svelte/icons/crown'
  import Ant from '../../lib/ant/Ant.svelte'
  import AntStack from '../../lib/ant/AntStack.svelte'
  import { pop } from '../../lib/motion'
  import { app, createColony } from '../../lib/store.svelte'
  import Modal from '../../lib/ui/Modal.svelte'

  let name = $state('')
  let picked = $state<string[]>([])
  let lead = $state<string | null>(null)
  let busy = $state(false)
  let error = $state('')
  const selected = $derived(picked.map((id) => app.ants.find((a) => a.id === id)).filter((a) => a !== undefined))
  const leadId = $derived(selected.some((a) => a.id === lead) ? lead! : selected[0]?.id)
  const canCreate = $derived(name.trim().length > 0 && selected.length >= 2 && selected.length <= 6 && !busy && app.mode !== 'connecting')
  const close = () => (app.overlay = null)

  function toggle(id: string) {
    if (busy) return
    if (picked.includes(id)) picked = picked.filter((m) => m !== id)
    else if (selected.length < 6) picked = [...picked, id]
    if (!picked.includes(lead ?? '')) lead = picked[0] ?? null
    error = ''
  }

  async function create() {
    if (!canCreate) return
    busy = true
    error = ''
    try {
      await createColony({ name, memberIds: selected.map((a) => a.id), leadAntId: leadId })
      if (app.overlay === 'new-colony') close()
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      busy = false
    }
  }
</script>

<Modal onclose={close} width={720} label="New colony">
  <form onsubmit={(e) => { e.preventDefault(); void create() }}>
    <div class="heading">
      <div>
        <h2>Form a colony</h2>
        <p class="intro">Bring 2–6 ants together in one chat.</p>
      </div>
      <div class="preview" aria-label="Selected ants"><AntStack ants={selected} size={76} /></div>
    </div>

    <label class="field">
      <span>Name</span>
      <input bind:value={name} placeholder="The planning crew" maxlength="60" disabled={busy} />
    </label>

    <div class="selection-heading"><span>Choose your ants</span><span role="status">{selected.length} / 6 selected</span></div>
    <div class="ants">
      {#each app.ants as ant (ant.id)}
        <button
          type="button"
          class="ant-card"
          class:picked={picked.includes(ant.id)}
          aria-pressed={picked.includes(ant.id)}
          disabled={busy || (!picked.includes(ant.id) && selected.length >= 6)}
          onclick={() => toggle(ant.id)}
        >
          <div class="avatar"><Ant color={ant.color} accessory={ant.accessory} status={ant.status} size={48} /></div>
          <span class="ant-name">{ant.name}</span>
          <span class="label">{ant.label || 'Helpful ant'}</span>
          {#if picked.includes(ant.id)}<span class="check" in:pop><Check size={12} /></span>{/if}
        </button>
      {/each}
    </div>
    {#if app.ants.length < 2}<p class="intro">Hatch at least two ants to form a colony.</p>{/if}

    {#if selected.length}
      <div class="field">
        <span><Crown size={13} /> Lead ant</span>
        <p class="hint">The lead replies when you don’t @mention an ant.</p>
        <div class="leads" role="radiogroup" aria-label="Lead ant">
          {#each selected as ant (ant.id)}
            <button type="button" role="radio" aria-checked={leadId === ant.id} disabled={busy} onclick={() => lead = ant.id}>
              {#if leadId === ant.id}<Crown size={13} />{/if}{ant.name}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button type="button" class="btn btn-ghost" onclick={close}>Cancel</button>
      <button type="submit" class="btn btn-accent" disabled={!canCreate}>{busy ? 'Creating…' : 'Create colony'}</button>
    </div>
  </form>
</Modal>

<style>
  form { display: flex; flex-direction: column; gap: 18px; padding: 24px; }
  .heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  h2 { font-size: 1.35rem; font-weight: 500; }
  .intro { margin-top: 6px; font-family: var(--font-body); font-size: var(--text-sm); color: var(--text-muted); }
  .preview { flex: none; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field > span { display: flex; align-items: center; gap: 6px; font-size: var(--text-xs); color: var(--text-soft); }
  input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--bg-input); font-size: var(--text-md); }
  input:focus { border-color: var(--border-focus); }
  .selection-heading { display: flex; justify-content: space-between; gap: 8px; font-size: var(--text-xs); color: var(--text-muted); }
  .ants { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .ant-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 16px 10px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--bg-input); transition: transform var(--dur-slow) var(--ease-spring); }
  .ant-card:hover:not(:disabled) { transform: translateY(-3px); }
  .ant-card:active:not(:disabled) { transform: scale(0.96); }
  .ant-card.picked { border-color: var(--accent); background: var(--accent-soft); }
  .avatar { transition: transform var(--dur-slow) var(--ease-spring); }
  .picked .avatar { transform: scale(1.12) rotate(-4deg); }
  .ant-name { font-size: var(--text-sm); overflow-wrap: anywhere; }
  .label { font-size: var(--text-xs); color: var(--text-muted); overflow-wrap: anywhere; }
  .check { position: absolute; top: 8px; right: 8px; display: grid; place-items: center; width: 20px; height: 20px; border-radius: var(--r-full); background: var(--accent); color: var(--bg-app); }
  .hint { font-size: var(--text-xs); color: var(--text-muted); }
  .leads { display: flex; flex-wrap: wrap; gap: 6px; }
  .leads button { display: flex; align-items: center; gap: 5px; padding: 6px 10px; border: 1px solid var(--border-strong); border-radius: var(--r-full); font-size: var(--text-sm); transition: transform var(--dur) var(--ease-spring); }
  .leads button:hover { transform: translateY(-1px); }
  .leads button:active { transform: scale(0.96); }
  .leads button[aria-checked='true'] { color: var(--accent); background: var(--accent-soft); border-color: var(--accent); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  button:disabled { opacity: 0.45; }
  .error { color: var(--danger); font-size: var(--text-sm); }
  @media (max-width: 520px) { .ants { grid-template-columns: repeat(2, minmax(0, 1fr)); } form { padding: 18px; } }
  @media (prefers-reduced-motion: reduce) { .ant-card, .avatar, .leads button { transition: none; } }
</style>
