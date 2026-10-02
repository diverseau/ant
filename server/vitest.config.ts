import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Never pop real desktop notifications from tests.
    env: { ANT_NO_DESKTOP_NOTIFY: '1' },
  },
})
