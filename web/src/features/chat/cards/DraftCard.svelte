<script lang="ts">
  import Mail from '@lucide/svelte/icons/mail'
  import Hash from '@lucide/svelte/icons/hash'
  import Check from '@lucide/svelte/icons/check'
  import { decideApproval, draftAction, threadById } from '../../../lib/store.svelte'
  import type { DraftMessage } from '../../../lib/types'

  let { m, threadId }: { m: DraftMessage; threadId: string } = $props()

  // Editable local copy; committed on Send.
  // svelte-ignore state_referenced_locally
  let body = $state(m.body)
  let ta: HTMLTextAreaElement | undefined = $state()

  $effect(() => {
    void body
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  })

  function send() {
    draftAction(threadId, m.id, 'sent', body)
    const pending = threadById(threadId)?.messages.find((x) => x.kind === 'approval' && !x.decision && x.author === m.author)
    if (pending) decideApproval(threadId, pending.id, 'once')
  }
</script>

<div class="card" class:sent={m.state === 'sent'} class:discarded={m.state === 'discarded'}>
  <div class="head">
    {#if m.channel === 'email'}<Mail size={14} />{:else}<Hash size={14} />{/if}
    <span>{m.channel === 'email' ? 'New Email' : 'New Slack Message'}</span>
    {#if m.state === 'sent'}
      <span class="stamp"><Check size={12} strokeWidth={2.8} /> Sent</span>
    {:else if m.state === 'discarded'}
      <span class="stamp off">Discarded</span>
    {/if}
  </div>
  <div class="fields">
    <div class="field"><span>To</span>{m.to}</div>
    {#if m.subject}<div class="field"><span>Subject</span>{m.subject}</div>{/if}
  </div>
  <textarea bind:this={ta} bind:value={body} rows="3" readonly={!!m.state} spellcheck="true"></textarea>
  {#if !m.state}
    <div class="actions">
      <button class="btn btn-ghost" onclick={() => draftAction(threadId, m.id, 'discarded')}>Discard</button>
      <button class="btn btn-primary" onclick={send}>Send</button>
    </div>
  {/if}
</div>

<style>
  .card {
    width: min(480px, 100%);
    border-radius: var(--r-xl);
    background: var(--bg-bubble);
    overflow: hidden;
    transition:
      opacity var(--dur-slow),
      filter var(--dur-slow);
  }

  .card.discarded {
    opacity: 0.5;
    filter: grayscale(1);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 11px 14px 9px;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-soft);
  }

  .stamp {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: var(--r-sm);
    background: rgb(66 194 142 / 0.14);
    color: var(--ok);
    font-size: var(--text-xs);
    animation: stamp 480ms var(--ease-spring) both;
  }

  .stamp.off {
    background: rgb(255 255 255 / 0.07);
    color: var(--text-muted);
  }

  .fields {
    border-top: 1px solid var(--border);
  }

  .field {
    display: flex;
    gap: 10px;
    padding: 7px 14px;
    border-bottom: 1px solid var(--border);
    font-size: var(--text-sm);
  }

  .field span {
    width: 52px;
    color: var(--text-faint);
  }

  textarea {
    display: block;
    width: 100%;
    min-height: 80px;
    padding: 11px 14px;
    border: 0;
    resize: none;
    background: transparent;
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.55;
    overflow: hidden;
  }

  textarea:focus {
    background: rgb(255 255 255 / 0.02);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 0 12px 12px;
  }

  @keyframes stamp {
    from {
      transform: scale(1.6) rotate(-8deg);
      opacity: 0;
    }
  }
</style>
