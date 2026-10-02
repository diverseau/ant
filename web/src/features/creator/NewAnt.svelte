<script lang="ts">
  import Shuffle from '@lucide/svelte/icons/shuffle'
  import Ant from '../../lib/ant/Ant.svelte'
  import { app, createAnt } from '../../lib/store.svelte'
  import type { Accessory, AntColor } from '../../lib/types'
  import Modal from '../../lib/ui/Modal.svelte'

  const colors: AntColor[] = ['coral', 'purple', 'yellow', 'green', 'blue']
  const accessories: { id: Accessory; label: string }[] = [
    { id: 'none', label: 'None' },
    { id: 'satchel', label: 'Satchel' },
    { id: 'leaf', label: 'Leaf' },
    { id: 'wrench', label: 'Wrench' },
    { id: 'glasses', label: 'Glasses' },
  ]
  const names = ['Nova', 'Pip', 'Juniper', 'Atlas', 'Mochi', 'Fern', 'Rook', 'Basil', 'Clover', 'Echo']
  const jobs = [
    { label: 'Chief of staff', description: 'Run my week: calendar, follow-ups and decisions. Bring me what matters, hold the rest.' },
    { label: 'Inbox manager', description: 'Keep my inbox at zero. Draft replies in my voice. Never send without asking.' },
    { label: 'Researcher', description: 'Research one topic at a time. Cite sources, separate evidence from guesses.' },
    { label: 'Expense manager', description: 'File receipts from my inbox into the expense tool every Friday. Flag anything odd.' },
  ]

  let color: AntColor = $state(colors[Math.floor(Math.random() * colors.length)])
  let accessory: Accessory = $state('none')
  let name = $state('')
  let label = $state('')
  let description = $state('')
  let wiggle = $state(0)

  const close = () => (app.overlay = null)
  const canCreate = $derived(name.trim().length > 0)

  function pickJob(j: (typeof jobs)[number]) {
    label = j.label
    description = j.description
  }

  function shuffle() {
    color = colors[(colors.indexOf(color) + 1 + Math.floor(Math.random() * 4)) % colors.length]
    accessory = accessories[Math.floor(Math.random() * accessories.length)].id
    name = names[Math.floor(Math.random() * names.length)]
    wiggle++
  }

  function create() {
    if (!canCreate) return
    createAnt({ name: name.trim(), label: label.trim() || undefined, description: description.trim() || 'A helpful ant.', color, accessory })
    close()
  }
</script>

<Modal onclose={close} width={720} label="New ant">
  <div class="grid">
    <div class="stage" style:--c="var(--ant-{color})">
      {#key wiggle}
        <div class="preview">
          <Ant {color} {accessory} mode="full" size={190} follow status="attention" />
        </div>
      {/key}
      <div class="nameplate">{name || 'New ant'}</div>
      <button class="icon-btn shuffle" onclick={shuffle} aria-label="Randomise" title="Surprise me"><Shuffle size={16} /></button>
    </div>

    <form
      onsubmit={(e) => {
        e.preventDefault()
        create()
      }}
    >
      <h2>Hatch a new ant</h2>

      <label>
        <span>Name</span>
        <input bind:value={name} placeholder="Nova" maxlength="24" />
      </label>

      <div class="field">
        <span>Colour</span>
        <div class="swatches" role="radiogroup" aria-label="Colour">
          {#each colors as c}
            <button
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              class="swatch"
              style:--c="var(--ant-{c})"
              onclick={() => (color = c)}
            ></button>
          {/each}
        </div>
      </div>

      <div class="field">
        <span>Carrying</span>
        <div class="seg" role="radiogroup" aria-label="Accessory">
          {#each accessories as a}
            <button type="button" role="radio" aria-checked={accessory === a.id} onclick={() => (accessory = a.id)}>{a.label}</button>
          {/each}
        </div>
      </div>

      <div class="field">
        <span>Job</span>
        <div class="jobs">
          {#each jobs as j}
            <button type="button" class:on={label === j.label} onclick={() => pickJob(j)}>{j.label}</button>
          {/each}
        </div>
      </div>

      <label>
        <span>Instructions</span>
        <textarea bind:value={description} rows="3" placeholder="What should this ant do? What should it never do?"></textarea>
      </label>

      <div class="actions">
        <button type="button" class="btn btn-ghost" onclick={close}>Cancel</button>
        <button type="submit" class="btn btn-accent" disabled={!canCreate} class:dim={!canCreate}>Hatch {name.trim() || 'ant'}</button>
      </div>
    </form>
  </div>
</Modal>

<style>
  .grid {
    display: grid;
    grid-template-columns: 260px 1fr;
    min-height: 460px;
  }

  .stage {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background:
      radial-gradient(circle at 50% 42%, color-mix(in oklab, var(--c) 22%, transparent), transparent 62%),
      #141413;
    border-right: 1px solid var(--border);
    transition: background 500ms var(--ease-out);
  }

  .preview {
    animation: hatch 620ms var(--ease-spring) both;
  }

  .nameplate {
    font-family: var(--font-body);
    font-size: 1.35rem;
    font-weight: 500;
    min-height: 1.6em;
  }

  .shuffle {
    position: absolute;
    top: 12px;
    right: 12px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 22px 24px;
  }

  h2 {
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 1.35rem;
  }

  label,
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label > span,
  .field > span {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-faint);
  }

  input,
  textarea {
    width: 100%;
    padding: 9px 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--border);
    background: var(--bg-input);
    font-size: var(--text-md);
    resize: none;
    transition:
      border-color var(--dur-fast),
      box-shadow var(--dur-fast);
  }

  textarea {
    font-family: var(--font-body);
    line-height: 1.5;
  }

  input:focus,
  textarea:focus {
    border-color: #4a4948;
    box-shadow: 0 0 0 3px rgb(255 255 255 / 0.03);
  }

  .swatches {
    display: flex;
    gap: 10px;
  }

  .swatch {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 0 0 transparent;
    transition:
      transform 300ms var(--ease-spring),
      box-shadow var(--dur) var(--ease-out);
  }

  .swatch:hover {
    transform: scale(1.12);
  }

  .swatch[aria-checked='true'] {
    box-shadow:
      0 0 0 3px #1a1a19,
      0 0 0 5px var(--c);
    transform: scale(1.05);
  }

  .seg,
  .jobs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .seg button,
  .jobs button {
    height: 30px;
    padding: 0 11px;
    border-radius: var(--r-full);
    border: 1px solid var(--border-strong);
    font-size: var(--text-sm);
    color: var(--text-soft);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      border-color var(--dur-fast),
      transform var(--dur-fast) var(--ease-out);
  }

  .seg button:hover,
  .jobs button:hover {
    background: var(--bg-hover);
  }

  .seg button:active,
  .jobs button:active {
    transform: scale(0.95);
  }

  .seg button[aria-checked='true'],
  .jobs button.on {
    background: var(--text);
    border-color: var(--text);
    color: #141413;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: auto;
  }

  .dim {
    opacity: 0.45;
  }

  @keyframes hatch {
    from {
      opacity: 0;
      transform: scale(0.7) translateY(16px) rotate(-6deg);
    }
  }

  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
    }

    .stage {
      min-height: 220px;
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
  }
</style>
