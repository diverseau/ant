<script lang="ts">
  let { checked = $bindable(false), label }: { checked?: boolean; label: string } = $props()
</script>

<button class="switch" role="switch" aria-checked={checked} aria-label={label} onclick={() => (checked = !checked)}>
  <span class="knob"></span>
</button>

<style>
  .switch {
    position: relative;
    flex: none;
    width: 34px;
    height: 20px;
    border-radius: 99px;
    background: var(--bg-selected);
    transition: background var(--dur) var(--ease-out);
  }

  .switch[aria-checked='true'] {
    background: var(--accent);
  }

  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--text);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.4);
    transition:
      transform 320ms var(--ease-spring),
      width 160ms var(--ease-out);
  }

  .switch:active .knob {
    width: 18px;
  }

  .switch[aria-checked='true'] .knob {
    transform: translateX(14px);
  }

  .switch[aria-checked='true']:active .knob {
    transform: translateX(10px);
  }
</style>
