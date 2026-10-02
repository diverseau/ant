<script lang="ts">
  import FileText from '@lucide/svelte/icons/file-text'
  import Image from '@lucide/svelte/icons/image'
  import FileCode from '@lucide/svelte/icons/file-code-2'
  import Database from '@lucide/svelte/icons/database'
  import File from '@lucide/svelte/icons/file'
  import type { FileMessage } from '../../../lib/types'

  let { m, onopen }: { m: FileMessage; onopen?: (path: string) => void } = $props()

  const family = $derived.by(() => {
    const ext = m.name.split('.').at(-1)?.toLowerCase() ?? ''
    if (['md', 'txt', 'pdf', 'doc', 'docx', 'rtf', 'odt'].includes(ext)) return { name: 'doc', icon: FileText }
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'heic'].includes(ext)) return { name: 'image', icon: Image }
    if (['ts', 'tsx', 'js', 'jsx', 'svelte', 'html', 'css', 'py', 'rs', 'go', 'sh', 'java', 'c', 'cpp'].includes(ext)) return { name: 'code', icon: FileCode }
    if (['json', 'csv', 'tsv', 'xml', 'yaml', 'yml', 'sql', 'db', 'xlsx'].includes(ext)) return { name: 'data', icon: Database }
    return { name: 'other', icon: File }
  })

  function size(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  }
</script>

<div class="card">
  <span class="tile {family.name}"><family.icon size={19} /></span>
  <div class="copy">
    <div class="name">{m.name}</div>
    <div class="path" dir="rtl"><bdi>{m.path}</bdi></div>
    {#if m.bytes !== undefined}<div class="size tabular">{size(m.bytes)}</div>{/if}
  </div>
  <button class="btn btn-ghost" aria-label="Open {m.name}" onclick={() => onopen?.(m.path)}>Open</button>
</div>

<style>
  .card {
    display: flex;
    align-items: center;
    gap: 11px;
    width: min(420px, 100%);
    padding: 12px;
    border-radius: var(--r-xl);
    background: var(--bg-bubble);
    transition: transform var(--dur) var(--ease-out);
  }

  .card:hover,
  .card:focus-within {
    transform: translateY(-1px);
  }

  .tile {
    display: grid;
    place-items: center;
    flex: none;
    width: 38px;
    height: 42px;
    border-radius: var(--r-md);
    color: var(--text-muted);
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  .tile.doc { color: var(--brand-blue); }
  .tile.image { color: var(--ant-purple); }
  .tile.code { color: var(--accent); }
  .tile.data { color: var(--brand-green); }

  .copy {
    flex: 1;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .path {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: left;
    margin-top: 2px;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .size {
    margin-top: 3px;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .btn {
    flex: none;
  }
</style>
