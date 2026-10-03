import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource-variable/lora/wght.css'
import '@fontsource-variable/lora/wght-italic.css'
import './styles/tokens.css'
import './styles/base.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { registerWorker } from './lib/push'

const app = mount(App, {
  target: document.getElementById('app')!,
})

// Installable app + push notifications (needs https or localhost).
void registerWorker()

export default app
