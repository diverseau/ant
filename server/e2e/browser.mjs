import { base, check, connect, createAnt, done, json, messages, post, say } from './lib.mjs'

const ws = await connect()
const { ant, thread } = await createAnt('Webby')
const finished = await say(thread, 'Use your browser to open https://example.com and tell me the page title. One line.')
const msgs = await messages(thread)
const tools = msgs.filter((m) => m.kind === 'tool' && m.name.startsWith('mcp__browser__'))
const last = msgs.filter((m) => m.kind === 'text' && m.author !== 'user').at(-1)
check('turn finished', finished)
// Opening a page returns its title and snapshot; the ant may also retry a failed read.
check('used browser tools', tools.some((t) => /Opened/.test(t.title) && t.state === 'ok'), tools.map((t) => `${t.title}:${t.state}`).join(', '))
check('answer mentions Example Domain', /example domain/i.test(last?.text ?? ''), last?.text)
const state = await json(await fetch(`${base}/api/ants/${ant.id}/computer`))
check('computer running on example.com', state.running && /example\.com/.test(state.url ?? ''), state.url)

const screen = new WebSocket(`${base.replace('http', 'ws')}/ws/ants/${ant.id}/screen`)
let frames = 0
screen.onmessage = (m) => JSON.parse(m.data).type === 'frame' && frames++
await new Promise((r) => setTimeout(r, 2500))
check('screencast frames', frames > 0, `${frames} frames`)

check('take over', (await json(await post(`/api/ants/${ant.id}/computer/lease`, { holder: 'user' }))).lease === 'user')
screen.send(JSON.stringify({ type: 'navigate', url: 'https://www.iana.org/help/example-domains' }))
await new Promise((r) => setTimeout(r, 3000))
const after = await json(await fetch(`${base}/api/ants/${ant.id}/computer`))
check('user navigation works', /iana\.org/.test(after.url ?? ''), after.url)
check('hand back', (await json(await post(`/api/ants/${ant.id}/computer/lease`, { holder: 'ant' }))).lease === 'ant')

const again = await say(thread, 'What page is your browser on now? Check with your browser and answer with the URL only.')
const last2 = (await messages(thread)).filter((m) => m.kind === 'text' && m.author !== 'user').at(-1)
check('ant sees page the user opened', again && /iana\.org/.test(last2?.text ?? ''), last2?.text)
screen.close()
ws.close()
done()
