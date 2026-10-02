<script lang="ts">
  import Download from '@lucide/svelte/icons/download'
  import X from '@lucide/svelte/icons/x'
  import RichText from '../../features/chat/RichText.svelte'
  import { app } from '../store.svelte'
  import Modal from './Modal.svelte'

  const v = $derived(app.viewer!)
  const url = $derived(`/api/ants/${v.antId}/file?path=${encodeURIComponent(v.path)}`)
  let kind: 'loading' | 'markdown' | 'text' | 'image' | 'pdf' | 'other' | 'error' = $state('loading')
  let text = $state('')
  let error = $state('')

  $effect(() => {
    const u = url
    kind = 'loading'
    fetch(u)
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`)
        const type = r.headers.get('content-type') ?? ''
        if (type.startsWith('image/')) kind = 'image'
        else if (type === 'application/pdf') kind = 'pdf'
        else if (type.startsWith('text/markdown')) {
          text = await r.text()
          kind = 'markdown'
        } else if (type.startsWith('text/') || type.includes('json')) {
          text = await r.text()
          kind = 'text'
        } else kind = 'other'
      })
      .catch((err) => {
        error = String(err.message ?? err)
        kind = 'error'
      })
  })

  const close = () => (app.viewer = null)
</script>

<Modal onclose={close} width={860} label={v.name}>
  <div class="head">
    <div class="title">
      <span class="name">{v.name}</span>
      <span class="path">{v.path}</span>
    </div>
    <a class="icon-btn" href="{url}&download=1" aria-label="Download" title="Download"><Download size={16} /></a>
    <button class="icon-btn" aria-label="Close" onclick={close}><X size={16} /></button>
  </div>
  <div class="body" class:pad={kind === 'markdown' || kind === 'text' || kind === 'other' || kind === 'error'}>
    {#if kind === 'loading'}
      <div class="muted">Loading…</div>
    {:else if kind === 'markdown'}
      <RichText {text} />
    {:else if kind === 'text'}
      <pre>{text}</pre>
    {:else if kind === 'image'}
      <img src={url} alt={v.name} />
    {:else if kind === 'pdf'}
      <iframe src={url} title={v.name}></iframe>
    {:else if kind === 'other'}
      <div class="muted">No preview for this file type. Use download.</div>
    {:else}
      <div class="muted">Couldn't open this file: {error}</div>
    {/if}
  </div>
</Modal>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 12px 12px 18px;
    border-bottom: 1px solid var(--border);
  }

  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .name {
    font-size: var(--text-md);
    font-weight: 500;
  }

  .path {
    font-size: var(--text-xs);
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .body {
    max-height: 70vh;
    overflow: auto;
  }

  .body.pad {
    padding: 18px 22px 22px;
  }

  pre {
    margin: 0;
    font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--text-soft);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  img {
    display: block;
    max-width: 100%;
    margin: 0 auto;
  }

  iframe {
    display: block;
    width: 100%;
    height: 70vh;
    border: 0;
    background: #fff;
  }

  .muted {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
</style>
