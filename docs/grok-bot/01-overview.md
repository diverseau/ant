# Grok Bot — Overview

> Research snapshot: 2026-10-02. Product is early beta ("expect rough edges and plan changes"). Confidence tags: **[OFFICIAL]** = Cursor docs/help center, **[SECONDARY]** = press/blogs, **[COMMUNITY]** = forums/GitHub/third-party, **[UNVERIFIED]** = single weak source.

## What it is
- Always-on agent product from xAI (now "SpaceXAI"), **distributed through Cursor (Anysphere)**. Launched **2026-08-11** as a beta on **macOS + iOS** with an **Enterprise waitlist**. [OFFICIAL x.ai/news/introducing-grok-bot; MacRumors] Windows build reported ~2026-08-19, Android 2026-09-02, Enterprise 2026-09-03 [COMMUNITY/SECONDARY, not re-verified; Android 9+ and Enterprise via dashboard are now in official Cursor docs].
- Built first as an **internal SpaceXAI prototype** that "took off across the company" (sales outbound, marketing, office ops, bug fixes). [OFFICIAL x.ai launch post]
- Official docs live in **two mirrors**: Cursor (cursor.com/docs/grok-bot, cursor.com/help/grok-bot) and xAI (docs.x.ai/grok-bot, with `.md` variants and an llms.txt index). They differ slightly in UI labels (see 02-ui-map 'Docs drift'). Product updates are announced on X at **@bot**; there is **no official changelog** (Cursor staff, 2026-08-31). [OFFICIAL/COMMUNITY forum.cursor.com/t/grokbot-official-changelog/170056]
- Tagline-level distinction: "Grok answers, Grok Bot does." [SECONDARY tagline; not found verbatim in official pages] It is a *separate app* from the Grok chat app; SuperGrok limits shown in the Grok app are a different meter. [OFFICIAL cursor.com/help/grok-bot/faqs]
- A **Bot** = a named persistent agent (name, label/job, description, avatar) with chat history, skills, routines, memory.
- All of one user's Bots share **one persistent cloud computer** (browser + shell + filesystem). Each Bot gets its own *screen* on it. [OFFICIAL]
- Works with laptop closed. Desktop/iOS/Android apps are **control surfaces** to the same cloud state.
- Model: user cannot pick; "Cursor picks the model for the specific task under the hood"; serving mix can change, usage analytics show the model that served each request (incl. failovers) and billing follows the serving model. [OFFICIAL FAQ + cursor.com/docs/grok-bot/security] A community changelog says Grok 4.6 was integrated 2026-08-12 [COMMUNITY getgrokbot.com/en/changelog]; not confirmed by official docs.
- Core loop: give a Bot a job → it works on the cloud computer using browser/shell/plugins → hits approval gates or "take over" handoffs → you teach it (skills / routines) → it runs unattended.

## Mental model (what to copy conceptually)
| Concept | Grok Bot term |
|---|---|
| Agent persona | **Bot** (name + label + description + avatar) |
| Reusable procedure | **Skill** (invoked with `/`) |
| Scheduled/triggered procedure | **Routine** |
| Tool connector | **Plugin** (attached with `@`) |
| Multi-agent room | **Group chat** (2–6 Bots) |
| Shared agent for a team | **Team Bot** |
| Safety gate | **Auto Review** + approval card (Allow once / Always allow / Deny) |
| Human takes control of agent's browser | **Open computer → Take over → "I'm done"** |
| Secrets | **Secure secret card** / Bot Secrets section (write-only) |

## Entry points (where users reach it)
1. Desktop app (macOS Intel/Apple Silicon, Windows x64/Arm64, Linux x64/arm64 as AppImage/deb/rpm). Download: `cursor.com/dashboard/bot`.
2. iPhone app (iOS 18+); Android (9+). Per xAI docs the **iOS app also runs on iPad (iPadOS 18+)**; Cursor docs only say iPhone. [OFFICIAL docs.x.ai/grok-bot/mobile, /faq] Store links: App Store id6794501026; Google Play `ai.x.grok.bot`.
3. Slack: (a) routine **triggers** via a Cursor account Slack integration; (b) **Team Bots**, which the owner can connect to Slack ("Bring to your team's Slack → Connect") so teammates DM/@mention them and the Bot **posts as itself**. The Slack *plugin* (personal Bot) posts as the user. See integrations doc. There is **no** native Telegram/Discord/WhatsApp/SMS channel. Community requested Discord/Google Chat/Telegram. [COMMUNITY]
4. Webhook: routines can be triggered by HTTP POST. People use it as a "doorbell" for external bridges.
5. Voice chat (1:1 with a Bot only, in-app; desktop, iPhone, Android) plus dictation (Cmd/Ctrl+D) and Bot-sent **voice memos**.
6. Web: only `cursor.com/dashboard/bot` (download/admin) and `x.ai` template preview pages; **no web chat client** documented.

## Sources
- https://cursor.com/docs/grok-bot/get-started
- https://cursor.com/docs/grok-bot/work
- https://cursor.com/help/grok-bot/faqs
- https://www.unite.ai/xai-launches-grok-bot-always-on-ai-teammates-with-their-own-cloud-computers/
- https://x.ai/news/introducing-grok-bot
- https://docs.x.ai/grok-bot
