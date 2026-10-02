import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
const antd = `http://127.0.0.1:${process.env.ANT_PORT ?? 7420}`

export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/api': antd,
      '/ws': { target: antd, ws: true },
    },
  },
})
