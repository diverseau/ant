# Delegation: Claude ↔ Codex

Ant is built by two agents. **Claude Code** (Opus) leads, owns the hard and security-critical work, and reviews everything. **Codex CLI** with **`gpt-6.1-sol` at high reasoning** takes longer-running, well-specified, lower-risk work in parallel.

The rule of thumb: if getting it subtly wrong could leak data, act on your machine without asking, corrupt state, or lock in a bad design, Claude does it. If it's a lot of typing against a clear spec with tests that prove it works, Codex does it.

## How a delegation runs

0. **Commit first.** The worktree starts from `HEAD`, so plans and patterns Codex should follow must be committed.
1. **Claude writes a brief** (template below): goal, exact files in scope, interfaces/types to implement, files not to touch, acceptance commands.
2. **Claude prepares the worktree** so Codex never needs the network: `scripts/codex-task.sh <slug> <brief>` creates `.worktrees/codex-<slug>` on branch `codex/<slug>`, installs dependencies offline from the lockfile, then runs:
   ```
   codex exec -m gpt-6.1-sol -c model_reasoning_effort="high" \
     -s workspace-write -C .worktrees/codex-<slug> \
     --json -o .worktrees/logs/<slug>.last.md - < brief.md
   ```
   The model and effort are always passed explicitly, because `~/.codex/config.toml` defaults to `gpt-6-sol` / medium.
3. **It runs in the background** while Claude keeps working. Up to 3 Codex tasks at once, only on non-overlapping files.
4. **Claude reviews** the full diff, runs the acceptance commands plus `check`/`test`/`build`, and reads it for security and style. Outcomes:
   - Good → Claude squash-merges with a Conventional Commit (body notes `Implemented by Codex (gpt-6.1-sol), reviewed by Claude`).
   - Close → Claude fixes small things directly.
   - Off → bounce back with `codex exec resume <session> "…specific fixes…"`, or Claude takes the task over.
5. Worktree and branch are removed after merge.

### Rules Codex works under (also in `AGENTS.md`)
- Stay inside the files the brief lists. No new dependencies unless the brief allows them.
- Don't commit, push, or touch git config. Don't edit `CLAUDE.md`, `AGENTS.md`, `docs/plan-*.md` or anything under `reference/` except reading it.
- Write tests for what you build; make the acceptance commands pass.
- Never read or write credentials (`~/.claude`, `~/.codex`, `~/.ssh`, `~/.hermes/auth.json`, Ant's data dir).
- Finish with a short report: what changed, what's untested, anything you were unsure about.

### Brief template
```markdown
# Task: <slug>
## Goal
<one paragraph: what and why>
## Context
<links: plan section, existing patterns to copy, Hermes files to port by ABSOLUTE path
(/home/diverse/Projects/Ant/reference/hermes-agent/…, it's gitignored so not in the worktree)>
## In scope (create/modify only these)
- path/…
## Out of scope (do not touch)
- path/…
## Interfaces
<exact TypeScript types / function signatures / API shapes to implement>
## Behaviour
<numbered rules + edge cases>
## Acceptance
- `npm -w <pkg> run test` passes, including new tests for: …
- `npm -w <pkg> run check` clean
## Report
List files changed, decisions you made, anything you couldn't verify.
```

## What goes where

### Claude does (important, hard, or security-critical)
- Spikes (`plan-backend-v1.md` §12) and every design decision they feed.
- Runner supervisor and the stream-json parser/normaliser.
- Permission broker, rules engine, floors hook, sandbox and `settings.json` generation, `CLAUDE.md` template, credential deny lists.
- `ant-mcp` core and the permission tool contract.
- Colony router semantics, delegation, priorities, budgets.
- Computer integration: Xvnc/Chromium lifecycle, CDP attach, lease enforcement in tools.
- Scheduler semantics: unattended approval expiry, quota hold, missed runs.
- Secrets encryption, usage-limit detection, anything touching auth.
- Frontend architecture (data provider, event handling) and all visual/animation design.
- First instance of every pattern (first route, first repo, first screen), which Codex then copies.
- Reviewing and merging all Codex work, and every commit.

### Codex does (long, bulk, clearly specified)
- Ports of self-contained Hermes modules **with tests**, from a brief that names the source file and the target interface.
- Database schema, migrations and repository CRUD from the data-model table.
- REST CRUD routes once Claude has written the first one as the pattern.
- Test suites: unit tests for modules Claude wrote, fixture-based parser tests, the fake `claude` replayer, Playwright screenshot suites.
- Frontend forms and list screens that follow existing components (routines editor, rules editor, connectors, secrets, Doctor, settings), then Claude does the polish pass.
- Scripts and docs: `install-deps.sh`, doctor checks, `THIRD_PARTY_NOTICES.md`, API reference.
- Channel adapters (Telegram, Discord, Slack) after Claude defines the adapter interface.
- Mechanical refactors (e.g. moving shared types into `packages/shared`).

## Assignment by milestone

| Version | Claude | Codex |
|---|---|---|
| `0.2.0` Spikes + skeleton | All 10 spikes; antd skeleton, WS event bus, runner + stream-json parser, real data provider in the UI | npm workspaces + `packages/shared` type extraction; Drizzle schema + migrations + repos for `ants/threads/messages/runs/tool_events`; fixture tests for the parser from recorded spike streams; fake `claude` replayer |
| `0.3.0` Folders + safety | Provisioner, `CLAUDE.md` + `settings.json` generation, permission broker, rules engine, floors hook, Stop | Port Hermes dangerous-command patterns (`approval_detection.py`) to a pure TS matcher + tests; rules/approvals repos + CRUD routes; rules editor UI (unstyled pass) |
| `0.4.0` Ant tools + cards | `ant-mcp` server and tool contracts; card semantics | Remaining simple ant-mcp tools to Claude's pattern (`set_status`, `notify`, `share_file`, `report_checklist`); memory store port (`memory_tool_store.py`) + tests; tool-row and file-card components to spec |
| `0.5.0` Colonies | Router, envelopes, queue priorities, delegation, budgets | Loop guard port (`bot_loop_guard.py`) + tests; delegation repo; a2a integration tests on the fake runner |
| `0.6.0` Computer | Lifecycle, CDP attach, lease enforcement, noVNC panel integration and design | RFB input filter port (`rfb_filter.py`) + byte-level tests; thumbnail grabber; `install-deps.sh` + Doctor dependency checks |
| `0.7.0` Routines | Scheduler semantics, unattended expiry, quota hold, webhook security | Schedule parsing/next-run port (`cron/jobs.py`) + exhaustive tests; routines CRUD + run history routes; routines editor + history UI |
| `0.8.0` Connectors + secrets | Secrets crypto + keyring, OAuth flow, per-ant scoping logic | Connector registry CRUD; connectors + secrets screens; MCP config writer tests |
| `0.9.0` Memory, skills, usage | Usage-limit detection, budgets, memory snapshot policy | FTS5 history search port (`session_search_tool.py`); skill linter/guards port; usage aggregation queries + usage meter UI |
| `0.10.0` Channels | Adapter interface, auth/allow-list, per-channel loop guard | Telegram and Discord adapters (grammY, discord.js) + tests; then Slack |
| `1.0.0` Hardening | Security review, Docker/remote host design | Dockerfile + compose to spec, backup/export, install script, docs site |

## Escalation
Codex stops and reports instead of guessing when: the brief conflicts with the code, a needed interface doesn't exist, a test can't pass without changing out-of-scope files, or anything security-related is ambiguous. Claude decides and updates the brief.
