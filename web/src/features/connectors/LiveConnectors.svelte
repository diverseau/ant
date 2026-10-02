<script lang="ts">
  import ExternalLink from '@lucide/svelte/icons/external-link'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import Plus from '@lucide/svelte/icons/plus'
  import Trash from '@lucide/svelte/icons/trash-2'
  import type { ChannelStatus, ConnectorsView } from '@ant/shared'
  import { slide } from 'svelte/transition'
  import { api } from '../../lib/api'
  import { rise } from '../../lib/motion'
  import { app, connectorsDo, loadConnectors } from '../../lib/store.svelte'
  import AntPicker from './AntPicker.svelte'

  type Tab = 'claudeai' | 'custom' | 'secrets' | 'channels'
  const tabs: { id: Tab; label: string }[] = [
    { id: 'claudeai', label: 'Connectors' },
    { id: 'custom', label: 'Custom' },
    { id: 'secrets', label: 'Secrets' },
    { id: 'channels', label: 'Channels' },
  ]
  let tab: Tab = $state('claudeai')
  const idx = $derived(tabs.findIndex((t) => t.id === tab))

  loadConnectors()

  const view = $derived(app.connectors)
  const setView = (v: ConnectorsView) => (app.connectors = v)
  const setChannels = (c: ChannelStatus[]) => (app.channels = c)

  /* ---- custom connector form ---- */
  let adding = $state(false)
  let cName = $state('')
  let cTransport: 'http' | 'stdio' = $state('http')
  let cUrl = $state('')
  let cCommand = $state('')
  let cError = $state('')

  function splitArgs(line: string): string[] {
    return (line.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((a) => a.replace(/^["']|["']$/g, ''))
  }

  async function addCustom() {
    cError = ''
    if (!cName.trim()) return (cError = 'Give it a name.')
    if (cTransport === 'http' && !/^https?:\/\/\S+$/.test(cUrl.trim())) return (cError = 'Enter an http(s) URL.')
    if (cTransport === 'stdio' && !cCommand.trim()) return (cError = 'Enter the command to run.')
    const [command, ...args] = splitArgs(cCommand.trim())
    const ok = await connectorsDo(
      () => api.addConnector(cTransport === 'http' ? { name: cName, transport: 'http', url: cUrl.trim() } : { name: cName, transport: 'stdio', command, args }),
      setView,
      'Connector added',
    )
    if (ok) {
      adding = false
      cName = cUrl = cCommand = ''
    }
  }

  /* ---- secrets ---- */
  let sAdding = $state(false)
  let sName = $state('')
  let sDesc = $state('')
  let sValue = $state('')
  let replacing: string | null = $state(null)
  let replaceValue = $state('')

  async function addSecret() {
    const ok = await connectorsDo(() => api.addSecret({ name: sName, description: sDesc, value: sValue, allAnts: false, antIds: [] }), setView, 'Secret saved')
    if (ok) {
      sAdding = false
      sName = sDesc = sValue = ''
    }
  }

  /* ---- channels ---- */
  const kinds = [
    { kind: 'telegram' as const, label: 'Telegram', secret: 'TELEGRAM_BOT_TOKEN', tokenHint: 'Bot token from @BotFather', idHint: 'Your numeric user id (message @userinfobot)' },
    { kind: 'discord' as const, label: 'Discord', secret: 'DISCORD_BOT_TOKEN', tokenHint: 'Bot token from the Developer Portal', idHint: 'Your user id (Developer Mode → Copy User ID)' },
    { kind: 'slack' as const, label: 'Slack', secret: 'SLACK_TOKENS', tokenHint: 'xoxb-… bot token | xapp-… app token', idHint: 'Your member id (Profile → ⋯ → Copy member ID)' },
  ]
  let chToken: Record<string, string> = $state({})
  let chUsers: Record<string, string> = $state({})

  async function saveChannel(k: (typeof kinds)[number], enabled: boolean) {
    const token = chToken[k.kind]?.trim()
    const existing = view?.secrets.find((s) => s.name === k.secret)
    if (token) {
      const ok = existing
        ? await connectorsDo(() => api.updateSecret(existing.id, { value: token }), setView)
        : await connectorsDo(() => api.addSecret({ name: k.secret, description: `${k.label} bot token (used by Ant, not by ants)`, value: token, antIds: [] }), setView)
      if (!ok) return
    } else if (!existing) return
    const st = app.channels.find((c) => c.kind === k.kind)
    const users = (chUsers[k.kind] ?? st?.allowUsers.join(', ') ?? '').split(/[\s,]+/).filter(Boolean)
    const ok = await connectorsDo(() => api.setChannel(k.kind, { enabled, tokenSecret: k.secret, allowUsers: users }), setChannels, enabled ? `${k.label} connected` : `${k.label} paused`)
    if (ok) chToken[k.kind] = ''
  }
</script>

<div class="head">
  <h2>Connectors</h2>
  <div class="tabs" role="tablist" style:--n={tabs.length}>
    {#each tabs as t}
      <button role="tab" aria-selected={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
    {/each}
    <span class="tab-pill" style:transform="translateX({idx * 100}%)"></span>
  </div>
</div>

{#if !view}
  <p class="muted pad">Loading…</p>
{:else if tab === 'claudeai'}
  <div class="body" in:rise={{ y: 6, duration: 240 }}>
    <p class="lede">
      Your claude.ai connectors, available to ants through Claude Code. Switch any of them off for specific ants.
      <a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer">Manage on claude.ai <ExternalLink size={12} /></a>
    </p>
    {#each view.claudeAi as c (c.key)}
      <div class="card" in:rise>
        <div class="row">
          <span class="logo">{c.name[0]}</span>
          <span class="name">{c.name}</span>
          {#if c.status === 'connected'}<span class="pill ok">Connected</span>
          {:else if c.status === 'needs-auth'}<a class="pill warn" href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer">Connect on claude.ai</a>
          {:else}<span class="pill err">Error</span>{/if}
        </div>
        <AntPicker
          selected={app.ants.filter((a) => !c.disabledFor.includes(a.id)).map((a) => a.id)}
          onchange={(_all, ids) => connectorsDo(() => api.setClaudeAi(c.key, app.ants.filter((a) => !ids.includes(a.id)).map((a) => a.id)), setView)}
        />
      </div>
    {:else}
      <p class="empty">Your claude.ai connectors (Gmail, Calendar…) appear here after an ant's first run.</p>
    {/each}
  </div>
{:else if tab === 'custom'}
  <div class="body" in:rise={{ y: 6, duration: 240 }}>
    <p class="lede">MCP servers you add yourself: a remote URL, or a command run on this computer.</p>
    {#each view.custom as c (c.id)}
      <div class="card" in:rise out:slide={{ duration: 200 }}>
        <div class="row">
          <span class="logo">{c.name[0].toUpperCase()}</span>
          <span class="name">{c.name}</span>
          <code class="sub">{c.transport === 'http' ? c.url : [c.command, ...(c.args ?? [])].join(' ')}</code>
          <button class="icon-btn" aria-label="Remove {c.name}" onclick={() => connectorsDo(() => api.deleteConnector(c.id), setView, 'Removed')}><Trash size={14} /></button>
        </div>
        <AntPicker allowAll all={c.allAnts} selected={c.antIds} onchange={(all, ids) => connectorsDo(() => api.scopeConnector(c.id, all, ids), setView)} />
      </div>
    {:else}
      {#if !adding}<p class="empty">No custom connectors yet.</p>{/if}
    {/each}
    {#if adding}
      <form class="card form" in:slide={{ duration: 220 }} onsubmit={(e) => (e.preventDefault(), addCustom())}>
        <input bind:value={cName} placeholder="Name, e.g. linear" maxlength="40" />
        <div class="seg">
          <button type="button" class:on={cTransport === 'http'} onclick={() => (cTransport = 'http')}>Remote URL</button>
          <button type="button" class:on={cTransport === 'stdio'} onclick={() => (cTransport = 'stdio')}>Local command</button>
        </div>
        {#if cTransport === 'http'}
          <input bind:value={cUrl} placeholder="https://mcp.example.com/mcp" />
        {:else}
          <input bind:value={cCommand} placeholder={'npx -y @modelcontextprotocol/server-filesystem "/path"'} />
        {/if}
        {#if cError}<p class="error">{cError}</p>{/if}
        <div class="actions">
          <button type="button" class="btn btn-ghost" onclick={() => (adding = false)}>Cancel</button>
          <button class="btn btn-accent">Add connector</button>
        </div>
      </form>
    {:else}
      <button class="btn btn-ghost add" onclick={() => (adding = true)}><Plus size={14} /> Add a connector</button>
    {/if}
  </div>
{:else if tab === 'secrets'}
  <div class="body" in:rise={{ y: 6, duration: 240 }}>
    <p class="lede">Encrypted values given to chosen ants as environment variables. Values never come back to this screen.</p>
    {#each view.secrets as s (s.id)}
      <div class="card" in:rise out:slide={{ duration: 200 }}>
        <div class="row">
          <span class="logo"><KeyRound size={14} /></span>
          <code class="name mono">${s.name}</code>
          <span class="sub">{s.description}</span>
          <button class="btn btn-ghost sm" onclick={() => ((replacing = replacing === s.id ? null : s.id), (replaceValue = ''))}>Replace value</button>
          <button class="icon-btn" aria-label="Delete {s.name}" onclick={() => connectorsDo(() => api.deleteSecret(s.id), setView, 'Deleted')}><Trash size={14} /></button>
        </div>
        {#if replacing === s.id}
          <form class="inline" transition:slide={{ duration: 200 }} onsubmit={(e) => (e.preventDefault(), connectorsDo(() => api.updateSecret(s.id, { value: replaceValue }), setView, 'Updated').then((ok) => ok && (replacing = null)))}>
            <input type="password" bind:value={replaceValue} placeholder="New value" autocomplete="off" />
            <button class="btn btn-accent" disabled={!replaceValue}>Save</button>
          </form>
        {/if}
        <AntPicker allowAll all={s.allAnts} selected={s.antIds} onchange={(all, ids) => connectorsDo(() => api.updateSecret(s.id, { allAnts: all, antIds: ids }), setView)} />
      </div>
    {:else}
      {#if !sAdding}<p class="empty">No secrets yet. Add API keys or tokens your ants need.</p>{/if}
    {/each}
    {#if sAdding}
      <form class="card form" in:slide={{ duration: 220 }} onsubmit={(e) => (e.preventDefault(), addSecret())}>
        <input bind:value={sName} placeholder="GITHUB_TOKEN" autocomplete="off" />
        <input bind:value={sDesc} placeholder="What it's for (ants see this)" maxlength="300" />
        <input type="password" bind:value={sValue} placeholder="Value" autocomplete="off" />
        <p class="hint">Choose which ants get it after saving.</p>
        <div class="actions">
          <button type="button" class="btn btn-ghost" onclick={() => (sAdding = false)}>Cancel</button>
          <button class="btn btn-accent" disabled={!sName || !sValue}>Save secret</button>
        </div>
      </form>
    {:else}
      <button class="btn btn-ghost add" onclick={() => (sAdding = true)}><Plus size={14} /> Add a secret</button>
    {/if}
  </div>
{:else}
  <div class="body" in:rise={{ y: 6, duration: 240 }}>
    <p class="lede">Talk to your ants from chat apps. Only the user ids you allow are heard. In chat: <code>/ants</code>, <code>/use name</code>, <code>/stop</code>.</p>
    {#each kinds as k (k.kind)}
      {@const st = app.channels.find((c) => c.kind === k.kind)}
      <div class="card">
        <div class="row">
          <span class="logo">{k.label[0]}</span>
          <span class="name">{k.label}</span>
          {#if st?.connected}<span class="pill ok">Connected{st.botName ? ` as ${st.botName}` : ''}</span>
          {:else if st?.error}<span class="pill err" title={st.error}>{st.error}</span>
          {:else if st}<span class="pill">Paused</span>{/if}
        </div>
        <div class="fields">
          <input type="password" bind:value={chToken[k.kind]} placeholder={st ? 'Token saved · paste to replace' : k.tokenHint} autocomplete="off" />
          <input value={chUsers[k.kind] ?? st?.allowUsers.join(', ') ?? ''} oninput={(e) => (chUsers[k.kind] = e.currentTarget.value)} placeholder={k.idHint} />
        </div>
        <div class="actions">
          {#if st}
            <button class="btn btn-ghost" onclick={() => connectorsDo(() => api.deleteChannel(k.kind), setChannels, 'Removed')}>Remove</button>
            <button class="btn btn-ghost" onclick={() => saveChannel(k, !st.enabled)}>{st.enabled ? 'Pause' : 'Resume'}</button>
          {/if}
          <button class="btn btn-accent" onclick={() => saveChannel(k, true)}>{st ? 'Save' : 'Connect'}</button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 20px 22px 6px;
  }

  h2 {
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 1.35rem;
  }

  .tabs {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
    padding: 3px;
    border-radius: var(--r-md);
    background: var(--bg-input);
  }

  .tabs button {
    position: relative;
    z-index: 1;
    height: 28px;
    padding: 0 12px;
    font-size: var(--text-sm);
    color: var(--text-muted);
    transition: color var(--dur);
  }

  .tabs button[aria-selected='true'] {
    color: var(--text);
  }

  .tab-pill {
    position: absolute;
    top: 3px;
    left: 3px;
    width: calc((100% - 6px) / var(--n));
    height: 28px;
    border-radius: var(--r-sm);
    background: var(--bg-selected);
    transition: transform 340ms var(--ease-spring);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 22px 22px;
  }

  .pad {
    padding: 16px 22px 24px;
  }

  .lede,
  .muted,
  .hint,
  .empty {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .lede a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--accent);
    text-decoration: none;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-radius: var(--r-lg);
    border: 1px solid var(--border);
    background: var(--bg-raised);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .logo {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: var(--r-md);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
    font-size: var(--text-sm);
  }

  .name {
    font-size: var(--text-md);
    font-weight: 500;
  }

  .mono {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 12.5px;
  }

  .sub {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .pill {
    margin-left: auto;
    padding: 2px 8px;
    border-radius: var(--r-sm);
    font-size: var(--text-xs);
    background: rgb(255 255 255 / 0.06);
    color: var(--text-muted);
    text-decoration: none;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pill.ok {
    background: rgb(66 194 142 / 0.14);
    color: var(--ok);
  }

  .pill.warn {
    background: var(--warn-soft);
    color: var(--warn);
  }

  .pill.err {
    background: rgb(229 96 79 / 0.14);
    color: #f4a69b;
  }

  .form,
  .fields {
    gap: 8px;
  }

  .fields {
    display: flex;
    flex-direction: column;
  }

  input {
    height: 36px;
    padding: 0 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--border);
    background: var(--bg-input);
    font-size: var(--text-sm);
    transition: border-color var(--dur-fast);
  }

  input:focus {
    border-color: #4a4948;
  }

  .seg {
    display: flex;
    gap: 6px;
  }

  .seg button {
    height: 30px;
    padding: 0 12px;
    border-radius: var(--r-full);
    border: 1px solid var(--border-strong);
    font-size: var(--text-sm);
    color: var(--text-soft);
    transition: background var(--dur-fast), color var(--dur-fast);
  }

  .seg button.on {
    background: var(--text);
    border-color: var(--text);
    color: #141413;
  }

  .inline {
    display: flex;
    gap: 8px;
  }

  .inline input {
    flex: 1;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .add {
    align-self: flex-start;
  }

  .sm {
    height: 28px;
    padding: 0 10px;
    font-size: var(--text-xs);
  }

  .error {
    font-size: var(--text-xs);
    color: #f4a69b;
  }

  code {
    font-size: 0.92em;
    color: var(--text-soft);
  }
</style>
