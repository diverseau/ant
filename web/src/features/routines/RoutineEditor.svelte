<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import type { EventSpec, GitHubEvent, RoutineView } from '@ant/shared'
  import Logo from '../../lib/ui/Logo.svelte'
  import Copy from '@lucide/svelte/icons/copy'
  import Globe from '@lucide/svelte/icons/globe'
  import X from '@lucide/svelte/icons/x'
  import { app, createRoutine, updateRoutine } from '../../lib/store.svelte'
  import { collapse, rise } from '../../lib/motion'
  import Modal from '../../lib/ui/Modal.svelte'

  let { antId, routine, onclose }: { antId: string; routine?: RoutineView; onclose: () => void } = $props()

  // The modal is remounted for each edit. The API exposes a description, not the original schedule input.
  const initial = untrack(() => routine)
  let name = $state(initial?.name ?? '')
  let instruction = $state(initial?.instruction ?? '')
  // What starts it: a schedule, an event (GitHub, Slack, a web page changing) or a webhook.
  let trigger = $state<'schedule' | 'event' | 'webhook'>(initial?.trigger === 'watch' ? 'event' : (initial?.trigger ?? 'schedule'))
  const ev = initial?.event
  let source = $state<EventSpec['source']>(ev?.source ?? 'github')
  let repo = $state(ev?.source === 'github' ? ev.repo : '')
  let ghEvents = $state<GitHubEvent[]>(ev?.source === 'github' ? ev.events : ['issue.opened', 'pr.opened'])
  let slackOn = $state<'mention' | 'message' | 'phrase' | 'reaction'>(ev?.source === 'slack' ? ev.on : 'mention')
  let slackChannel = $state(ev?.source === 'slack' ? (ev.channel ?? '') : '')
  let phrase = $state(ev?.source === 'slack' ? (ev.phrase ?? '') : '')
  let emoji = $state(ev?.source === 'slack' ? (ev.emoji ?? '') : '')
  let url = $state(ev?.source === 'watch' ? ev.url : '')
  let every = $state(ev?.source === 'watch' ? ev.everyMinutes : 30)
  let contains = $state(ev?.source === 'watch' ? (ev.contains ?? '') : '')
  const TRIGGERS = ['schedule', 'event', 'webhook'] as const
  const SOURCES = [
    { id: 'github', label: 'GitHub', domain: 'github.com' },
    { id: 'slack', label: 'Slack', domain: 'slack.com' },
    { id: 'watch', label: 'Web page', domain: null },
  ] as const
  const GH: Array<[GitHubEvent, string]> = [['issue.opened', 'New issue'], ['pr.opened', 'New pull request'], ['pr.merged', 'PR merged'], ['push', 'Push'], ['comment', 'Comment'], ['release', 'Release']]
  const spec = $derived<EventSpec>(
    source === 'github'
      ? { source, repo: repo.trim(), events: ghEvents }
      : source === 'slack'
        ? { source, on: slackOn, channel: slackChannel.trim() || undefined, phrase: phrase.trim() || undefined, emoji: emoji.trim() || undefined }
        : { source, url: url.trim(), everyMinutes: Number(every) || 30, contains: contains.trim() || undefined },
  )
  const eventReady = $derived(
    source === 'github' ? !!repo.trim() && ghEvents.length > 0 : source === 'slack' ? slackOn !== 'phrase' || !!phrase.trim() : !!url.trim(),
  )
  let when = $state('')
  let tz = $state(initial?.tz ?? app.timezone)
  let saving = $state(false)
  let error = $state('')
  let errorField = $state<'name' | 'instruction' | 'when' | 'tz' | 'form'>('form')
  let credentials = $state<{ url: string; key: string } | null>(null)
  let copied = $state('')
  let copyError = $state('')
  let element: HTMLDivElement | undefined = $state()

  onMount(() => {
    // Keep app navigation shortcuts from unmounting a pending one-time-key response.
    const shortcuts = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) e.stopPropagation()
    }
    element?.addEventListener('keydown', shortcuts)
    return () => element?.removeEventListener('keydown', shortcuts)
  })

  const examples = ['every weekday at 9am', 'every 2 hours', '0 9 * * 1-5']
  const canSave = $derived(!!name.trim() && !!instruction.trim() && (trigger === 'webhook' || (trigger === 'event' ? eventReady : !!routine || !!when.trim())))
  const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`
  const curl = $derived(credentials ? `curl -X POST ${quote(credentials.url)} \\\n  -H ${quote(`Authorization: Bearer ${credentials.key}`)} \\\n  -H 'Content-Type: application/json' \\\n  -d '{}'` : '')

  function close() {
    // Keep the modal mounted until the response containing the one-time key has arrived.
    if (!saving) onclose()
  }

  async function save() {
    if (!canSave || saving) return
    saving = true
    error = ''
    try {
      if (routine) {
        await updateRoutine(routine.id, {
          name: name.trim(), instruction: instruction.trim(), tz: tz.trim() || app.timezone,
          ...(trigger === 'schedule' && when.trim() && { when: when.trim() }),
          ...(trigger === 'event' && { event: spec }),
        })
        onclose()
      } else {
        const result = await createRoutine({
          antId, name: name.trim(), instruction: instruction.trim(), when: when.trim(), tz: tz.trim() || app.timezone,
          trigger: trigger === 'event' ? (source === 'watch' ? 'watch' : 'event') : trigger,
          ...(trigger === 'event' && { event: spec }),
        })
        if (result.key && result.routine.webhookUrl) credentials = { url: result.routine.webhookUrl, key: result.key }
        else onclose()
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      errorField = /time ?zone/i.test(error) ? 'tz' : /schedule|cron|understand|weekday|interval|past|date|time/i.test(error) ? 'when' : /instruction/i.test(error) ? 'instruction' : /name/i.test(error) ? 'name' : 'form'
    } finally {
      saving = false
    }
  }

  async function copy(value: string, label: string) {
    copyError = ''
    try {
      await navigator.clipboard.writeText(value)
      copied = label
    } catch {
      copyError = 'Could not copy. Select the text and copy it manually.'
    }
  }
</script>

<Modal onclose={close} label={credentials ? 'Copy webhook details' : routine ? 'Edit routine' : 'New routine'}>
  <div class="editor" bind:this={element}>
    <header>
      <h2>{credentials ? 'Copy these now' : routine ? 'Edit routine' : 'New routine'}</h2>
      <button class="icon-btn" aria-label="Close routine editor" disabled={saving} onclick={close}><X size={16} /></button>
    </header>

    {#if credentials}
      <div class="credentials" in:rise>
        <p class="description">Your webhook routine is ready. Save these details somewhere safe.</p>
        <p class="warning">The key won't be shown again after you close this window.</p>
        {#each [{ label: 'URL', value: credentials.url }, { label: 'Key', value: credentials.key }, { label: 'curl example', value: curl }] as detail}
          <div class="copy-field">
            <div class="copy-head">
              <span>{detail.label}</span>
              <button type="button" class="btn btn-ghost" onclick={() => copy(detail.value, detail.label)} aria-label="Copy {detail.label}">
                <Copy size={13} /> {copied === detail.label ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre>{detail.value}</pre>
          </div>
        {/each}
        {#if copyError}<p class="error" role="alert">{copyError}</p>{/if}
        <p class="sr-only" aria-live="polite">{copied ? `${copied} copied` : ''}</p>
        <div class="actions"><button class="btn btn-accent" onclick={close}>Done</button></div>
      </div>
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); save() }}>
        <fieldset disabled={saving}>
          <label>
            <span>Name</span>
            <input bind:value={name} maxlength="80" required aria-invalid={!!error && errorField === 'name'} placeholder="Morning brief" />
            {#if error && errorField === 'name'}<span class="error" role="alert">{error}</span>{/if}
          </label>
          <label>
            <span>Instruction</span>
            <textarea bind:value={instruction} rows="4" maxlength="8000" required aria-invalid={!!error && errorField === 'instruction'} placeholder="What should this ant do each time?"></textarea>
            {#if error && errorField === 'instruction'}<span class="error" role="alert">{error}</span>{/if}
          </label>
          {#if !routine}
            <div class="seg" role="group" aria-label="Routine trigger">
              <span class="selection" style:transform="translateX({TRIGGERS.indexOf(trigger) * 100}%)"></span>
              <button type="button" aria-pressed={trigger === 'schedule'} onclick={() => { trigger = 'schedule'; error = '' }}>Schedule</button>
              <button type="button" aria-pressed={trigger === 'event'} onclick={() => { trigger = 'event'; error = '' }}>Event</button>
              <button type="button" aria-pressed={trigger === 'webhook'} onclick={() => { trigger = 'webhook'; error = '' }}>Webhook</button>
            </div>
          {/if}
          {#if trigger === 'schedule'}
            <div class="schedule" transition:collapse>
              <label>
                <span>When</span>
                <input bind:value={when} maxlength="200" required={!routine} aria-invalid={!!error && errorField === 'when'} placeholder={routine ? 'Leave blank to keep the current schedule' : 'every weekday at 9am, every 2 hours, 0 9 * * 1-5'} />
                {#if error && errorField === 'when'}<span class="error" role="alert">{error}</span>{/if}
              </label>
              {#if routine}<p class="hint">Current: {routine.when}</p>{/if}
              <div class="examples" aria-label="Schedule examples">
                {#each examples as example}<button type="button" onclick={() => { when = example; error = '' }}>{example}</button>{/each}
              </div>
            </div>
          {:else if trigger === 'event'}
            <div class="event" transition:collapse>
              {#if !routine}
                <div class="sources" role="radiogroup" aria-label="Event source">
                  {#each SOURCES as s}
                    <button type="button" role="radio" aria-checked={source === s.id} class:on={source === s.id} onclick={() => { source = s.id; error = '' }}>
                      {#if s.domain}<Logo name={s.label} domain={s.domain} size={20} />{:else}<Globe size={17} />{/if} {s.label}
                    </button>
                  {/each}
                </div>
              {/if}
              {#key source}
                <div class="fields" in:rise={{ y: 4, duration: 220 }}>
                  {#if source === 'github'}
                    <label><span>Repository</span><input bind:value={repo} placeholder="owner/repo" autocapitalize="off" spellcheck="false" /></label>
                    <div class="chips" role="group" aria-label="GitHub events">
                      {#each GH as [id, label]}
                        <button type="button" aria-pressed={ghEvents.includes(id)} onclick={() => (ghEvents = ghEvents.includes(id) ? ghEvents.filter((x) => x !== id) : [...ghEvents, id])}>{label}</button>
                      {/each}
                    </div>
                    <p class="hint">Checked every 2 minutes, no public address needed. Private repos need a <code>GITHUB_TOKEN</code> secret (Connectors → Secrets).</p>
                  {:else if source === 'slack'}
                    <div class="chips" role="group" aria-label="Slack event">
                      {#each [['mention', 'Bot mentioned'], ['message', 'Any message'], ['phrase', 'Message with phrase'], ['reaction', 'Reaction']] as [id, label]}
                        <button type="button" aria-pressed={slackOn === id} onclick={() => (slackOn = id as typeof slackOn)}>{label}</button>
                      {/each}
                    </div>
                    {#if slackOn === 'phrase'}<label><span>Phrase</span><input bind:value={phrase} placeholder="bug report" /></label>{/if}
                    {#if slackOn === 'reaction'}<label><span>Emoji (optional)</span><input bind:value={emoji} placeholder=":eyes:" /></label>{/if}
                    <label><span>Channel (optional)</span><input bind:value={slackChannel} placeholder="#bugs, or leave blank for any" /></label>
                    <p class="hint">Uses your Slack channel connection (Connectors → Channels). Invite the bot to the channel; anyone in it can trigger this.</p>
                  {:else}
                    <label><span>Page</span><input bind:value={url} type="url" placeholder="https://example.com/pricing" /></label>
                    <div class="row2">
                      <label><span>Check every (minutes)</span><input bind:value={every} type="number" min="5" max="1440" /></label>
                      <label><span>Only when it mentions (optional)</span><input bind:value={contains} placeholder="in stock" /></label>
                    </div>
                    <p class="hint">Ant checks the page itself and only wakes the ant when the text changes, so quiet checks use none of your Claude usage. Public pages only.</p>
                  {/if}
                </div>
              {/key}
            </div>
          {:else}
            <p class="description" in:rise>Runs when you send a POST request to its webhook URL.</p>
            {#if routine?.webhookUrl}
              <div class="copy-field">
                <div class="copy-head"><span>URL</span><button type="button" class="btn btn-ghost" onclick={() => copy(routine!.webhookUrl!, 'URL')}><Copy size={13} /> {copied === 'URL' ? 'Copied' : 'Copy URL'}</button></div>
                <pre>{routine.webhookUrl}</pre>
                <p class="hint">Use Authorization: Bearer &lt;your saved key&gt;. The key is shown only when created.</p>
              </div>
              {#if copyError}<p class="error" role="alert">{copyError}</p>{/if}
            {/if}
          {/if}
          {#if trigger === 'schedule'}
            <label>
              <span>Time zone</span>
              <input bind:value={tz} placeholder={app.timezone} aria-invalid={!!error && errorField === 'tz'} />
              {#if error && errorField === 'tz'}<span class="error" role="alert">{error}</span>{/if}
            </label>
          {/if}
        </fieldset>
        {#if error && (errorField === 'form' || (errorField === 'when' && trigger !== 'schedule'))}<p class="error" role="alert">{error}</p>{/if}
        <div class="actions">
          <button type="button" class="btn btn-ghost" disabled={saving} onclick={close}>Cancel</button>
          <button type="submit" class="btn btn-accent" disabled={!canSave || saving}>{saving ? 'Saving…' : routine ? 'Save changes' : 'Create routine'}</button>
        </div>
      </form>
    {/if}
  </div>
</Modal>

<style>
  .editor {
    padding: 22px 24px;
  }

  header, .copy-head, .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  header {
    margin-bottom: 18px;
  }

  h2 {
    font-size: var(--text-lg);
    font-weight: 500;
  }

  form, fieldset, .credentials {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label > span, .copy-head > span {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  input, textarea {
    width: 100%;
    padding: 10px 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--border);
    background: var(--bg-input);
    font-size: var(--text-sm);
    transition: border-color var(--dur-fast) var(--ease-out);
  }

  input:focus, textarea:focus {
    border-color: var(--border-focus);
  }

  input[aria-invalid='true'], textarea[aria-invalid='true'] {
    border-color: var(--danger);
  }

  textarea {
    resize: vertical;
    font-family: var(--font-body);
    line-height: 1.6;
  }

  .seg {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 3px;
    border-radius: var(--r-md);
    background: var(--bg-input);
  }

  .selection {
    position: absolute;
    top: 3px;
    left: 3px;
    height: 32px;
    width: calc(33.333% - 2px);
    border-radius: var(--r-sm);
    background: var(--bg-selected);
    transition: transform var(--dur-slow) var(--ease-spring);
  }

  .seg button {
    position: relative;
    height: 32px;
    font-size: var(--text-sm);
    color: var(--text-muted);
    transition: color var(--dur-fast) var(--ease-out);
  }

  .seg button[aria-pressed='true'] {
    color: var(--text);
  }

  .schedule {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .examples {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .examples button {
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: var(--r-full);
    font-size: var(--text-xs);
    color: var(--text-muted);
    transition: color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  }

  .examples button:hover {
    color: var(--text);
  }

  .examples button:active {
    transform: scale(0.96);
  }

  .description {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    line-height: 1.6;
    color: var(--text-soft);
  }

  .hint {
    font-size: var(--text-xs);
    line-height: 1.6;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }

  .warning {
    padding: 10px 12px;
    border-radius: var(--r-md);
    background: var(--warn-soft);
    color: var(--warn);
    font-size: var(--text-sm);
  }

  .copy-field {
    min-width: 0;
  }

  pre {
    margin: 8px 0;
    padding: 12px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--bg-input);
    font-size: var(--text-xs);
    line-height: 1.7;
    user-select: all;
  }

  .error, label > .error {
    color: var(--danger);
    font-size: var(--text-xs);
    line-height: 1.6;
  }

  .actions {
    justify-content: flex-end;
    margin-top: 4px;
  }

  button:disabled {
    opacity: 0.5;
  }

  .event,
  .fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .sources {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .sources button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 40px;
    border-radius: var(--r-md);
    border: 1px solid var(--border);
    font-size: var(--text-sm);
    color: var(--text-muted);
    transition:
      border-color var(--dur-fast),
      color var(--dur-fast),
      background var(--dur-fast),
      transform var(--dur-fast) var(--ease-out);
  }

  .sources button:hover {
    color: var(--text);
  }

  .sources button.on {
    border-color: var(--border-focus);
    background: var(--accent-soft);
    color: var(--text);
  }

  .sources button:active {
    transform: scale(0.97);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chips button {
    height: 30px;
    padding: 0 12px;
    border-radius: var(--r-full);
    border: 1px solid var(--border);
    font-size: var(--text-xs);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      border-color var(--dur-fast),
      transform var(--dur-fast) var(--ease-out);
  }

  .chips button[aria-pressed='true'] {
    background: var(--bg-selected);
    border-color: var(--border-strong);
    color: var(--text);
  }

  .chips button:active {
    transform: scale(0.95);
  }

  .row2 {
    display: grid;
    grid-template-columns: 1fr 1.6fr;
    gap: 10px;
  }

  @media (max-width: 520px) {
    .row2 {
      grid-template-columns: 1fr;
    }
  }
</style>
