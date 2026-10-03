# Ant 0.9.0 audit vs Grok Bot and ChatGPT Dots

Date: 2026-10-03. Method: static read of the repo (README, CHANGELOG, plans, `server/`, `packages/`, `web/`, DB schema, API routes, MCP tool list) cross-referenced with `docs/grok-bot/`, `docs/dots/`, `docs/comparison/feature-matrix.md`. **Not run:** antd, the web app, tests or e2e were not executed, so "missing" means "not found in code", not "tried and failed". Items marked (verify) rest on a single grep.

Priority: **P0** breaks the core promise or blocks real use · **P1** a headline feature of the references · **P2** polish or lower value · **N/A** deliberately out of scope for a single-user local app.

## 1. Where Ant already matches or beats the references

| Area | Ant | Reference |
|---|---|---|
| Persistent named agents w/ character, job, folder | ants, `~/Ants/<name>/`, generated CLAUDE.md | Bots / dots |
| Group chats | colonies, 2–6 ants, lead, @mention, loop guard, rename/members UI | Grok group chats 2–6 |
| Approvals | cards w/ Allow once / Always allow (scoped to dir or command) / Deny, 10-min expiry for unattended, revocable rules, floors, hand-off for payments/sign-in | Grok Auto Review cards; Dots Custom Rules |
| Browser shared with human | live view, Take over / I'm done, full-screen view, end-of-turn snapshots | both |
| Teach by demonstration | record take-over → ant drafts skill (never records passwords) | Grok only |
| Routines | NL + cron, time zones, missed-run handling, quota hold, webhook (hashed key), Test, run history | Grok routines |
| Skills `/`, memory, helper ants | yes; skill lint + safety scan, injection-screened memory, `create_ant` on approval | Grok skills/helper Bots |
| Per-ant connector scoping | connectors and secrets switchable **per ant** | **ahead**: Grok connectors are account-wide, a known criticism |
| Model/effort/permission pickers | per ant, Fast mode, 4 permission modes | **ahead**: both products hide model choice |
| Chat apps | Telegram, Discord, Slack (Socket Mode) | **ahead**: neither has Telegram/Discord; Dots has Slack+Teams |
| Self-hosting | Docker image, backup/restore, systemd user service | neither offers it |
| Search, palette, shortcuts, 6-attachment limit | yes (Ctrl+K palette, Ctrl+1–9, Alt+↑/↓, Ctrl+, ) | Grok |

## 2. Gaps vs Grok Bot and Dots

### P0

| # | Gap | Evidence in Ant | Reference |
|---|---|---|---|
| 1 | **No login and localhost-only API; no way to use Ant from a phone or another machine safely.** | `docs/self-hosting.md` states "no application login gate"; `server/src/api/http.ts` rejects non-local Host/Origin unless `ANT_ALLOWED_HOSTS`. No PWA manifest, service worker, or push. | Grok: iOS/Android apps on the same Bots; Dots: mobile messaging, Slack/Teams. Telegram/Discord/Slack channels partly cover this. |
| 2 | **"Always-on" depends on your PC being awake.** Ants run on the user's machine; Docker path is unverified. | CLAUDE.md: "verifying the Docker image on a machine with Docker access" still open; CHANGELOG: "not yet built on the dev machine". | Both run on vendor cloud computers that work with the laptop closed. |

### P1

