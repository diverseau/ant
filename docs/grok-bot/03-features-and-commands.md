# Grok Bot — Features, Commands & Syntax Reference

**Important finding:** Grok Bot has **no large slash-command catalog** (it is not a Telegram-style bot). Its "commands" are a small set of composer syntaxes plus natural-language instructions. Everything else is conversational. [OFFICIAL]

## Composer syntax (exhaustive as documented)
| Syntax | Meaning |
|---|---|
| `/` | Insert a saved **skill** (user-created or from a plugin's packaged skills) |
| `@BotName` | Hand request to a specific Bot (group chats / bot-to-bot) |
| `@everyone` | Group-wide update (group chats) |
| `@plugin` | Attach a plugin/connector to the task (e.g. `@Notion`); xAI docs: "type `@` to attach the connector to the task" |
| `@routine` | Reference a routine |
| `@group` | Mention a group |
| `Cmd/Ctrl+N` | New Bot / New chat dialog (desktop) |
| `Cmd/Ctrl+D` | Dictate into composer (voice *typing*; Start voice chat has no keybinding). Phone: **Start dictation** |
| `Cmd/Ctrl+K` | Search palette (full shortcut list in 02-ui-map) |
| "Stop now" (plain text) | Ends work immediately; does NOT undo completed actions |
| Reply-in-thread / react | Targeted feedback; docs warn reactions alone shouldn't carry safety-critical decisions |
| Mid-task message | A direct message "takes priority over background work" |

No documented `/help`, `/new`, `/reset`, `/model`, `/status` etc. in Grok Bot itself (re-checked against cursor.com and docs.x.ai pages; the `/` menu lists only saved skills; if a private skill is missing from `/`, enable it under Marketplace → Your plugins → Manage plugins and skills → Private skills). Slack-side: a Team Bot is invited to a channel with Slack's native `/invite @BotName` [COMMUNITY/SECONDARY]. Plain-text instructions that matter: "Stop now"; first-task recipe fields = outcome, sources, constraints, deliverable, review point. (The `/reauth`, `/accounts` commands seen in search results belong to a **community Telegram bridge for the Grok Build CLI**, unrelated: github.com/artickc/grok-telegram-bot.)

## Attachments & limits
- 6 attachments/message (desktop); documents/images/audio 25 MB each; video 200 MB.
- Types: images, audio, video, PDFs, Office docs, CSV, JSON, YAML, source code, HTML, email files, notebooks.
- Links: pasted links work if Bot can reach page from its computer or via a plugin.

## Feature inventory
1. **Persistent cloud computer** — browser, CLI, filesystem; shared workspace at `/workspace`; files/sign-ins/browser sessions persist; hibernates when idle.
2. **Computer-use (screen driving)** — click/type/navigate real websites; one computer-use task per Bot screen at a time; parallel across Bots. Screens are work surfaces, **not** security boundaries.
3. **Live computer preview** — watch in right panel; takeover anytime.
4. **Human handoff** for passwords, passkeys, 2FA, CAPTCHAs, payment/identity checks; Bot never types or sees credentials; session persists.
5. **Plugins** (OAuth connectors / MCP) — see integrations doc.
6. **Skills** — saved procedures (steps, decision rules, expected output, safety boundaries); cross-Bot; `/` invoke; plugin-packaged skills.
7. **Teach-by-demonstration** — records visible computer interaction ≤10 min → draft skill; user must add decision rules/failure handling/approval boundaries, then test.
8. **Routines** — scheduled + event-triggered; run in cloud; see routines doc.
9. **Memory** — stable preferences, facts, summaries; explicitly *not authoritative*. Descriptions = durable rules; messages = task-specific.
10. **Group chats** — 2–6 Bots, visible handoffs; bot-to-bot async messages (text-only; images must be sent directly); one owner per stage guidance; every Bot reply counts toward usage. Team Bot can be in group but not alongside Bots running on your own computer.
11. **Helper Bots** — Bots can create helper Bots; helper Bots can be muted/hidden.
12. **Team Bots** — shared cloud-hosted Bot, per-user private chats, owner's plugins/secrets.
13. **Voice chat** — 1:1; transcript card afterwards.
14. **Local execution** — Bot can run commands on user's desktop under policy (per-command approval default).
15. **Local egress** — route Bot web traffic through user's desktop IP.
16. **Secrets store** — write-only env vars exposed to shell; descriptions visible to Bot.
17. **Bot sharing/templating** — public link → copy.
18. **Search/command palette** across all Bots.
19. **Notifications** — per-Bot toggle; suppressed when app focused; badge/sidebar remain.
20. **Multi-device** — desktop + iOS + Android same state.
21. **Cloud Agents / delegation** — Bots can delegate *coding tasks* to separate Cursor Cloud Agent computers (admin toggle "Cloud Agents", default on, Teams+Enterprise); Auto Review also covers subagent/Cloud-Agent launches. [OFFICIAL teams doc]
22. **31-language UI** (desktop), 11 on phone (xAI docs say "more than 20"). Voice chat has own Language/Voice/Speed settings (Auto-detect available).
23. **Voice memos & drafts** — Bots can send playable voice memos and editable email/Slack draft cards (Send/Discard).
24. **Multi-account desktop** — Switch account / Add account.
25. **Disk Saver** — built-in Bot that audits cloud-computer disk usage and proposes cleanup with confirmation.
26. **Hardware security keys** (YubiKey) usable by the Bot's browser from your desktop: Settings → General → Security Key → Use hardware security keys (on by default Mac/Windows, not Linux; each use asks approval).
27. **Web-page forms** — when a page needs you to type something (login, address, phone), the Bot can show a form in chat and fill answers into the page; secret requests fill masked values ("Filled into the page").
28. **Share-sheet ingestion** on iPhone (and text on Android).
29. **Usage view** — weekly allowance + on-demand; per-product split in dashboard.

## Official use-case roles with starter prompts [OFFICIAL cursor.com/docs/grok-bot/use-cases]
Sales outbound · Talent scout · Paid media · Expense manager · Product performance · Bug reproduction · Account health · Chief of staff. Pattern for all: read-and-prepare → review → only then approved actions/routine; every prompt ends with "don't send/change X". Role-to-durable-Bot recipe: put job/sources/output format/boundaries in description → run one safe real task → correct → save as skill and test on 2nd input → create routine only after retries/failure cases defined. SpaceXAI-internal examples (launch post): sales Bot updating CRM from call transcripts; ops Bot seating new hires and processing Gmail invoices; engineering Bot reproducing a bug in UI, filing the ticket, handing fix to a debugging Bot; a "chief of staff" Bot managing specialist Bots. [OFFICIAL x.ai/news/introducing-grok-bot]

## Result-handling conventions (docs' recommended prompt structure)
- First task format: outcome, sources, constraints, deliverable format, stopping points.
- For consequential work, ask Bot to separate: facts from source systems / assumptions / actions completed / actions awaiting approval / unresolved questions.
- Routine template: "Every [schedule], run the [skill] against [input]. Post [output]. [Approval boundary]. If [source unavailable], [action]."

## Example Bot configs (official)
- Name: Piper / Job: Product performance / Description: "Investigate product-performance questions with our observability tools. Preserve links and screenshots, separate evidence from hypotheses, and lead with the highest-impact issue. Never change production settings."
- Name: Research / Label: Weekly product researcher / Description: "Research one product topic at a time. Use the web and the documents I share..."

## Community usage patterns [COMMUNITY]
- One author runs 8 Bots: Chief (calendar/expenses/Buffer), Gmail (newsletter filtering), X (post monitoring), podcast-MCP bot, icon generator, closet catalog (background removal), transit planner. Pattern: one "chief of staff" + many narrow Bots; delegation level found by trial and error.
- grokbot.dev lists 1,359 shareable Bot setups: Chief of Staff & Orchestrators (237), Money/Deals/Finance (205), Personal & Life (185), Work/Ops/Back Office (328), Dev & Engineering (97), Research/Monitoring/News (180), Creator/Content/Design (127).
- Known criticism: connectors are account-wide so every Bot can use any authorised token; no per-Bot credential scoping (birdhouse.io). The account-wide plugin scope and the shared-computer/"screens are not security boundaries" statements are now confirmed in official docs [OFFICIAL cursor.com/docs/grok-bot/work; docs.x.ai/grok-bot/approvals-security-and-privacy]; official advice: "When a workload needs its own computer and credential set, give it its own Cursor user."
