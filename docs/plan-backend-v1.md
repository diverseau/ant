# Ant — Backend Plan (v1)

Status: implemented in 0.9.0 (2026-10-03); see the status note at the end and `CHANGELOG.md`. Companion to `plan-frontend-v1.md`.

## 0. Decisions (locked)

| Topic | Decision |
|---|---|
| Agent engine | The **unmodified Claude Code CLI** (`claude`), driven headlessly (`-p`, stream-json in and out). Not the Agent SDK, not a Hermes wrapper |
| Auth | Your existing `claude` login (claude.ai subscription). Ant never reads, stores or proxies credentials |
| Where ants live | **Your PC.** Each ant is a folder under `~/Ants/<ant>/` that is its working directory, memory, browser profile and workspace |
| Safety model | Generated `CLAUDE.md` (what to do) + generated `.claude/settings.json` permission rules + Claude Code's OS sandbox (bubblewrap) + an Ant permission broker that turns prompts into approval cards |
| Agent-to-agent | An `ant` MCP server every ant loads (`message_ant`, `post_to_colony`, …), routed by the Ant daemon |
| Computer | Per-ant headless X desktop (Xvnc) + persistent Chromium, streamed to the UI over noVNC, with a take-over lease. Lifted from Hermes "Bot Desktop" |
| Backend language | **TypeScript on Node 26**, sharing types with the Svelte frontend. Hermes code is ported where useful (it's MIT) |
| Hermes | Read-only reference clone at `reference/hermes-agent` (gitignored, separate from `~/.hermes`). Lift ideas and code, never import it at runtime |

### Why TypeScript, not Python, now
The CLI decision removed the biggest Hermes pieces we'd have reused verbatim (agent loop, provider adapters, approval engine, browser drivers). What's left to lift is a set of small, well-contained modules (desktop launcher, lease, RFB filter, memory store, loop guard, schedule parsing, skill guards), which port cleanly. One language across UI, daemon and MCP servers wins. The Telegram/Discord/Slack libraries in TS (grammY, discord.js, Bolt) are mature, so channels don't need Python either.

### Terms we must stay inside
From [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance):
- Ant runs the **unmodified** `claude` binary and never removes its auth methods.
- Sign-in happens only through Claude Code's own `/login`. Ant must not collect, store or intermediate credentials, so it never reads `~/.claude/.credentials.json` and the sandbox/permission rules deny ants from reading it.
- Ant is **personal, single-user software** running on the subscriber's own machine. If it's ever offered to other people, each user must sign in with their own plan under Anthropic's Commercial Terms, and Ant must never pay for or resell usage.
- Plan limits assume "ordinary, individual usage". Ant ships a usage meter, per-ant budgets and a global concurrency cap from day one.
- Watch item: Anthropic announced (May 2026) moving `claude -p` / Agent SDK usage to a separate monthly credit pool, then paused it on 15 June 2026. If it restarts, ants draw from that pool. The usage meter must make this visible. Monitor support.claude.com article 15036540.

---

## 1. Architecture

```
 ┌─────────────── Browser (web/, Svelte) ───────────────┐
 │  REST + WebSocket events      noVNC (per-ant screen) │
 └───────────────┬──────────────────────────┬───────────┘
                 │ http://127.0.0.1:7420     │ ws …/screen
 ┌───────────────▼──────────────────────────▼───────────┐
 │                    antd  (server/)                     │
 │  API · event bus · SQLite · rules engine · scheduler   │
 │  runner supervisor · colony router · computer manager  │
 │  provisioner · usage meter · secrets · channels        │
 └──┬──────────────┬──────────────────┬──────────────────┘
    │ spawn/stdio  │ unix socket       │ spawn
    │ stream-json  │ (per-ant token)   │
 ┌──▼───────────┐ ┌▼───────────────┐ ┌▼─────────────────────────┐
 │ claude -p    │ │ ant-mcp        │ │ Ant computer (per ant)   │
 │ cwd=~/Ants/x │◄┤ (stdio MCP,    │ │ Xvnc :N + WM + Chromium  │
 │ sandboxed    │ │ spawned by     │ │ --user-data-dir=…/browser│
 │ Bash         │ │ claude)        │ │ CDP on 127.0.0.1:P       │
 └──────┬───────┘ └────────────────┘ └────────────▲─────────────┘
        │ stdio MCP                                │ CDP
        └──────────► playwright-mcp ───────────────┘
```

- **antd**: one long-running Node process. Owns all state. Binds `127.0.0.1` only, requires a local auth token (`~/.local/share/ant/token`), checks `Origin`.
- **One `claude` process per active ant**, cwd = the ant's folder. Started on demand, reaped after idle, resumed with `--resume`.
- **ant-mcp**: a small stdio MCP server that `claude` spawns (from the ant's MCP config). It holds the ant's id + token and forwards every tool call to antd over a Unix socket. Also hosts the `permission` tool for `--permission-prompt-tool`.
- **playwright-mcp** (`@playwright/mcp`): browser tools for the ant, attached over CDP to the ant's own Chromium so the human take-over and the agent share one browser and one cookie jar.
- **Ant computer**: Xvnc + a light window manager + Chromium, per ant, started lazily and stopped when idle.

### Repository layout (npm workspaces)
```
web/                 existing frontend (gets a real data provider)
server/              antd
  src/api/           Hono routes + WS
  src/db/            schema, migrations (Drizzle + better-sqlite3)
  src/runner/        claude process supervisor + stream-json parser
  src/provision/     folder/CLAUDE.md/settings/mcp generation
  src/rules/         permission broker + rules engine + floors
  src/colony/        router, loop guard, queues
  src/scheduler/     routines, triggers, quota hold
  src/computer/      Xvnc/Chromium lifecycle, RFB bridge, lease, thumbnails
  src/memory/        memory store, FTS search
  src/skills/        skill index, guards, save flow
  src/connectors/    MCP connector registry, OAuth helper
  src/secrets/       encrypted store
  src/usage/         meter, budgets, limit detection
  src/channels/      (later) telegram, discord, slack
packages/shared/     types shared by web + server (moved from web/src/lib/types.ts)
packages/ant-mcp/    the ant MCP server (+ permission tool)
computer/            launcher.sh, openbox config, wallpaper
scripts/             install-deps.sh (Arch first), doctor
reference/           hermes-agent (gitignored)
```

---

## 2. The ant folder

`ANT_HOME` defaults to `~/Ants`. Everything an ant is lives here, so an ant can be backed up, moved or inspected with normal tools.

```
~/Ants/
  USER.md                      shared: what the ants know about you (editable in UI)
  .colony/                     shared plugin dir (passed with --plugin-dir)
    skills/<name>/SKILL.md     skills every ant can use
  <ant-slug>/
    CLAUDE.md                  GENERATED: identity, job, rules, roster, tools, memory
    .claude/settings.json      GENERATED: permissions + sandbox (ant can't edit)
    .claude/skills/<name>/     this ant's own skills (written only via save_skill)
    .ant/mcp.json              GENERATED: ant-mcp, playwright-mcp, enabled connectors
    .ant/state.json            session id, computer display/ports (antd-owned)
    memory/MEMORY.md           ant's curated notes (bounded)
    browser/                   Chromium user-data-dir (persistent logins)
    workspace/                 files the ant makes; default place for work
    inbox/                     files you drop in for this ant
```

Ants can freely read/write/delete inside their own folder, except the files Claude Code already write-protects (`.claude/**`, `CLAUDE.md`'s generated sections are rewritten by antd anyway).

### Generated `CLAUDE.md` (template)
Regenerated by antd whenever identity, rules, roster, connectors or secrets change. Applied on the next session start (Claude Code snapshots the system prompt per conversation; antd starts a fresh session or compacts when it matters).

```markdown
# You are {{name}}, an ant in Leon's colony
Job: {{label}}
{{description}}                      ← the user's instructions, verbatim

## Your home
- Your folder is {{path}}. Read, write and delete freely here. Put work in workspace/.
- You may READ anywhere else on this computer, except secrets you are blocked from.
- Do NOT write, move or delete anything outside your folder unless Leon explicitly
  asked for that exact change. If unsure, ask with request_approval first.

## Colony
{{roster: name — job — what they own}}
- Use message_ant to delegate or ask another ant. Use post_to_colony in colony chats.
- One owner per task. Don't redo another ant's work.

## How to report
- Use report_checklist for multi-step results, present_draft for anything that would
  be sent to a person, request_approval before purchases, sends, deletions,
  publishing, or anything irreversible done through the browser.
- Say what you did, what you assumed, and what is waiting on Leon.

## Memory
{{contents of memory/MEMORY.md}}   ← inlined snapshot (not an @import, see §12 spike 7)
{{contents of USER.md}}

## Tools you have
{{connectors + secrets (names and descriptions only, never values)}}
```

### Generated `.claude/settings.json` (shape)
```jsonc
{
  "permissions": {
    "allow": [
      "Read",                       // read anywhere, minus the denies below
      "Edit(./**)",                 // write freely in own folder
      "WebSearch", "WebFetch",
      "mcp__ant__*",                // Ant's own tools (they gate themselves)
      "mcp__browser__browser_snapshot", "mcp__browser__browser_navigate", "…read-only browser tools"
      // + rules the user granted with "Always allow"
    ],
    "deny": [
      "Read(~/.ssh/**)", "Read(~/.gnupg/**)", "Read(~/.aws/**)",
      "Read(~/.claude/.credentials.json)", "Read(~/.claude.json)",
      "Read(~/.local/share/ant/**)",          // Ant's DB, token, secrets
      "Read(~/Ants/*/browser/**)",            // other ants' cookies
      "Read(~/.hermes/auth.json)", "Read(~/.config/**/cookies*)"
    ]
    // everything else → prompt → --permission-prompt-tool → Ant approval card
  },
  "sandbox": {
    "enabled": true,
    "filesystem": { "denyRead": ["~/.ssh", "~/.gnupg", "~/.aws", "~/.local/share/ant"] },
    "network": { "allowedDomains": ["…defaults + user-granted"] }
  },
  "autoMemoryEnabled": false          // Ant owns memory; verify key name (§12)
}
```

The three layers and what each one catches:

| Layer | Catches | Doesn't catch |
|---|---|---|
| `CLAUDE.md` | Intent: "ask before writing outside your folder" | Nothing is enforced |
| Permission rules + Ant broker | Every built-in tool and MCP tool call, before it runs | Indirect writes by scripts the ant runs |
| OS sandbox (bwrap) | Shell commands and their children: writes outside the folder, reads of denied paths, unlisted network hosts | Built-in file tools and MCP servers (they run outside it, so the rules cover them) |

---

## 3. Running an ant (runner supervisor)

### Spawn
```
claude -p
  --input-format stream-json --output-format stream-json --verbose
  --include-partial-messages
  --session-id <uuid> | --resume <uuid>
  --mcp-config ~/Ants/<a>/.ant/mcp.json --strict-mcp-config
  --permission-prompt-tool mcp__ant__permission
  --plugin-dir ~/Ants/.colony
  --model <ant.model> --effort <ant.effort>
  --max-budget-usd <per-run cap>
cwd = ~/Ants/<a>
env = ANT_ID, ANT_SOCKET, ANT_TOKEN, scoped secrets, DISPLAY (if computer up)
```

- **Lifecycle**: `idle → starting → ready → busy → ready → … → reaped`. Reap after 10 min idle (configurable). Next message resumes the same session id.
- **Turns**: user, colony and ant messages are written to stdin as stream-json user messages, each prefixed with a one-line envelope so the ant knows the source: `[Leon]`, `[Colony: Offsite crew · Leon]`, `[From Chief]`, `[Routine: Morning brief]`.
- **Queue**: one turn at a time per ant. Incoming messages queue in antd with priority (user > ant > routine). A user message to a busy ant shows "queued" in the UI. Mid-turn injection behaviour is a spike item (§12).
- **Stop**: "Stop now" sends an interrupt (stream-json control request if supported, else SIGINT, then resume). Completed actions aren't undone, and the UI says so.
- **Crash**: mark the run failed, post an error card with the last stderr lines, restart on next message with `--resume`. Three crashes in 5 minutes puts the ant in `paused` with a banner.
- **Concurrency cap**: max 3 ants busy at once (setting). Others queue. Protects subscription limits and RAM.
- **Version pinning**: antd records `claude --version` at start. Stream-json parsing is covered by fixture tests; on a new CLI version, run the contract test suite before allowing runs (doctor warns, doesn't block).

### Stream-json → Ant events
| CLI message | Ant event / UI |
|---|---|
| `system` (`init`) | record session id, model, tool list, MCP server status (show connector errors) |
| `stream_event` text deltas | `message.delta` → streaming text bubble |
| `assistant` text block | finalise text message |
| `assistant` `tool_use` | `tool.started` → compact tool row ("Ran `npm test`", "Opened example.com"). Browser tools → Computer card. Ant tools render as their own cards |
| `user` `tool_result` | `tool.completed` (duration, error flag, short output) |
| thinking blocks | stored, collapsed "Thought for 12s" |
| `result` | `run.completed`: cost, tokens, duration, turns, error subtype |
| error / limit text | `usage.limited` → global banner + pause queue (§10) |

New message kinds needed in the frontend beyond today's mock: `tool` (collapsible tool row/group), `file` (an artifact the ant wrote in `workspace/`, with open/download), `error`, `handoff`.

---

## 4. Approvals and rules

### Flow
1. The ant calls a tool. Claude Code applies `deny` → `ask` → `allow` rules from the generated settings.
2. If the CLI would prompt, it calls `mcp__ant__permission` with the tool name and input.
3. ant-mcp forwards to antd's **rules engine**, which evaluates Ant rules (global, then per-ant) and returns one of:
   - `allow`: respond allow immediately.
   - `ask`: create an approval message in the thread (card with Allow once / Always allow / Deny), notify, and wait.
   - `handoff`: create a hand-off card ("You'll need to do this one"), open the computer panel, deny the tool with a message telling the ant to wait.
   - `deny`: respond deny with a reason the ant can read.
4. The user decides in the UI. **Always allow** stores an Ant rule *and* adds the matching `permissions.allow` entry to the ant's `settings.json`, so it no longer prompts.
5. Unattended runs (routines, ant-to-ant, webhooks): pending approvals **expire after 10 minutes** (card shows Expired, tool denied, ant told to report back). Attended chats wait indefinitely. Same behaviour as Grok Bot.

### Rule model (mirrors Dots' four behaviours)
`{ scope: global|ant, match: tool pattern + optional path/domain/recipient, behaviour: allow | ask | handoff | deny, source: default|user|admin }`. Editable in the Details panel and global Settings. Defaults ship with the safe policy:

| Action class | Default |
|---|---|
| Read anything (minus denies), web search/fetch | allow |
| Write inside own folder | allow |
| Write/delete outside own folder | ask |
| Shell commands (sandboxed) | allow (the sandbox is the boundary) |
| Shell needing to escape sandbox / new network host | ask |
| Sending anything to a person (email, Slack, DM) | ask |
| Purchases, payments, password changes, 2FA, CAPTCHA | handoff |
| Deleting data in a connected service, publishing, production changes | ask (every time) |
| Installing system software (`pacman`, `sudo`) | deny unless granted |

### Browser actions
Clicks aren't classifiable by tool name, so two extra guards:
- A **pre-gate in the broker** inspects `browser_click` / `browser_type` / `browser_fill_form` inputs (element text, URL) for risky verbs and domains (Buy, Pay, Place order, Send, Delete, Publish, Transfer, checkout/billing URLs) → `ask`. Port the idea from Hermes `tools/approval_smart.py` (strip injection, delimit untrusted text). Optionally a cheap reviewer pass (`claude -p --model haiku`) for ambiguous cases, off by default because it costs usage.
- `CLAUDE.md` tells ants to call `request_approval` before irreversible browser actions.

### Floors (always on, before any mode)
A `PreToolUse` command hook (generated into settings) calls antd for every tool call: audit log + hard floors that no rule can lift. Port `tools/approval_floors.py` and the dangerous-pattern list from `tools/approval_detection.py` (e.g. `rm -rf /`, writing to block devices, `curl … | sh` outside workspace, `sudo -S`). The hook also enforces the **take-over lease**: browser/computer tools are denied while a human holds control.

---

## 5. Ant MCP server (`packages/ant-mcp`)

One stdio MCP server per ant session. Tools (all forward to antd):

| Tool | Purpose | UI |
|---|---|---|
| `permission` | Target of `--permission-prompt-tool` (not for the model) | approval card |
| `message_ant(to, text, wait?)` | Ask/delegate to another ant. Async by default; `wait` blocks up to N min for the reply | system line in both threads |
| `post_to_colony(colony, text)` | Speak in a colony chat | colony message |
| `list_ants()` | Live roster, jobs, status | — |
| `request_approval(action, detail, risk)` | Ask before something the rules can't see | approval card |
| `request_handoff(reason)` | Ask Leon to take over the computer | hand-off card + computer panel |
| `present_draft(channel, to, subject?, body)` | Propose an email/Slack/message; sending needs approval | draft card |
| `report_checklist(items)` | Structured result | checklist card |
| `set_status(text)` | Short live status ("Pulling Salesforce list…") | header + sidebar preview |
| `notify(text, urgency)` | Ping Leon outside the app | desktop notification |
| `memory(op, …)` | add / replace / remove entries in MEMORY.md, or USER.md with approval | details panel |
| `search_history(query \| thread, around)` | Recall past conversations (FTS5) | — |
| `save_skill(name, description, body, files?)` | Create/update a skill (writes the protected skills dir via antd, validated) | skills list |
| `schedule_routine(name, instruction, when, tz?, deliver?, until?)` + `list/pause/resume/edit/delete_routine` | Natural-language routines | routines list |
| `share_file(path)` | Surface a workspace file in chat | file card |

---

## 6. Colonies and agent-to-agent

- **Colony chat**: Leon's message goes to the ants @mentioned; with no mention, to the colony's **lead** (first member by default, configurable). The lead may answer or delegate with `message_ant` / `post_to_colony`. Every ant reply posts into the colony thread with its sender label.
- **Delivery**: antd turns a message into a stdin turn for the target ant with an envelope (`[From Chief · re: offsite]`). The target's reply is routed back to the sender as a turn (`[Reply from Fixer]`) and mirrored into the UI.
- **Loop guard** (port `gateway/bot_loop_guard.py`): sliding-window budget per (sender, receiver) pair and per colony; max hop depth 4 per original user message; cooldown when exceeded, with a system line "Paused the back-and-forth between Chief and Fixer".
- **Budgets**: a2a turns count against the *originating* user request's budget, so one request can't fan out unbounded.
- **Ownership**: every delegated task gets an id; the UI can show "Fixer is working on: LIN-482 repro (for Chief)".
- **Helper ants** (later): an ant may propose creating a helper ant; it needs approval and appears in the sidebar as hidden by default.

---

## 7. The computer

Port Hermes Bot Desktop (`tools/bot_desktop/*`), simplified:

- **Per ant**: `Xvnc :N` (TigerVNC) on a private 0600 Unix socket, a light WM (openbox), and Chromium with `--user-data-dir=~/Ants/<a>/browser --remote-debugging-port=<P>` bound to loopback. Lift `launcher.sh` (display allocation, stale lock cleanup, Xauthority via stdin) and `runtime.py` (start/stop/status, idle stop).
- **Same browser for agent and human** (lift `browser.py`'s rule): the agent's `playwright-mcp` attaches over CDP to the running Chromium instead of launching its own, so cookies and logins are shared and persist.
- **Live view**: antd bridges a WebSocket to the RFB socket; the frontend embeds **noVNC** in the Computer panel. Thumbnails (JPEG grab, lift `thumbnail.py`) feed the Computer card and sidebar.
- **Take over** (lift `lease.py` + `rfb_filter.py`): a lease file says who drives, the agent or one human. The RFB bridge drops input from non-holders; the floors hook denies the ant's browser/computer tools while you hold it (fail closed, even screenshots, because you might be typing a password). "I'm done" hands back; the ant gets a turn "[Leon finished on the computer]".
- **Lazy + idle stop**: start when an ant first needs a browser or you open its computer; stop after 15 min idle (logins persist on disk).
- **Desktop apps (later)**: `cua-driver mcp` (what Hermes uses) for full computer use on the ant's display.
- **Threat model** (same as Hermes, stated in the UI): screens are work surfaces, not security boundaries. All ants run as your OS user; Chromium's DevTools port is reachable by any local process. Fine for a personal machine; separate hosts if that ever matters.
- **Dependencies (Arch)**: `tigervnc openbox chromium xorg-xauth imagemagick` + `npx @playwright/mcp`. `scripts/install-deps.sh` and an in-app Doctor screen check them.
- **Later**: same layout inside Docker or on a remote box (Hermes `sandbox_host.py` pattern) for always-on ants when your PC sleeps.

---

## 8. Routines and triggers

Port the job model from Hermes `cron/jobs.py` (schedule parsing, next-run computation, repeat counts, output per run) and `cron/quota_hold.py`.

- **Create**: by asking the ant ("every weekday at 9, summarise new tickets here"). The ant calls `schedule_routine`; the UI shows "Routine saved: Weekdays 9:00 AM · Australia/Sydney" with Edit / Test / Pause.
- **Schedules**: cron expressions, intervals ("every 2h"), one-shots (ISO), optional end date; per-routine time zone (default from Settings).
- **Runs**: a routine run is a **separate session** of the owning ant (keeps the main chat clean), with results posted into the ant's thread as a routine card + summary. Option to run attached to the main session.
- **Triggers** (phased): schedule → webhook (`POST /hooks/<id>` with `Authorization: Bearer <key>`, JSON body appended to the instruction, 202 = started) → folder watch (`inbox/` or any path, inotify) → connector events (polling Gmail/GitHub/Linear via their MCP tools) → channel messages.
- **Test** runs it now for real (same warning as Grok Bot).
- **History**: last 20 runs per routine with status, duration, cost, output link.
- **Missed runs** (PC was off): run once on startup if missed within the grace window, else skip and log.
- **Quota hold**: when usage limits hit, routines hold until the reset time instead of failing repeatedly.
- **Limits**: 50 routines per ant; minimum interval 5 min (warn below 1 h about usage).

---

## 9. Memory, history and skills

- **Memory** (port `tools/memory_tool.py` + `memory_tool_store.py`): `memory/MEMORY.md` per ant and shared `USER.md`, bounded by character budgets, entries delimited, dedup on add. Snapshotted into `CLAUDE.md` at session start, so mid-session writes don't break prompt caching (Hermes's "frozen snapshot" design). Editable in the Details panel. Claude Code's own auto memory is turned off for ants so there's one system.
- **History**: antd stores every message, tool event and run in SQLite with an FTS5 index (port the query shapes from `tools/session_search_tool.py`). `search_history` lets ants recall; the UI search palette uses the same index.
- **Skills**: native Claude Code skills, so the CLI loads and invokes them itself. Per-ant skills in `<ant>/.claude/skills/`, shared skills in `~/Ants/.colony/skills/` (plugin dir), never in your personal `~/.claude/skills`. `save_skill` validates frontmatter, size and dangerous content before writing (port `tools/skill_manager_guards.py`, `skill_linter.py`, `skills_guard.py`). Skills appear in the composer's `/` menu.
- **Teach by demonstration** (later): record a take-over session (CDP events + periodic frames), have the ant draft a skill from it, then review and test it.

---

## 10. Usage, limits and budgets

- Every `result` message records tokens, `total_cost_usd` (API-equivalent, used as a relative meter on a subscription), duration and turns per run, ant, routine and day.
- **Limits**: detect limit errors from the stream (exact shape is a spike item), show "Usage limit reached · resets 4:00 PM", pause the queue and hold routines until reset.
- **Budgets**: per-run `--max-budget-usd` and `--max-turns`; per-ant daily budget; per-request budget for a2a fan-out. Hitting a budget pauses that ant with a banner, never silently.
- **UI**: usage summary in the account menu, per-ant usage in Details, warning when a routine schedule looks expensive.

---

## 11. Connectors and secrets

- **Connectors = MCP servers** managed by antd: remote HTTP (OAuth handled by Claude Code: `claude mcp login <name>`, launched from the UI), or local stdio commands. Each connector is enabled for **all ants or specific ants**, which is an improvement over Grok Bot's account-wide scope. antd writes each ant's `.ant/mcp.json` from that.
- **claude.ai connectors** (Gmail, Calendar, Drive… already on your account) can appear in Claude Code when signed in with claude.ai; check whether they load under `--strict-mcp-config` (spike).
- **Secrets**: stored encrypted with a key kept in the OS keyring (libsecret). Injected as env vars only into the ants they're scoped to. The UI and `CLAUDE.md` show names and descriptions, never values; the UI has write-only fields. Enable the sandbox's credential masking for those variables.
- **Statuses**: Connected, Needs auth, Error, Disabled, shown in the Connectors screen and as an in-chat Connect card when an ant needs one.

---

## 12. Spikes to run first (verify before building on them)

Each is a small script under `server/spikes/` against Claude Code 2.1.286 on this machine. Results get written back into this doc.

1. **Long-lived stream-json session**: several user turns over one stdin; what happens to a message sent mid-turn; whether an interrupt control message exists or we need SIGINT + `--resume`.
2. **`--permission-prompt-tool` contract**: exact input fields and the allow/deny response shape; whether it fires for MCP tools, Edit outside cwd, and sandbox-escape requests.
3. **Sandbox under `-p` on Omarchy**: bwrap works, network behaviour for unlisted hosts with the prompt tool, Chromium/Xvnc unaffected (they're started by antd, not by the ant).
4. **claude.ai connectors** with `--strict-mcp-config` and per-ant MCP configs.
5. **Skills via stream-json**: does a `/skill-name args` user message expand, or do we rely on the model invoking the Skill tool?
6. **Limit errors**: the stream shape when a subscription limit is hit, and whether a reset time is included.
7. **CLAUDE.md imports** from outside the working directory prompt for approval, so this plan inlines memory and roster into the generated file instead. Confirm, and confirm the auto-memory setting key.
8. **Resource cost**: RSS per idle/busy `claude` process and per desktop, to set the concurrency cap and idle timers.
9. **playwright-mcp over CDP** to a headed Chromium on Xvnc: snapshot/click/type, screenshots for vision, and behaviour when the human holds the lease.
10. **Resume fidelity**: after reap and `--resume`, the conversation, tool history and session prompt are intact.

---

### Spike results (2026-10-03, Claude Code 2.1.286, Haiku)
| # | Result | Design consequence |
|---|---|---|
| 1 | One `claude -p --input-format stream-json` process handles many turns; context survives. A message sent mid-turn **queues** until the turn ends. `{"type":"control_request","request":{"subtype":"interrupt"}}` works: `control_response` success, then `result` `error_during_execution`; the session continues | Keep one process per active ant. "Priority" = interrupt, then send. Stop = interrupt |
| 2 | `--permission-prompt-tool mcp__ant__permission` receives `{tool_name, input, tool_use_id}` for MCP tools and file tools; reply text JSON `{"behavior":"allow","updatedInput":…}` or `{"behavior":"deny","message":…}`; the deny message reaches the model as a tool error | Broker contract confirmed |
| 3 | Sandbox (bwrap) blocks a script writing to `/tmp` and `~`; Read deny rules work; `autoAllowBashIfSandboxed` runs Bash without prompts. A host outside `allowedDomains` **silently hangs** in `-p` (no prompt reaches our tool). `WebFetch(domain:*)` in allow opens Bash network | Per-ant network mode: `open` (default, `WebFetch(domain:*)`) or `allowlist` (`strictAllowlist` + domains), never "ask" |
| 3b | `permissions.allow` in the project's `.claude/settings.json` is **ignored** in `-p` (workspace never trusted); deny rules still apply. Allow rules passed via `--settings <file>` work, and `strictAllowlist` only works there | Generated settings live in antd's data dir (`~/.local/share/ant/ants/<id>/settings.json`), passed with `--settings`, denied to the ant. The ant folder's `.claude/` holds only skills |
| 3c | A `PreToolUse` command hook from `--settings` runs on every tool and can deny with `permissionDecision: "deny"` | Floors hook confirmed |
| 4 | claude.ai connectors (Gmail, Calendar, Drive, Supabase…) load only with user settings **or** with env `ENABLE_CLAUDEAI_MCP_SERVERS=true`. With `--setting-sources project,local` + that env, ants get connectors but none of your personal plugins/hooks/skills. `--strict-mcp-config` also drops them | Spawn with `--setting-sources project,local`, `ENABLE_CLAUDEAI_MCP_SERVERS=true`, no `--strict-mcp-config`; scope per ant with `mcp__claude_ai_<Name>__*` deny rules |
| 5 | A stream-json user message `/greet Leon` invokes the project skill `greet` | `/` menu sends skills as plain messages |
| 6 | `rate_limit_event` arrives each turn: `{status, rateLimitType, resetsAt, unifiedWindows: {five_hour: {utilization, resetsAt}, seven_day: {…}}}`. `result.total_cost_usd` is **cumulative per session** | Usage meter reads windows directly; per-run cost = delta. Limit-hit shape still unseen: treat `status != "allowed"` or an error result mentioning limits as limited |
| 7 | `autoMemoryEnabled: false` removes `memory_paths`. `CLAUDE.md` in cwd loads | Inline memory into generated `CLAUDE.md` |
| — | MCP tools are deferred behind `ToolSearch` (one extra turn on first use) | Fine; mention key Ant tools in `CLAUDE.md` so they're found quickly |

## 13. Data model (SQLite, Drizzle)

| Table | Key fields |
|---|---|
| `ants` | id, slug, name, label, description, color, accessory, model, effort, status, lead_of, created_at, archived |
| `colonies` / `colony_members` | id, name, lead_ant_id / colony_id, ant_id, role |
| `threads` | id, kind (ant\|colony), ref_id, pinned, section, unread, updated_at |
| `messages` | id, thread_id, author (user\|system\|ant id), kind, payload (json), run_id, created_at; FTS5 on text |
| `runs` | id, ant_id, thread_id, session_id, trigger (user\|ant\|routine\|webhook\|channel), parent_run_id, status, started/ended, cost_usd, tokens_in/out, turns, error |
| `tool_events` | id, run_id, tool_use_id, name, input (json, redacted), status, duration_ms, output_summary |
| `approvals` | id, run_id, ant_id, message_id, tool_name, input, behaviour, status (pending\|once\|always\|deny\|expired), expires_at, decided_at |
| `rules` | id, scope, ant_id?, pattern, behaviour, source, created_at |
| `routines` / `routine_runs` | id, ant_id, name, instruction, schedule (json), tz, trigger, enabled, next_run_at, webhook_key_hash, budget / id, routine_id, run_id, status, output_ref |
| `delegations` | id, from_ant, to_ant, origin_run_id, depth, status, summary |
| `connectors` / `connector_scopes` | id, name, transport, url/command, status / connector_id, ant_id |
| `secrets` | id, name, description, ciphertext, scope |
| `usage_daily` | date, ant_id, cost_usd, tokens, runs |
| `settings` | key, value |

Data dir: `~/.local/share/ant/` (db, token, logs, secrets key reference). Nightly backup of db + `~/Ants` manifests.

---

## 14. API

REST under `/api`, JSON. One WebSocket `/ws` for events, one per open screen.

- `GET /api/health`: claude version, `claude auth status` (method/plan only), sandbox deps, computer deps, antd version
- Ants: `GET/POST /api/ants`, `PATCH/DELETE /api/ants/:id`, `POST /api/ants/:id/pause|resume|reset-session`
- Threads: `GET /api/threads`, `GET /api/threads/:id/messages?before=`, `POST /api/threads/:id/messages` (text + attachments to the ant's `inbox/`), `POST /api/threads/:id/stop`, `PATCH /api/threads/:id` (pin, section)
- Colonies: `POST /api/colonies`, `PATCH /api/colonies/:id` (members, lead)
- Approvals: `GET /api/approvals?status=pending`, `POST /api/approvals/:id` `{decision}`
- Drafts: `POST /api/messages/:id/draft` `{action: send|discard, body}`
- Routines: CRUD, `POST …/pause|resume|test`, `GET …/runs`
- Skills, memory, rules, connectors (`POST /api/connectors/:id/login` → OAuth URL), secrets (write-only)
- Computer: `POST /api/ants/:id/computer/start|stop`, `GET …/thumbnail.jpg`, `POST …/lease` `{take|release}`, `WS /ws/ants/:id/screen`
- Files: `GET /api/ants/:id/files?path=`, download
- Usage: `GET /api/usage?range=`
- Webhooks: `POST /hooks/:routineId`
- Events on `/ws`: `message.created|delta|updated`, `tool.started|completed`, `ant.status`, `approval.created|resolved`, `run.started|completed`, `thread.updated`, `usage.updated|limited`, `computer.state|lease`, `routine.updated`

---

## 15. Frontend changes

- Swap the mock for a real provider behind the same store actions (`send`, `decideApproval`, `draftAction`, …), fed by the WS event stream; keep the mock as an offline/demo provider.
- New components: tool rows/groups, file cards, error card, hand-off card, usage meter, limit banner, routines editor and run history, rules editor, connectors with login, secrets (write-only), memory editor, Doctor/health screen, first-run setup (deps check, `claude` signed in, ANT_HOME).
- Computer panel: noVNC canvas with Watch / Take over / I'm done, lease state, idle/start states.
- Notifications: browser Notification API when the tab is hidden, plus `notify-send` from antd for routines.

---

## 16. What we lift from Hermes (MIT, `reference/hermes-agent`)

Port to TypeScript unless noted. Keep the MIT notice in a `THIRD_PARTY_NOTICES.md` and a header comment on ported files.

| Hermes file(s) | Ant destination | What we keep |
|---|---|---|
| `tools/bot_desktop/launcher.sh` | `computer/launcher.sh` (used nearly as-is, shell) | Xvnc on a unix socket, display allocation, stale lock cleanup, Xauthority via stdin, dark theme seeding |
| `tools/bot_desktop/runtime.py`, `browser.py`, `thumbnail.py` | `server/src/computer/` | start/stop/status/idle-stop, one Chromium per profile shared by agent and human, CDP attach, JPEG thumbnails |
| `tools/bot_desktop/lease.py`, `rfb_filter.py` | `server/src/computer/lease.ts`, `rfb-filter.ts` | take-over lease semantics, RFB input gating for non-holders |
| `website/docs/user-guide/features/bot-screen.md` | `docs/` + UI copy | threat model wording |
| `tools/memory_tool.py`, `memory_tool_store.py` | `server/src/memory/` | bounded MEMORY.md/USER.md, frozen snapshot per session |
| `tools/session_search_tool.py` | `server/src/memory/search.ts` | discovery/scroll/read shapes over FTS5 |
| `tools/skill_manager_tool.py`, `skill_manager_guards.py`, `skill_linter.py`, `skills_guard.py` | `server/src/skills/` | skill layout, validation, safety scan |
| `cron/jobs.py`, `cron/quota_hold.py`, `cron/occurrences.py` | `server/src/scheduler/` | schedule parsing, next-run, repeat, quota hold, missed-run policy |
| `gateway/bot_loop_guard.py` | `server/src/colony/loop-guard.ts` | sliding-window budget between bots |
| `tools/approval_floors.py`, `approval_detection.py`, `approval_smart.py` | `server/src/rules/` | hardline floors, dangerous patterns, injection-resistant risk review |
| `plugins/platforms/telegram/*`, `gateway/platforms/*` (later) | `server/src/channels/` | channel adapter shape, delivery ledger, loop guard per platform |
| `docker/` (later) | containerised ant host | s6 supervision layout, perms |

Not lifted: the agent loop, provider adapters, Hermes's own approval runtime, browser backends (replaced by Claude Code + playwright-mcp).

---

## 17. Milestones

**Status (2026-10-03):** 0.2.0–0.9.0 are implemented and tested (see `CHANGELOG.md`), plus Teach a task (browser-only), the Connectors/Secrets/Channels UI, colony management, helper ants, Docker/self-hosting files and channels (Telegram, Discord, Slack). Still open: full-desktop computer use (Xvnc + cua-driver). Later work is tracked in `docs/audit-vs-reference.md`. Deviations from this plan: Chromium runs headless with a CDP screencast instead of Xvnc/noVNC (no extra system packages; full desktop deferred); generated settings live in antd's data dir and are passed with `--settings` (spike 3b).


| Version | Deliverable | Done when |
|---|---|---|
| `0.2.0` Spikes + skeleton | §12 spikes answered; workspaces; antd with SQLite, `/ws`, health; one ant; spawn `claude`, stream text into the real UI; persist; resume after restart | You chat with a real ant from the existing UI and it survives an antd restart |
| `0.3.0` Ant folders + safety | Provisioner (folder, CLAUDE.md, settings, mcp.json); sandbox on; permission broker → approval cards; rules engine + defaults; floors hook; Stop | An ant asks before writing outside its folder and the card works end to end |
| `0.4.0` Ant tools + rich cards | ant-mcp tools (checklist, draft, request_approval, set_status, notify, share_file, memory); tool rows, file cards; Details panel wired | Every card type in the UI is produced by a real ant |
| `0.5.0` Colonies | message_ant, post_to_colony, router, envelopes, queue + priorities, loop guard, delegation view, concurrency cap | Chief delegates to Fixer and both show up correctly; a forced ping-pong stops |
| `0.6.0` Computer | Xvnc + Chromium per ant; playwright-mcp over CDP; noVNC panel; lease take-over; thumbnails; hand-off; Doctor checks deps | An ant logs into a site after you take over, then keeps working with that login next day |
| `0.7.0` Routines | schedule_routine tools, scheduler, history, Test, unattended approval expiry, quota hold, webhooks | A weekday routine runs with the app closed and posts its result |
| `0.8.0` Connectors + secrets | connector registry and per-ant scoping, OAuth login from UI, claude.ai connectors, encrypted secrets | Gmail drafts flow through a draft card and approval |
| `0.9.0` Memory, skills, usage | memory editor, save_skill with guards, `/` menu from real skills, search_history, usage meter, budgets, limit banner | Hitting a limit pauses cleanly and resumes at reset |
| `0.10.0` Channels | Telegram + Discord adapters (Slack after), per-channel loop guard | You message Chief from Telegram and get the same thread |
| `1.0.0` Hardening | Docker/remote host option for always-on, backup/export, install script, docs, security review | A fresh machine goes from install to first ant in under 10 minutes |

Each milestone ends with a polish pass on the UI it touched, a screenshot check, and a semver bump with Conventional Commits.

---

## 18. Testing

- **Unit**: rules engine, floors, schedule parsing, loop guard, stream-json parser (recorded fixtures from the spikes), memory store, skill guards, RFB filter.
- **Integration without spending usage**: a fake `claude` binary (`server/test/fake-claude`) that replays fixture streams and exercises the permission tool, so CI never touches the subscription.
- **Real e2e (opt-in, `ANT_E2E_REAL=1`)**: Haiku, tiny budgets, a throwaway `ANT_HOME`; covers one chat, one approval, one a2a hop, one routine.
- **UI**: Playwright screenshots of every card and flow against the fake runner.

---

## 19. Risks

| Risk | Mitigation |
|---|---|
| Stream-json or permission-tool behaviour changes between CLI versions | Fixture contract tests, version pinning, Doctor warning |
| Anthropic restarts the `-p` credit pool split | Usage meter + budgets; clear in-app explanation; per-ant model choice (Haiku for routines) |
| Subscription limits hit by always-on ants | Concurrency cap, quota hold, schedule cost warnings |
| Ants act on your real machine | Sandbox, write-outside-folder approvals, credential denies, floors, audit log, Stop |
| Browser actions bypass tool-name rules | Pre-gate on risky clicks, request_approval convention, take-over for payments |
| Same-OS-user boundary between ants | Stated plainly in UI; per-ant credential denies; containers/remote host in 1.0 |
| Prompt injection from web pages or emails | Rules don't trust content; sends and purchases always need approval; injection-resistant reviewer |
| Hermes port drift | Port behaviour, not code structure; note source commit `54bc5e50` in headers |