| # | Gap | Evidence | Reference |
|---|---|---|---|
| 3 | **Event triggers.** Only `schedule` and `webhook` work; `watch`/`event` exist in the DB CHECK and types but nothing implements them. | `server/src/scheduler/runtime.ts` only branches on webhook/schedule; grep for `'watch'`/`'event'` hits only the schema and type. | Grok: Slack (mention/phrase/reaction/any), GitHub, Linear, Sentry, PagerDuty, email, webhook. Dots: event triggers ("new bug report in a Slack channel"). |
| 4 | ~~**Voice is fake.**~~ Done: real dictation, transcribed locally with voxtype. Voice chat and calls are still open. | `server/src/dictation/` | Grok: dictation (Cmd/Ctrl+D) + 1:1 voice chat + voice memos. Dots: call your dot. |
| 5 | **No in-chat secure secret / sign-in card.** Secrets exist only in Connectors UI; ant tool list has no `request_secret`. Hand-off covers browser logins only. | `packages/ant-mcp/src/main.ts` tools: permission, report_checklist, present_draft, request_approval, request_handoff, set_status, list_ants, message_ant, create_ant, post_to_colony, memory, schedule/edit/list/delete_routine, save_skill/delete_skill, share_file, notify. | Grok: secure secret card ("Save securely", write-only). Dots: secure sign-in form, saved logins. |
| 5b | **Per-action rule editor.** Ant has permission *modes* and a revoke list, but no place to author rules ("ask first before external email", per-action Ask / Allow / Hand off). | Details panel lists rules with Revoke only. | Grok: Auto-review personal rules (Ask first / Allow automatically). Dots: Settings → Personalization → Custom rules, 4 modes per action. |
| 6 | **Connector discovery/install.** Ant shows claude.ai connectors the CLI already loads plus custom MCP. No browse-and-install directory, no in-app OAuth flow, no multi-account-per-connector (verify). | `connectors/registry.ts` `noteDiscovered`; no marketplace route. | Grok: Plugins sidebar, 219-listing marketplace, Connect cards in chat, labelled extra accounts. Dots: plugin directory, 4,000+ apps. |
| 7 | **Skills have no management UI.** Panel lists skills; no view/edit/create/share. `DELETE /api/ants/:id/skills/:name` exists but no UI client call found. No plugin-packaged skills. | `DetailsPanel.svelte` skills section is list-only; `web/src/lib/api.ts` has no skills calls. | Grok: Plugins → Yours shows private skills; skills ship inside plugins and templates. |
| 8 | **Full-desktop computer use.** Browser only (headless Chromium + CDP). | CLAUDE.md open item (TigerVNC + cua-driver). | Grok: browser + CLI + filesystem desktop; Dots: cloud computer + local computer connect with Codex/Work tasks. |
| 9 | **Cross-ant activity view.** Per-chat only; no "In progress / Scheduled / Completed" view across ants or tasks. | Sidebar has status/attention states; routines are per-ant in the details panel. | Dots: profile → Activity / Scheduled / Computers. Grok: sidebar attention + per-Bot Tasks. |

### P2

