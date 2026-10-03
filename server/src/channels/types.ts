// Messaging channels (plan §16, milestone 0.10): talk to ants from Telegram, Discord, Slack.
// Adapters only move text; the hub (hub.ts) owns routing, authorisation and replies.

export type ChannelKind = 'telegram' | 'discord' | 'slack'

export interface InboundMessage {
  channel: ChannelKind
  /** Platform chat/channel/DM id, as a string. */
  chatId: string
  /** Platform user id of the sender. */
  userId: string
  userName: string
  text: string
  /** A 1:1 conversation with the bot. */
  direct: boolean
  /** The bot was @mentioned or replied to (group chats). */
  addressed: boolean
}

/** Something that happened in a channel the bot is in, for event routines (any member). */
export interface ChannelEvent {
  channel: ChannelKind
  kind: 'message' | 'mention' | 'reaction'
  chatId: string
  /** Human channel name without '#', when the platform tells us. */
  chatName?: string
  userId: string
  userName: string
  text: string
  /** Reactions: the emoji name, e.g. "eyes". */
  emoji?: string
}

export interface ChannelContext {
  onMessage: (m: InboundMessage) => void
  /** Channel activity for event routines; separate from chat with ants. */
  onEvent?: (e: ChannelEvent) => void
  log: (msg: string) => void
}

export interface ChannelAdapter {
  readonly kind: ChannelKind
  /** Connects and starts receiving. Resolves once the bot identity is known. */
  start(ctx: ChannelContext): Promise<{ botName: string }>
  stop(): Promise<void>
  /** Send plain text (Markdown-ish allowed) to a chat; adapters split long text to platform limits. */
  send(chatId: string, text: string): Promise<void>
  /** Show a typing indicator for a few seconds, if the platform supports it. */
  typing?(chatId: string): Promise<void>
}

export interface ChannelConfig {
  kind: ChannelKind
  enabled: boolean
  /** Secret name (in the vault) holding the bot token. */
  tokenSecret: string
  /** Platform user ids allowed to talk to the colony. Everyone else is ignored. */
  allowUsers: string[]
}

/** Where a platform chat's messages go. */
export interface ChannelBinding {
  channel: ChannelKind
  chatId: string
  target: { kind: 'ant' | 'colony'; id: string }
}
