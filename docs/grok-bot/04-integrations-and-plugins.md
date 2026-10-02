# Grok Bot — Integrations, Plugins & Channels

## Plugin system [OFFICIAL unless noted]
- Plugin = anything the Bot can call as a tool: marketplace connectors, custom **MCP servers**, plugin-packaged **skills**. xAI docs name two custom-MCP transports for Team Bots: **Remote HTTPS** (uses the Bot's own credential, or each person's sign-in if OAuth) and **Command** (runs on the computer the conversation uses; a Command needing secrets works only in the owner's own chat; never put credentials in command/args). [OFFICIAL docs.x.ai/grok-bot/team-bots] Personal-Bot custom MCP-by-URL UI detail remains [COMMUNITY].
- Grok Bot inherits the **Cursor connector/MCP policy** (Team Marketplace, dashboard Plugins & MCPs); there is no separate Grok Bot connector list; admins cannot push/pre-install connectors to members. [OFFICIAL teams doc]
- Discovery: Sidebar **Plugins** / **Marketplace** (`Cmd/Ctrl+Shift+M`) (discover); Marketplace → **Your plugins → Manage plugins and skills** (Installed + Private skills); Cursor docs also describe Settings → Plugins → Marketplace / Yours. Per-plugin tool enable/disable. Phone: avatar → Plugins.
- Install flow: search → provider OAuth in browser → appears under Installed. In-chat **Connect cards** appear when a Bot needs one.
- An installed plugin is available to **every Bot on the account** (account-scoped, not Bot-scoped).
- OAuth tokens live on Cursor's connector backend; Bot invokes tools **without receiving tokens**.
- Multiple accounts per plugin allowed where the plugin supports it (Accounts → Add Another Account, labelled, e.g. "Use my work Notion"); Gmail = one mailbox at a time (disconnect to switch).
- Plugins act with the member's existing permissions; can't elevate or change sharing.
- Admin controls: team marketplace policy, MCP allowlist (Enterprise), "Disabled by team admin" status.
- Known quirks: Zoom auth error 4700 (Invalid redirect; known issue, no workaround) [OFFICIAL]; Google sign-in shows app as **Grok** (not Cursor) and company Workspace admins must set "Grok" to Trusted (Admin console → Security → Access and data control → API controls → App access control → Manage third-party app access); Google Calendar can't change Meet settings or add Zoom link; Sheets edit needs Sheets plugin, finding files needs Drive plugin; Gmail can search/read/draft/send/label; Slack plugin posts as the connected user, only where that user can post.
- Plugin capability statements (official): "can do only what that account can already do"; blocking a plugin does NOT block that service's website (needs Enterprise Network Controls).
- Fallback when no plugin exists: Bot drives the website via computer-use after human login. This is the headline differentiator ("works where APIs/MCPs don't").

## Marketplace catalog (219 listings, 2026-08-12 capture) [COMMUNITY: github.com/decision-council/awesome-grok-bot-plugins]
(Re-checked 2026-10-02: the repo still states 219 listings / 13 categories / 2026-08-12 capture; category counts below match. Cursor/xAI publish no official plugin list; the live count has likely changed.)
| Category | # | Notable |
|---|---|---|
| Featured | 6 | Gmail, Google Calendar, Google Drive, Notion, Slack |
| MCP | 66 | GitHub, 1Password, Auth0, Browser Use |
| Infrastructure | 39 | AWS Core, Firebase, Vercel, MongoDB, Cloudflare |
| Productivity | 33 | Asana, Atlassian/Jira, Linear, Airtable |
| Data Analytics | 29 | Amplitude, dbt Labs, PostHog |
| Agent Orchestration | 19 | AWS Agents, Composio, Langfuse |
| Payments | 14 | Stripe, Shopify, Chargebee, Circle |
| Sales | 6 | Apollo.io, HubSpot, Salesforce, Clay |
| Customer Support | 2 | Intercom, Plain |
| Canvas | 2 | Docs Canvas, PR Review Canvas |
| Finance & Legal | 1 | Docusign |
| Inbox & Collaboration | 1 | X (Twitter) |
| Scheduling | 1 | Zoom |

Other frequently-cited: Composio (1,500+ apps via one plugin), Firecrawl, Canva, Sentry, HubSpot, Figma-style design tools. Third-party plugin directory grokbot.dev lists 53 (Post Bridge, Postiz, Breakcold, AgentMail, TranscriptAPI, ScreenshotOne, 2Chat, BulkPublish...).

## Inbound channels (how you talk to a Bot)
| Channel | Status | Notes |
|---|---|---|
| Desktop app | Native | primary |
| iOS / Android app | Native | same Bots/computer; no iPad |
| Voice chat (in-app) | Native | 1:1 only |
| Slack | Native for Team Bots + triggers | (1) **Routine triggers** from Slack (Bot mentioned, word/phrase, *you* react to a message, any message; one channel or all of Slack; only new activity) via a Cursor account Slack integration (separate from the Slack plugin; connect Slack on the Cursor account that owns the Bot). (2) **Team Bots in Slack**: owner publishes, opens Bot details → "Bring to your team's Slack" → **Connect** (approve Cursor; states: "Connect after publishing", "Awaiting admin approval", "Connected"); Grok Bot creates/installs the Slack app and DMs the owner; teammates DM or @mention it; it **posts as itself**; each teammate first links Slack at Settings → General → Team Bots → **Link** (Cursor account on the Bot's team). In Slack channels/threads a Team Bot uses its own shared computer and only the owner's plugins; approvals only in owner's chat; Enterprise Enforce Auto-review still checks. (3) Slack **plugin** on a personal Bot posts as the user. A *separate* SpaceXAI product "Grok for Slack" exists and is not Grok Bot [COMMUNITY/SECONDARY, unverified]. [OFFICIAL cursor.com/help/grok-bot/team-bots, /routines; docs.x.ai/grok-bot/team-bots] Earlier 'Docs conflict' resolved: no bot-identity Slack app for *personal* Bots; Team Bots do get one. |
| Webhook (HTTP POST) | Native | routine detail → Webhook section: **POST to** (URL), **key** (`Authorization: Bearer <key>`), **header** (ready to copy). Optional JSON body is passed to the Bot with the routine instruction. 200 = accepted/run started (not finished); any other = no run. Ask the Bot to "add a webhook trigger to the routine". |
| GitHub / Linear / Sentry / PagerDuty / email events | Native triggers | routine triggers |
| Telegram | **Not native** | community bridges; grokbot.dev docs frame Telegram as an *alert/command surface*. Feature requested on Cursor forum |
| Discord | **Not native** | community bridge (davefmurray/grok-bot-discord): Node gateway WebSocket + allowlists (guild/channel/author, fail-closed) + mention-gating + dedupe + per-channel rate limit; runs on Bot's computer or elsewhere; brain = OpenAI-compatible API or webhook |
| SMS/WhatsApp/email-in | Not native | via third-party plugins (2Chat, AgentMail) |

### Community external-messaging pattern (forum, [COMMUNITY])
1. Own Slack/Discord app in Socket Mode on an always-on machine (not the Bot's cloud computer — resets wipe it).
2. Listener writes payload to file, then POSTs to the routine **webhook as a "doorbell"**.
3. Bot replies using the chat platform's API as its own bot user.

## Outbound
- Bot posts to Slack (as user via plugin; as itself for Team Bots), emails via Gmail plugin (drafts → approval before send is the recommended pattern; UI shows New Email / New Slack Message draft cards with Send/Discard), social via BulkPublish/Post Bridge/Postiz plugins, X plugin.
- Notifications: desktop/phone push per Bot; routine outputs "posted to a conversation".

## Developer surface
- **No public Grok Bot API** announced. Cursor **Admin API** (enablement, capabilities, auto-review enforcement, group access, network policy, team rules, setup scripts) and **Organization API** (computer recreate/terminate/delete; `admin:*` scope) exist for admins. [OFFICIAL teams doc]
- OpenTelemetry export of usage events (Enterprise).
- Grok model itself: OpenAI-compatible API at `https://api.x.ai/v1` (console.x.ai) — not the Bot product. [SECONDARY] (docs.x.ai pages carry a "Meet grok-4.7" API banner; that is the API model, not a Grok Bot setting.)
- Release feed for the desktop app (JSON): `https://api2.cursor.sh/updates/api/download/stable/{darwin-arm64|darwin-x64|win32-x64-user|win32-arm64-user|linux-x64|linux-arm64}/sand`; installers at `downloads.cursor.com/grokbot/stable/...`; Windows silent install `Grok_Bot_{version}_Setup.exe /S` (per-user, `%LOCALAPPDATA%\Programs`); Linux apt/yum repo files `grok-bot.sources` / `grok-bot.repo`, package `grok-bot`. [OFFICIAL cursor.com/docs/grok-bot/deployment]
- Private networking for hosted computers (Enterprise Team Setup): Tailscale (exit node; auth key as Team Secret) or Cloudflare Tunnel worked examples; or per-member **Route traffic through this computer**. Allowlist `*.cursor.sh`, `*.cursor-cdn.com`, `*.cursorapi.com`, `*.cursorvm.com` **and** `*.*.cursorvm.com`; TLS-inspecting gateways must exempt them. Shared static egress IPs only (ranges via account team). [OFFICIAL docs/grok-bot/proxies, /private-networks, /security]