| # | Gap | Reference |
|---|---|---|
| 10 | Sidebar organisation: only Pin. No sections/folders, hide-from-sidebar, or duplicate. (verify: "hidden" matches in web are CSS) | Grok: sections, Hide, Duplicate (copies profile/skills/routines, not history). |
| 11 | Ant templates: no export/import/share link. | Grok: public template link, "Add to Grok Bot". |
| 12 | Memory is not viewable/editable in the UI (`MEMORY.md`/`USER.md` are files only). Both references also limit this, so this is a chance to be better rather than a gap. | Grok: memory not authoritative, no UI; Dots: delete only by deleting the dot. |
| 13 | Per-ant notification toggle and non-Linux notifications. Desktop alerts are `notify-send` only; no web push (verify per-ant toggle). | Grok: per-Bot Notifications switch, badge, mobile push. |
| 14 | Message-level interaction: no reply-to, reactions, or edit/regenerate (verify). | Grok: reply, react, send mid-task messages. |
| 15 | Proactive background research (read-only monitoring while you're idle). | Dots only. |
| 16 | Channels: no Teams, SMS/text, email-in, WhatsApp. | Dots: Teams (alpha), SMS (US Pro beta). |
| 17 | Per-routine usage visibility. `budget_usd` column exists, no UI found; usage ring is subscription-wide. | Grok: weekly + on-demand view, usage tip per routine. |
| 18 | i18n (Grok: 31 desktop languages) and light theme (dark-only is a design decision). | Grok settings. |
| 19 | Fine details not found: Grok "ask to keep routines running after long away", Dots "ant introduces itself" on creation, onboarding example roles/use-case library. | Both. |

### N/A (by design for a single-user local product)
Team Bots, SSO/SCIM, admin dashboard, Network Controls, Action Recording/audit export, org rules, Specialist dots, ChatGPT Space.
If multi-user is ever wanted, the real build is auth first, then Team Bots; it is not an incremental feature.

## 3. Doc and code hygiene found along the way
- README "Chat apps" line lists Telegram and Discord only; Slack shipped. `docs/plan-backend-v1.md` status line (2026-10-03) still lists Slack, colony UI, Connectors UI, Docker and helper ants as open though CHANGELOG shows them done.
- Version `0.9.0` is hardcoded in `server/src/config.ts` and `packages/ant-mcp/src/main.ts`, separate from the `package.json` files that CLAUDE.md names as source of truth.
- Web still bundles the mock engine and demo routines (`DetailsPanel.svelte` `demoRoutines`); intentional fallback, but dead weight once antd is the norm.
- ~~Untracked `.agents/`, `.claude/`, `skills-lock.json`~~: these are tracked on purpose (the brand-guidelines skill); `.worktrees/` is gitignored.

## 4. Suggested order (for the next session to confirm, not a plan)
1. P0-1 auth + PWA + push (unlocks phone use and makes channels optional).
2. P0-2 verify Docker on a machine with Docker; document an always-on setup.
3. P1-3 event triggers (start with Slack message and GitHub webhook adapters, reusing the webhook path).
4. P1-5 / 5b secure secret card plus a per-action rule editor.
5. P1-4 real dictation (Web Speech API) before voice chat.
6. P1-6, 7 connector marketplace and skills UI.

## 5. Status (end of 2026-10-03, release 0.10.0)

| # | Item | Status |
|---|---|---|
| P0-1 | Login, phone use | **Done.** Device pairing (one-time codes, QR, `npm run pair`), Tailscale remote access on :8443, phone layout, installable web app, Web Push. |
| P0-2 | Always-on / Docker | **Verified** on Docker 29: image builds, sandbox and Chromium checks pass, ants and their browsers start. A model turn needs `/login` inside the container. Always-on = Docker or the systemd service on a machine that stays up, reached over Tailscale. |
| P1-3 | Event triggers | **Done.** GitHub (polled, no public URL), Slack (mention/message/phrase/reaction), page watches; webhooks already existed. |
| P1-4 | Voice | **Dictation done** (local). Voice chat / calls open. |
| P1-5 | Secure secret card | **Done.** `request_secret` + write-only card. |
| P1-5b | Rule editor | **Done.** Allow / Ask first / Hand off / Never per action, enforced in the hook; plain-language instructions into CLAUDE.md. |
| P1-6 | Connector directory | **Partly.** One-click remote MCP servers that need no sign-in; OAuth connectors stay on claude.ai by design. |
| P1-7 | Skills UI | **Done.** View, edit, create, share, delete, use now. |
| P1-8 | Full desktop | **Open.** Needs TigerVNC + a window manager installed and a VNC view in the app. |
| P1-9 | Cross-ant activity | **Done.** Activity view (now / scheduled / recent) with a badge. |
| P2-10 | Sidebar | **Partly.** Hide and Duplicate done; sections/folders open. |
| P2-11 | Templates | **Done** as files (export/import); no public share links (local app). |
| P2-12 | Memory UI | **Done.** |
| P2-13 | Notifications | **Done.** Per-ant mute; push on phones. |
| P2-14 | Message actions | **Done.** Reply, rate, retry, edit & resend. |
| P2-15 | Proactive research | Open. |
| P2-16 | More channels | Open (Teams, SMS, WhatsApp, email-in). |
| P2-17 | Per-routine usage | **Done.** Cost per run in routine history and Activity. |
| P2-18 | i18n / light theme | Not planned (dark only by design). |
| P2-19 | Onboarding details | **Partly.** First-run suggestions use the ant's real skills and job. |

