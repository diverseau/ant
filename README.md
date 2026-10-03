# Ant

Persistent Claude agents ("ants") that live on your computer, each with its own folder, memory, browser and job. Talk to them in a chat app, group them into colonies, give them routines, watch them work, and take over their browser when they need you.

Ant runs the official **Claude Code** CLI under your own Claude subscription. Nothing is proxied or resold; ants are `claude` sessions in folders on your machine.

## Quick start

Requirements: Linux, Node 26+, [Claude Code](https://code.claude.com) signed in (`claude`, then `/login`), `bubblewrap` and `socat` for the sandbox, and Chromium for the ants' browser. Optional: `ffmpeg` and `voxtype` for the composer's mic (speech is transcribed locally).

```bash
npm install
npm run dev:server   # antd on http://127.0.0.1:7420 (ants live in ~/Ants)
npm run dev:web      # the app on http://127.0.0.1:5173
```

Or run it as a background service that serves the built app on port 7420 and starts on login:

```bash
scripts/install-service.sh        # --uninstall to remove
```

For an always-on server, see [docs/self-hosting.md](docs/self-hosting.md).

## What an ant can do

- **Chat** with streaming replies, tool activity, files it made, checklists and drafts.
- **Work in its own folder** (`~/Ants/<name>/`): read anywhere, write only inside its folder unless you approve.
- **Use a browser** that keeps its logins. Watch it live, take over for sign-ins and 2FA, then hand it back.
- **Learn by demonstration**: take over, press *Teach a task*, do it once, and the ant drafts a skill.
- **Skills** (`/name`) and **routines** ("every weekday at 9am…", or a webhook) that run while you're away.
- **Remember** what matters (its own notes plus a shared profile of you).
- **Work together** in colonies: @mention an ant, or let the lead delegate. Ants can message each other, with a loop guard.
- **Connectors**: your claude.ai connectors (Gmail, Calendar…) and custom MCP servers, switchable per ant. **Secrets** are encrypted and injected only into the ants you choose.
- **Chat apps**: talk to your ants from Telegram, Discord or Slack (allow-listed users only).
- **Dictation**: speak into the composer; speech is transcribed on your computer (voxtype).

## Safety model

Every ant is fenced in by four layers:

1. **Instructions**: a generated `CLAUDE.md` tells it its job, its folder and what needs approval.
2. **Permission rules** passed to Claude Code: writes inside its folder are allowed, credentials are denied, and anything else asks. Asks become **approval cards** (Allow once / Always allow / Deny). Unattended approvals expire after 10 minutes.
3. **The OS sandbox** (bubblewrap): shell commands can't write outside the folder, read your keys, or reach Ant's own API.
4. **Floors**: hardline dangerous commands are blocked outright; risky browser actions (buy, send, delete…) ask first; payments and sign-ins are handed to you.

Ants can't approve themselves: Ant's own API and UI are unreachable from their shell and their browser.

Under each ant's chat box you pick its **model**, **effort** (and Fast mode on Opus) and **permissions**:

| Permissions | What the ant may do without asking |
| --- | --- |
| Supervised | Read and search. Every file change and command asks. |
| Auto-accept edits (default) | Edit its own folder and run sandboxed commands. |
| Auto | Claude Code's auto mode reviews each action (Sonnet and Opus; Haiku falls back to asking). |
| Full access | Write anywhere in your home and run commands without prompts. Credentials stay denied, commands stay in the sandbox's network fence, and the floors still block or ask. |

## How it works

```
web (Svelte) ──HTTP/WebSocket──► antd (Node) ──spawns──► claude -p (one per active ant, cwd = ~/Ants/<ant>)
                                   │                         ├─ ant MCP server  (cards, colony, memory, routines, skills)
                                   │                         └─ playwright MCP  ──CDP──► the ant's Chromium
                                   └─ SQLite, scheduler, approvals, connectors, secrets, channels
```

Details: [docs/plan-backend-v1.md](docs/plan-backend-v1.md) (architecture and spike results), [docs/plan-frontend-v1.md](docs/plan-frontend-v1.md) (design).

## Development

```bash
npm run check                        # type-check every workspace
npm test                             # ~1000 tests, no model calls (uses a fake claude)
server/e2e/run.sh all                # real end-to-end with Haiku (spends a little usage)
```

Contributor notes for agents: [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), [docs/delegation.md](docs/delegation.md).
