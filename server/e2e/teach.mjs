import { readdirSync, readFileSync } from 'node:fs'
import { base, check, connect, createAnt, done, events, json, messages, post, until } from './lib.mjs'

const ws = await connect()
const { ant, thread } = await createAnt('Student')
await post(`/api/ants/${ant.id}/computer/start`)
check('take over', (await json(await post(`/api/ants/${ant.id}/computer/lease`, { holder: 'user' }))).lease === 'user')
const st = await json(await post(`/api/ants/${ant.id}/computer/teach`, { action: 'start', title: 'check the example domain page' }))
check('teaching started', !!st.teaching, JSON.stringify(st.teaching))
const screen = new WebSocket(`${base.replace('http', 'ws')}/ws/ants/${ant.id}/screen`)
await new Promise((r) => (screen.onopen = r))
screen.send(JSON.stringify({ type: 'navigate', url: 'https://example.com' }))
await new Promise((r) => setTimeout(r, 2500))
screen.send(JSON.stringify({ type: 'mouse', action: 'mousePressed', x: 0.5, y: 0.45, button: 'left', clickCount: 1 }))
screen.send(JSON.stringify({ type: 'mouse', action: 'mouseReleased', x: 0.5, y: 0.45, button: 'left', clickCount: 1 }))
await new Promise((r) => setTimeout(r, 2500))
const from = events.length
const end = await json(await post(`/api/ants/${ant.id}/computer/teach`, { action: 'stop' }))
check('teaching stopped and handed back', !end.teaching && end.lease === 'ant')
const dir = `${process.env.ANT_HOME}/student/teach`
const rec = readdirSync(dir)[0]
const md = readFileSync(`${dir}/${rec}/steps.md`, 'utf8')
check('recording has steps and screenshots', /Opened https:\/\/example\.com/.test(md) && /Clicked/.test(md) && /\.jpg/.test(md), md.split('\n').slice(4, 8).join(' | '))
check('ant got the lesson', await until((e) => e.type === 'typing' && e.antId === null, 240_000, from))
const last = (await messages(thread)).filter((m) => m.kind === 'text' && m.author !== 'user').at(-1)?.text ?? ''
check('ant responded about the demonstration', last.length > 20, last.slice(0, 200))
screen.close()
ws.close()
done()
