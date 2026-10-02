export const base = `http://127.0.0.1:${process.env.ANT_PORT ?? 7431}`
export const events = []
export async function connect() {
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws')
  ws.onmessage = (m) => events.push(JSON.parse(m.data))
  await new Promise((r) => (ws.onopen = r))
  return ws
}
export const json = (r) => r.json()
export const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) })
export async function until(pred, ms = 180_000, from = 0) {
  const t0 = Date.now()
  while (!events.slice(from).some(pred)) {
    if (Date.now() - t0 > ms) return false
    await new Promise((r) => setTimeout(r, 250))
  }
  return true
}
export async function createAnt(name, extra = {}) {
  const ant = await json(await post('/api/ants', { name, description: 'Test ant. Be brief.', color: 'blue', accessory: 'none', ...extra }))
  const thread = (await json(await fetch(base + '/api/bootstrap'))).threads.find((t) => t.refId === ant.id)
  return { ant, thread }
}
export async function say(thread, text, ms) {
  const from = events.length
  await post(`/api/threads/${thread.id}/messages`, { text })
  return until((e) => e.type === 'typing' && e.antId === null, ms, from)
}
export async function messages(thread) {
  return json(await fetch(`${base}/api/threads/${thread.id}/messages`))
}
let failed = 0
export function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`)
  if (!ok) failed++
}
export function done() {
  process.exit(failed ? 1 : 0)
}
