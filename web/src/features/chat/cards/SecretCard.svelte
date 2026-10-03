<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import Lock from '@lucide/svelte/icons/lock'
  import { answerSecret } from '../../../lib/store.svelte'
  import type { SecretMessage } from '../../../lib/types'

  // The value is posted once and never kept in the page or shown again.
  let { m }: { m: SecretMessage } = $props()
  let value = $state('')
  let busy = $state(false)
  let error = $state('')

  async function save(decline = false) {
    if (busy || (!decline && !value)) return
    busy = true
    error = ''
    try {
      await answerSecret(m.id, decline ? null : value)
      value = ''
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      busy = false
    }
  }
</script>

<div class="card" class:done={!!m.state}>
  <div class="head">
    <span class="icon"><KeyRound size={14} /></span>
    <span class="name">{m.name}</span>
    {#if m.state === 'saved'}<span class="stamp"><Check size={12} strokeWidth={2.8} /> Saved securely</span>
    {:else if m.state === 'declined'}<span class="stamp off">Declined</span>{/if}
  </div>
  {#if m.description}<p class="desc">{m.description}</p>{/if}
  {#if m.why}<p class="why">{m.why}</p>{/if}
  {#if !m.state}
    <form onsubmit={(e) => (e.preventDefault(), save())}>
      <input type="password" bind:value autocomplete="off" spellcheck="false" placeholder="Paste the value" aria-label="Value for {m.name}" disabled={busy} />
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        <span class="note"><Lock size={11} /> Encrypted on this computer. The ant gets it as ${m.name}, never in chat.</span>
        <button type="button" class="btn btn-ghost" disabled={busy} onclick={() => save(true)}>Decline</button>
        <button class="btn btn-primary" disabled={busy || !value}>{busy ? 'Saving…' : 'Save securely'}</button>
      </div>
    </form>
  {/if}
</div>

<style>
  .card {
    width: min(480px, 100%);
    padding: 14px 16px;
    border-radius: var(--r-xl);
    background: var(--bg-bubble);
    border: 1px solid var(--border);
    transition:
      opacity var(--dur-slow) var(--ease-out),
      border-color var(--dur);
  }

  .card.done {
    opacity: 0.75;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .icon {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: var(--r-sm);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .name {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .stamp {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    font-size: var(--text-xs);
    color: var(--ok);
  }

  .stamp.off {
    color: var(--text-faint);
  }

  .desc {
    margin-top: 8px;
    font-size: var(--text-sm);
    color: var(--text-soft);
  }

  .why {
    margin-top: 4px;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--text-muted);
  }

  form {
    margin-top: 12px;
  }

  input {
    width: 100%;
    height: 38px;
    padding: 0 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--border-strong);
    background: var(--bg-input);
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: var(--text-sm);
    transition:
      border-color var(--dur),
      box-shadow var(--dur);
  }

  input:focus {
    outline: none;
    border-color: var(--border-focus);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }

  .note {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-right: auto;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .error {
    margin-top: 6px;
    font-size: var(--text-xs);
    color: #f4a69b;
  }

  @media (max-width: 520px) {
    .actions {
      flex-wrap: wrap;
    }

    .note {
      width: 100%;
    }
  }
</style>
