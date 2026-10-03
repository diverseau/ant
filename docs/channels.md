# Talk to your ants from chat apps

Ant can relay messages between your ants and Telegram, Discord or Slack. Set it up in **Connectors → Channels**: paste the bot token (stored as an encrypted secret that only Ant itself uses) and your own platform user id. Only allow-listed user ids are heard; everyone else is ignored silently.

In any chat with the bot:

- `/ants`: list ants and colonies, and which one this chat talks to
- `/use <name>`: talk to that ant or colony in this chat
- `/stop`: stop what's running
- anything else goes to the current ant (by default your pinned or first ant)

In group chats and channels the bot only answers when you @mention it or reply to it. When an ant needs an approval or a hand-off, the chat tells you to open Ant to decide.

## Telegram

1. Message **@BotFather** → `/newbot` → pick a name. Copy the token.
2. Message **@userinfobot** to get your numeric user id.
3. In Ant: Connectors → Channels → Telegram: paste both → **Connect**.
4. Open a chat with your bot and say hi.

## Discord

1. https://discord.com/developers/applications → **New Application** → **Bot** → Reset/copy the token.
2. On the Bot page enable **Message Content Intent**.
3. OAuth2 → URL Generator: scopes `bot`; permissions *Send Messages*, *Read Message History*, *View Channels*. Open the URL to add the bot to your server. DMs work too.
4. In Discord: Settings → Advanced → **Developer Mode** on; right-click yourself → **Copy User ID**.
5. In Ant: Connectors → Channels → Discord: paste token and user id → **Connect**.

## Slack

Slack uses Socket Mode, so Ant needs no public URL. You need two tokens.

1. https://api.slack.com/apps → **Create New App** → *From a manifest* → paste:

```yaml
display_information:
  name: Ant
features:
  bot_user:
    display_name: Ant
    always_online: true
  app_home:
    messages_tab_enabled: true
    messages_tab_read_only_enabled: false
oauth_config:
  scopes:
    bot: [app_mentions:read, chat:write, im:history, im:read, im:write, channels:history, groups:history, channels:read, groups:read, reactions:read, users:read]
settings:
  event_subscriptions:
    bot_events: [app_mention, message.im, message.channels, message.groups, reaction_added]
  socket_mode_enabled: true
```

2. **Install to Workspace** → copy the **Bot User OAuth Token** (`xoxb-…`).
3. Basic Information → **App-Level Tokens** → generate one with `connections:write` (`xapp-…`).
4. Your member id: your Slack profile → ⋯ → **Copy member ID**.
5. In Ant: Connectors → Channels → Slack: token as `xoxb-…|xapp-…` (bot token, a pipe, app token) and your member id → **Connect**.

### Slack events for routines

Routines can start on Slack activity (Details → New routine → Event → Slack): the bot being mentioned, any message, a message containing a phrase, or a reaction, optionally in one channel. Invite the bot to that channel (`/invite @Ant`). Anyone in the channel can trigger these routines, and what they wrote is passed to the ant as untrusted information. If you created the Slack app before this was added, update its manifest with the scopes and events above and reinstall it.

