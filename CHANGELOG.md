# Changelog

All notable changes to Ant. Versions follow [Semantic Versioning](https://semver.org); commits follow Conventional Commits.

## 0.10.0 — 2026-10-03

Ant on your phone, ants that react to events, and much more control over what they do.

### Added
- Model, effort and permission pickers under the chat box, per ant. Models: Claude Opus 5.5, Sonnet 5.5, Fable 5.1, Opus 5, Sonnet 5, Haiku 4.5, plus seven legacy models; search, favourites and Ctrl+1–6 in the menu.
- Effort (Low to Max, defaulting to the model's own) and Fast mode on Opus. When Claude Code serves a turn at standard speed anyway, Ant says why (e.g. extra usage is off for the account).
- Permission modes: Supervised, Auto-accept edits (the previous behaviour, still the default), Auto (`--permission-mode auto`), Full access (`bypassPermissions`, home-wide sandbox writes, no unsandboxed escape).
- Changes apply on the ant's next turn; a busy ant restarts once its current turn ends.
- Full-screen view of an ant's computer (expand button or double-click): watch without taking over, take over from there if you want, Esc to leave.
- Real logos for connectors and chat channels, downloaded once by antd from Google's favicon service and cached in Ant's data folder (letter tile when a site has none).
- Real dictation in the composer: speech is transcribed on this computer by voxtype (local Whisper) via ffmpeg, with live partial text while you talk, a level-driven waveform, Enter to finish and Esc to discard. Nothing is sent to a cloud service.
- Device pairing: every device except the computer antd runs on pairs once with a one-time code (Settings → Devices, QR code, or `npm run pair`) and gets its own revocable session.
- Remote access over Tailscale (`tailscale serve` on port 8443, tailnet only) from Settings → Devices.
- Phone layout: list and chat as sliding screens with swipe-back, full-width panels, bottom-sheet dialogs.
- Installable web app and push notifications (approvals, hand-offs, and replies when no Ant window is open).
- Docker image verified on Docker 29.
- Event routines: GitHub (new issues and PRs, merges, pushes, comments, releases; polled, no public URL), Slack (mentions, messages, phrases, reactions in a channel) and page watches (a public page changes or starts mentioning a phrase; checked by Ant without using Claude until it fires). Event data is passed to the ant as untrusted information, with a 30-second cooldown. Ants can create them with `schedule_routine`.
- Secure secret card: an ant calls `request_secret`; you paste the value into a write-only card, it's stored encrypted and given to that ant as an environment variable on a fresh process, never as chat text.
- Rule editor (Details → Rules): "When <ant> wants to send email / post in Slack / change my calendar / use a connector / open a site / run a command / edit files → Allow, Ask first, Hand off or Never", per ant or for all ants. Enforced by Ant's hook on every tool call, so it holds in every permission mode. Plain-language instructions are written into the ant's CLAUDE.md.
- Skill manager (Details → Skills): open any skill to read or edit it, write new ones from a template, share an ant's skill with every ant, use it now, or delete it. Saved skills are linted and safety-scanned like `save_skill`.
- Activity view (sidebar → Activity): what every ant is doing now, what's waiting on you (with a badge), scheduled and event routines, and recent runs with their outcome, routine and cost. Tap anything to open that chat.
- Memory you can see (Details → Memory): what each ant remembers and the shared profile of you, entry by entry; edit, add or forget, with the same limits and screening as the ant's memory tool.
- Message actions: reply (quotes the message into your next one), 👍/👎 (saved; 👎 asks what was wrong and tells the ant), try again, and edit & resend your own messages. Quotes render in chat.
- Ant templates: Duplicate an ant, Export it as a `.ant.json` file, or Import one (sidebar + → Import an ant…). Profile, skills, routines (not webhooks), rules and instructions travel; history, memory, files, browser logins and secrets never do.
- Per-ant switches: mute an ant's notifications (approvals still notify) and hide it from the sidebar (+ → Show hidden ants).
- Routine run history shows each run's API-equivalent cost.
- Connector directory (Connectors → Custom → Popular): one-click remote MCP servers that need no interactive sign-in (context7, DeepWiki, Cloudflare docs, Hugging Face, Exa, and GitHub with a `GITHUB_TOKEN` secret expanded by Claude Code at runtime).
- Refresh button in the usage panel. It runs Claude Code's local `/usage` command (no model call, no usage spent) and updates both windows.

### Fixed
- Read-only connector tools with hyphenated names (e.g. `query-docs`) no longer ask for approval; send/create verbs with hyphens are recognised too.

### Security
- In Auto and Full access the PreToolUse floors also deny WebFetch/browser navigation to Ant's own ports and send connector messages through the approval card, since those modes skip the permission prompt.

## 0.9.0 — 2026-10-03

The first working Ant: real ants on real Claude Code sessions.

### Ants and chat
- Each ant is a `claude -p` stream-json session in `~/Ants/<ant>/`, resumed across restarts, with a generated `CLAUDE.md` (identity, job, colony roster, memory, tools).
- Streaming replies, collapsible tool activity, file cards with a viewer, checklists, drafts, error cards, live status lines, Stop (interrupt), attachments into the ant's `inbox/` (picker, drag-drop, paste).
- Full-text search across every conversation; older history loads on scroll.
- Per-ant model (Haiku / Sonnet / Opus); default model and concurrency in Settings.

### Safety
- Generated permission settings passed with `--settings` (project allow rules are ignored in `-p`), credential denies, OS sandbox (bubblewrap) confining shell writes to the ant's folder.
- Permission broker turns Claude Code prompts into approval cards (Allow once / Always allow / Deny); unattended approvals expire after 10 minutes; "Always allow" is scoped to the directory or exact command; rules can be revoked.
- Floors: hardline dangerous commands blocked (ported from Hermes); risky browser clicks ask; payments and sign-ins hand off to you.
- Ants can't reach Ant's own API or UI (sandbox deny + browser-level CDP interception); DNS-rebinding protection; draft "Send" allowances only cover the approved text.

### Colonies
- Group chats of ants with @mention routing and a lead; ant-to-ant messaging with a loop guard and hop limits.

### Computer
- A persistent headless Chromium per ant shared with the user: live view, Take over / I'm done, hand-off cards, Computer cards with end-of-turn snapshots.
- Teach a task: record a demonstration (pages, clicks, typed text — never passwords — and screenshots); the ant drafts a skill from it.

### Routines, skills, memory
- Routines from chat or the UI: natural-language/cron schedules with time zones, missed-run handling, quota hold, webhooks with hashed keys, run history, Test.
- Skills: `save_skill` with linting and safety scanning (ported from Hermes), per-ant and colony-wide libraries, the `/` menu.
- Memory: bounded `MEMORY.md` per ant and a shared `USER.md`, with injection screening, snapshotted into each session.

### Connectors, secrets, channels
- claude.ai connectors (Gmail, Calendar, …) available to ants, switchable per ant; custom HTTP/stdio MCP connectors.
- Encrypted secrets (key in the OS keyring) injected only into chosen ants.
- Telegram and Discord: allow-listed chat with your ants (`/ants`, `/use`, `/stop`), approvals notify the chat.

### App
- Settings (name, time zone, default model, concurrency) and a Health check; subscription usage ring and panel from Claude Code's rate-limit data; desktop notifications for unattended approvals.
- Optional systemd user service; dependency checker.

### Also in this release
- Colonies: create, rename, add/remove members, choose a lead, delete.
- Helper ants: an ant can propose a new specialist ant, created on your approval.
- Connectors screen: claude.ai connectors per ant, custom MCP servers, secrets, and chat channels (Telegram, Discord, Slack via Socket Mode).
- Self-hosting: Docker image and compose file, backup and restore scripts (not yet built on the dev machine).

### Tooling
- ~1000 tests with a fake `claude` (no model calls); real end-to-end suites (`server/e2e/run.sh`).

## 0.1.0 — 2026-10-02

- Frontend prototype on mock data: sidebar of ants, chat cards, composer with `/` and `@`, computer panel, creator, palette.
