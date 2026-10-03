<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import Lock from '@lucide/svelte/icons/lock'
  import LockOpen from '@lucide/svelte/icons/lock-open'
  import Pencil from '@lucide/svelte/icons/pencil'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Zap from '@lucide/svelte/icons/zap'
  import { DEFAULT_PERMISSION_MODE, EFFORTS, modelInfo, PERMISSION_MODES, type Ant, type Effort, type PermissionMode } from '@ant/shared'
  import { app, notify, updateAnt } from '../../lib/store.svelte'
  import ClaudeMark from '../../lib/ui/ClaudeMark.svelte'
  import Popover from '../../lib/ui/Popover.svelte'
  import ModelMenu from './ModelMenu.svelte'
  import OptionList, { type OptionSection } from './OptionList.svelte'

  // Model, effort and permission pickers under the composer (Codex-style), per ant.
  let { ant, busy = false }: { ant: Ant; busy?: boolean } = $props()

  const icons = { supervised: Lock, edits: Pencil, auto: Sparkles, full: LockOpen }

  let open: 'model' | 'effort' | 'perm' | null = $state(null)
  let anchors: Record<'model' | 'effort' | 'perm', HTMLElement | undefined> = $state({ model: undefined, effort: undefined, perm: undefined })

  const modelId = $derived(ant.model || app.settings?.defaultModel || 'sonnet')
  const model = $derived(modelInfo(modelId))
  const effort = $derived((ant.effort || model.defaultEffort || '') as Effort | '')
  const mode = $derived((ant.permissionMode ?? DEFAULT_PERMISSION_MODE) as PermissionMode)
  const modeInfo = $derived(PERMISSION_MODES.find((m) => m.id === mode)!)
  const fast = $derived(!!ant.fast && !!model.fast)

  function apply(patch: Parameters<typeof updateAnt>[1]) {
    open = null
    if (app.mode === 'live' && busy) notify(`Applies when ${ant.name} finishes this turn.`)
    updateAnt(ant.id, patch)
  }

  function toggle(which: NonNullable<typeof open>) {
    open = open === which ? null : which
  }

  const effortSections = $derived<OptionSection[]>([
    {
      title: 'Reasoning',
      hint: model.defaultEffort ? undefined : `${model.name.replace('Claude ', '')} has no effort setting.`,
      items: EFFORTS.map((e) => ({
        id: e.id,
        label: e.label,
        badge: e.id === model.defaultEffort ? 'Default' : undefined,
        selected: e.id === effort,
        disabled: !model.defaultEffort,
        // Picking the model's default stores nothing, so the ant follows the model.
        onpick: () => apply({ effort: e.id === model.defaultEffort ? '' : e.id }),
      })),
    },
    {
      title: 'Speed',
      items: [
        { id: 'standard', label: 'Standard', badge: 'Default', selected: !fast, onpick: () => apply({ fast: false }) },
        {
          id: 'fast',
          label: 'Fast',
          note: model.fast ? 'Faster output, billed as extra usage' : 'Opus models only',
          selected: fast,
          disabled: !model.fast,
          onpick: () => apply({ fast: true }),
        },
      ],
    },
  ])

  const permSections = $derived<OptionSection[]>([
    {
      items: PERMISSION_MODES.map((m) => ({
        id: m.id,
        label: m.label,
        note: m.note,
        icon: icons[m.id],
        selected: m.id === mode,
        onpick: () => apply({ permissionMode: m.id }),
      })),
    },
  ])
</script>

<div class="opts">
  <button bind:this={anchors.model} class="opt" class:open={open === 'model'} aria-haspopup="dialog" aria-expanded={open === 'model'} title="Model" onclick={() => toggle('model')}>
    <ClaudeMark size={14} />
    <span class="text">{model.name.replace('Claude ', '')}</span>
    <span class="chev"><ChevronDown size={14} /></span>
  </button>
  <span class="div"></span>
  <button bind:this={anchors.effort} class="opt" class:open={open === 'effort'} aria-haspopup="dialog" aria-expanded={open === 'effort'} title="Effort and speed" onclick={() => toggle('effort')}>
    {#if fast}<span class="zap"><Zap size={13} fill="currentColor" /></span>{/if}
    <span class="text">{(model.defaultEffort && EFFORTS.find((e) => e.id === effort)?.label) || 'Default'}</span>
    <span class="chev"><ChevronDown size={14} /></span>
  </button>
  <span class="div"></span>
  <button bind:this={anchors.perm} class="opt" class:open={open === 'perm'} class:full={mode === 'full'} aria-haspopup="dialog" aria-expanded={open === 'perm'} title="Permissions" onclick={() => toggle('perm')}>
    {#key mode}
      {@const Icon = icons[mode]}
      <span class="picon"><Icon size={14} /></span>
    {/key}
    <span class="text">{modeInfo.label}</span>
    <span class="chev"><ChevronDown size={14} /></span>
  </button>
</div>

{#if open === 'model' && anchors.model}
  <Popover anchor={anchors.model} label="Choose a model" width={360} onclose={() => (open = null)}>
    <ModelMenu current={model.id} onpick={(id) => apply({ model: id })} onclose={() => (open = null)} />
  </Popover>
{:else if open === 'effort' && anchors.effort}
  <Popover anchor={anchors.effort} label="Effort and speed" width={232} onclose={() => (open = null)}>
    <OptionList label="Effort and speed" sections={effortSections} onclose={() => (open = null)} />
  </Popover>
{:else if open === 'perm' && anchors.perm}
  <Popover anchor={anchors.perm} label="Permissions" width={340} onclose={() => (open = null)}>
    <OptionList label="Permissions" sections={permSections} onclose={() => (open = null)} />
  </Popover>
{/if}

<style>
  .opts {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }

  .opt {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 28px;
    padding: 0 8px;
    border-radius: var(--r-md);
    font-size: var(--text-sm);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-fast) var(--ease-out);
  }

  .opt:hover,
  .opt.open {
    background: var(--bg-hover);
    color: var(--text);
  }

  .opt:active {
    transform: scale(0.96);
  }

  .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chev {
    display: grid;
    flex: none;
    color: var(--text-faint);
    transition: transform var(--dur-slow) var(--ease-spring);
  }

  .open .chev {
    transform: rotate(180deg);
  }

  .zap {
    display: grid;
    color: var(--warn);
  }

  .picon {
    display: grid;
    animation: swap var(--dur-slow) var(--ease-spring);
  }

  .full .picon {
    color: var(--warn);
  }

  .div {
    flex: none;
    width: 1px;
    height: 14px;
    margin: 0 4px;
    background: var(--border-strong);
  }

  @keyframes swap {
    from {
      opacity: 0;
      transform: scale(0.6) rotate(-20deg);
    }
  }

  /* Phones: keep labels whole; the row scrolls sideways if it ever runs out of room. */
  @media (max-width: 720px) {
    .opt {
      flex: none;
    }
  }
</style>
