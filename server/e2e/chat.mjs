import { check, connect, createAnt, done, events, messages, post, say, until } from './lib.mjs'

const ws = await connect()
const { thread } = await createAnt('Pip')
check('reply', await say(thread, 'Reply with exactly: hello from Pip'))
let msgs = await messages(thread)
check('text streamed', msgs.some((m) => m.kind === 'text' && /hello from pip/i.test(m.text)))

check('checklist turn', await say(thread, 'Use report_checklist with two items: Files → checked, Web → skipped (ok false). Then say done.'))
msgs = await messages(thread)
check('checklist card', msgs.some((m) => m.kind === 'checklist' && m.items.length === 2))

check('file turn', await say(thread, 'Write workspace/note.txt containing hi, then share it with share_file.'))
msgs = await messages(thread)
check('file card', msgs.some((m) => m.kind === 'file' && m.name === 'note.txt'))

const from = events.length
await post(`/api/threads/${thread.id}/messages`, { text: 'Use the Write tool to create /tmp/ant-e2e-outside.txt containing x. Do not use request_approval first; just call Write.' })
check('approval card', await until((e) => e.type === 'message.created' && e.message.kind === 'approval', 120_000, from))
const card = events.slice(from).find((e) => e.type === 'message.created' && e.message.kind === 'approval').message
await post(`/api/approvals/${card.approvalId}`, { decision: 'deny' })
check('turn ends after deny', await until((e) => e.type === 'typing' && e.antId === null, 120_000, from))
const fs = await import('node:fs')
check('file outside folder not written', !fs.existsSync('/tmp/ant-e2e-outside.txt'))

check('memory turn', await say(thread, 'Remember with the memory tool that my favourite colour is teal. Then say ok.'))
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '')
const saved = read(`${process.env.ANT_HOME}/pip/memory/MEMORY.md`) + read(`${process.env.ANT_HOME}/USER.md`)
check('memory saved (own notes or shared USER.md)', saved.toLowerCase().includes('teal'))
ws.close()
done()
