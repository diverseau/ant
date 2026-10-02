// Scripted stand-in for a real agent backend. Picks a reply shape from the
// message, then streams it word by word so the UI can be exercised end to end.
import { app, antById, push, setStatus, threadById } from '../store.svelte'
import type { Message, TextMessage, Thread } from '../types'
import { uid } from './data'

const timers = new Map<string, number[]>()

function later(threadId: string, ms: number, fn: () => void) {
  const id = window.setTimeout(fn, ms)
  const list = timers.get(threadId) ?? []
  list.push(id)
  timers.set(threadId, list)
}

function clear(threadId: string) {
  for (const id of timers.get(threadId) ?? []) clearTimeout(id)
  timers.delete(threadId)
}

const generic: Record<string, string[]> = {
  chief: [
    "Got it. I'll fold that into today's plan and flag anything that clashes with your focus block.",
    'On it. I checked with the other ants: nothing blocking. I will report back by 5.',
  ],
  inbox: ['Noted. I will draft it and hold it for your approval.', "Done. I'll keep an eye out for replies."],
  scout: ["Searching now. I'll skip anyone contacted in the last 60 days.", 'Found a few promising people. Shortlisting before I draft anything.'],
  fixer: ['Looking into it. I will start by reproducing it in staging.', 'Makes sense. I will keep production untouched.'],
  sunny: ['Pulling that list now. Nothing gets sent until you say so.', 'Queued. I will show you the drafts before anything goes out.'],
}

const fallback = [
  "Got it. I'll work on that and check in when there's something to review.",
  "On it. I'll keep you posted here.",
]

function pickResponder(t: Thread, text: string): string {
  if (t.kind === 'ant') return t.refId
  const members = app.colonies.find((c) => c.id === t.refId)?.memberIds ?? []
  const mentioned = members.find((id) => new RegExp(`@${antById(id)?.name}\\b`, 'i').test(text))
  return mentioned ?? members[0]
}

function stream(threadId: string, author: string, full: string, done?: () => void) {
  const msg: TextMessage = { id: uid(), kind: 'text', author, text: '', streaming: true, at: Date.now() }
  push(threadId, msg)
  // Reach into the proxied copy so updates are reactive.
  const live = threadById(threadId)!.messages.at(-1) as TextMessage
  const tokens = full.match(/\S+\s*|\n+/g) ?? [full]
  let i = 0
  const tick = () => {
    if (i >= tokens.length) {
      live.streaming = false
      done?.()
      return
    }
    live.text += tokens[i++]
    later(threadId, 18 + Math.random() * 38, tick)
  }
  later(threadId, 0, tick)
}

function finish(threadId: string, antId: string) {
  app.typing[threadId] = undefined
  const a = antById(antId)
  if (a && a.status === 'working') setStatus(antId, 'idle')
}

export function respond(t: Thread, text: string) {
  clear(t.id)
  const antId = pickResponder(t, text)
  const ant = antById(antId)
  if (!ant) return
  app.typing[t.id] = antId
  setStatus(antId, 'working')
  const lower = text.toLowerCase()
  const skill = text.match(/^\/([\w-]+)/)?.[1]
  const think = 650 + Math.random() * 600

  later(t.id, think, () => {
    if (skill) {
      stream(t.id, antId, `Running **/${skill}**. Give me a moment.`, () => {
        later(t.id, 900, () => {
          push(t.id, {
            id: uid(),
            kind: 'checklist',
            author: antId,
            at: Date.now(),
            items: [
              { service: 'Gmail', result: '12 threads read', ok: true },
              { service: 'Calendar', result: '4 events today', detail: 'first at 10:30', ok: true },
              { service: 'Linear', result: '2 blockers', detail: 'LIN-482, LIN-490', ok: true },
            ],
          })
          finish(t.id, antId)
        })
      })
      return
    }

    if (/\b(repro|bug|computer|browser|site|check)\b/.test(lower)) {
      const card: Message = {
        id: uid(),
        kind: 'computer',
        author: antId,
        title: 'Computer',
        text: 'Opening the browser and following the steps',
        state: 'working',
        site: 'staging.acme.dev',
        at: Date.now(),
      }
      push(t.id, card)
      app.panel = app.panel ?? 'computer'
      later(t.id, 4200, () => {
        const live = threadById(t.id)?.messages.find((m) => m.id === card.id)
        if (live?.kind === 'computer') live.state = 'done'
        stream(t.id, antId, "Done. I've attached what I found above. Nothing was changed outside staging.", () => finish(t.id, antId))
      })
      return
    }

    if (/\b(send|email|reply|message)\b/.test(lower)) {
      stream(t.id, antId, "Here's a draft. I'll hold it until you approve.", () => {
        push(t.id, {
          id: uid(),
          kind: 'draft',
          author: antId,
          channel: 'email',
          to: 'mara@acme.dev',
          subject: 'Quick follow-up',
          body: 'Hi Mara,\n\nThanks for today. Sending over the notes from the review; let me know if I missed anything.\n\nBest,\nLeon',
          at: Date.now(),
        })
        push(t.id, {
          id: uid(),
          kind: 'approval',
          author: antId,
          action: 'Send email to mara@acme.dev',
          detail: 'Gmail · "Quick follow-up"',
          connector: 'Gmail',
          at: Date.now(),
        })
        setStatus(antId, 'attention')
        app.typing[t.id] = undefined
      })
      return
    }

    const pool = generic[antId] ?? fallback
    stream(t.id, antId, pool[Math.floor(Math.random() * pool.length)], () => finish(t.id, antId))
  })
}

export function stop(threadId: string) {
  const antId = app.typing[threadId]
  clear(threadId)
  const t = threadById(threadId)
  if (!t) return
  for (const m of t.messages) if (m.kind === 'text' && m.streaming) m.streaming = false
  for (const m of t.messages) if (m.kind === 'computer' && m.state === 'working') m.state = 'done'
  if (antId) finish(threadId, antId)
  push(threadId, { id: uid(), kind: 'system', author: 'system', text: 'Stopped. Completed actions were not undone.', at: Date.now() }, false)
}
