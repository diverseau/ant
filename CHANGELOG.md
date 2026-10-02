# Changelog

All notable changes to Ant. Versions follow [Semantic Versioning](https://semver.org); commits follow Conventional Commits.

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

### Tooling
- ~1000 tests with a fake `claude` (no model calls); real end-to-end suites (`server/e2e/run.sh`).

## 0.1.0 — 2026-10-02

- Frontend prototype on mock data: sidebar of ants, chat cards, composer with `/` and `@`, computer panel, creator, palette.
