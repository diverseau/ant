# Ant — Research Docs (Phase 0: map the products to copy)

**Goal of this folder:** hand a fresh Claude Code / Codex session everything known about the two reference products so work can start immediately. **No Ant design is in here by request** — only a map of what exists.

Products mapped:
- **Grok Bot** — xAI/SpaceXAI always-on agents, delivered through Cursor. Launched 2026-08-11.
- **ChatGPT Dots** — OpenAI always-on agent in ChatGPT. Launched 2026-09-29.

## Read order
1. `comparison/feature-matrix.md` — one-page checklist of every copyable capability (start here).
2. `grok-bot/` — 01 overview · 02 **UI map (where to do each thing)** · 03 features + commands/syntax · 04 integrations/plugins/channels · 05 routines/triggers/skills · 06 safety/teams/plans.
3. `dots/` — 01 overview + **UI map** · 02 channels + integrations · 03 tasks/memory/controls · 04 plans/limits/ChatGPT Space.
4. `open-questions-and-gaps.md` — conflicts, unknowns, what to verify. **Read before relying on any number.**
5. `sources.md` — every URL, with fetch caveats.
6. `CROSSCHECK-LOG.md` — what the 2026-10-02 fact-check corrected/added and what remains unverifiable.

## Top findings (TL;DR)
- Both are **"a persistent agent with its own cloud computer + browser, reachable by chat, doing multi-step work unattended, gated by approvals."**
- **Neither has a slash-command catalog.** Real surface: Grok Bot = `/skill`, `@mention` (Bot/plugin/routine/group/@everyone), "Stop now", natural-language routine creation, a full desktop keyboard-shortcut list (`Cmd/Ctrl+K`, `+N`, `+D` dictate…), buttons (Open computer / Take over / Teach a task / Allow once / Always allow / Deny). Dots = natural language + Custom Rules (4 modes per action) + profile controls (Activity, Scheduled, Computers, Add, Call, Pause, Reset); `@dot` and a `/` menu exist only inside ChatGPT Space pages.
- **Key structural difference:** Grok Bot = many Bots sharing *one* computer, with group chats and bot-to-bot messaging, Team Bots (own Slack app). Dots = one dot per user, *own* computer each, deeper chat-app presence (Slack live, Teams invite-only alpha, voice, SMS beta) plus ChatGPT Space for human+agent docs.
- **Shared design pillars to copy:** hosted computer with live view + human takeover; connector marketplace with OAuth tokens hidden from the model; secure credential handoff; independent review model + allow-once/always rules; natural-language schedules and event triggers; memory; multi-surface access with continuous context; admin controls.
- **Gap neither fills (Ant opportunity space, not a plan):** Telegram/Discord/WhatsApp are not native in either; Dots has no public Dots API documented; Grok Bot has no per-Bot credential scoping (official: Bots share one computer and are not a security boundary).
- Confidence: official docs for Grok Bot are fully readable (Cursor + xAI mirrors); Dots help-center/launch pages return 403 directly but were read from web.archive.org captures, plus learn.chatgpt.com (and its `.md` twins). No hands-on testing of either. See `CROSSCHECK-LOG.md`.

## Conventions used in these docs
Tags: **[OFFICIAL]**, **[SECONDARY]**, **[COMMUNITY]**, **[UNVERIFIED]**. Snapshot date: 2026-10-02.
