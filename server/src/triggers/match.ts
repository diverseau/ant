// Matching channel activity against event routines, and describing event routines in words.
import type { EventSpec, GitHubEvent } from '@ant/shared'
import type { ChannelEvent } from '../channels/types.ts'

export function slackMatches(spec: Extract<EventSpec, { source: 'slack' }>, e: ChannelEvent): boolean {
  if (e.channel !== 'slack') return false
  if (spec.channel) {
    const want = spec.channel.replace(/^#/, '').toLowerCase()
    if (want !== e.chatId.toLowerCase() && want !== (e.chatName ?? '').toLowerCase()) return false
  }
  switch (spec.on) {
    case 'mention':
      return e.kind === 'mention'
    case 'message':
      return e.kind === 'message'
    case 'phrase':
      return e.kind === 'message' && !!spec.phrase && e.text.toLowerCase().includes(spec.phrase.toLowerCase())
    case 'reaction':
      return e.kind === 'reaction' && (!spec.emoji || spec.emoji.replace(/:/g, '').toLowerCase() === (e.emoji ?? '').toLowerCase())
  }
}

const GH: Record<GitHubEvent, string> = {
  'issue.opened': 'new issues',
  'pr.opened': 'new pull requests',
  'pr.merged': 'merged pull requests',
  push: 'pushes',
  comment: 'comments',
  release: 'releases',
}

export function describeEvent(spec: EventSpec): string {
  switch (spec.source) {
    case 'github':
      return `GitHub ${spec.repo}: ${spec.events.map((e) => GH[e]).join(', ')}`
    case 'slack': {
      const where = spec.channel ? ` in #${spec.channel.replace(/^#/, '')}` : ''
      if (spec.on === 'mention') return `When the Slack bot is mentioned${where}`
      if (spec.on === 'message') return `Every Slack message${where}`
      if (spec.on === 'phrase') return `Slack messages containing “${spec.phrase}”${where}`
      return `Slack ${spec.emoji ? `:${spec.emoji.replace(/:/g, '')}: ` : ''}reactions${where}`
    }
    case 'watch':
      return `When ${spec.url.replace(/^https?:\/\//, '').slice(0, 60)} ${spec.contains ? `mentions “${spec.contains}”` : 'changes'} · checked every ${spec.everyMinutes} min`
  }
}
