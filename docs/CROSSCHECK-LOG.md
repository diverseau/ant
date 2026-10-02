# Cross-check log (2026-10-02)

Method: re-read every claim in `docs/` against primary sources. Cursor and xAI docs and learn.chatgpt.com were fetched as raw HTML/Markdown (curl with a browser UA; the summarising WebFetch tool was too lossy). help.openai.com, openai.com and the ChatGPT release notes (403 direct) were read from `web.archive.org/web/2026/<url>` captures. Tags kept: [OFFICIAL]/[SECONDARY]/[COMMUNITY]/[UNVERIFIED].

Abbreviations: CUR = cursor.com, XAI = docs.x.ai/grok-bot, LCG = learn.chatgpt.com/docs, HOA = help.openai.com/en/articles, OAI = openai.com.

## A. Corrections (file · old claim → new claim · source)

| # | File | Old | New | Source |
|---|---|---|---|---|
| 1 | grok-bot/01 | "No iPad app" | iOS app also runs on iPad (iPadOS 18+) per xAI docs; Cursor docs mention iPhone only (flagged as conflict) | XAI/mobile, XAI/faq |
| 2 | grok-bot/01 | Launch 08-11; Android 09-02; Enterprise 09-03 all [SECONDARY] | Launch = beta macOS+iOS with Enterprise waitlist [OFFICIAL]; Windows/Android/Enterprise dates left as community-only | https://x.ai/news/introducing-grok-bot; macrumors.com/2026/08/11/grok-bot-macos-ios/; getgrokbot.com/en/changelog |
| 3 | grok-bot/01 | Tagline "Grok answers, Grok Bot does" tagged [OFFICIAL FAQ] | Not found verbatim on any official page; re-tagged [SECONDARY] | CUR/help/grok-bot/faqs |
| 4 | grok-bot/01 | Model: "secondary says grok-4.6, unconfirmed" | Added official statement that serving mix varies, analytics show serving model, billing follows it; 4.6 stays community | CUR/docs/grok-bot/security |
| 5 | grok-bot/01,04 | Slack "docs conflict slightly"; "no bot-identity Slack app" | Resolved: personal Bots (Slack plugin) post as the user; **Team Bots can be connected to Slack as their own app and post as themselves** | CUR/help/grok-bot/team-bots; XAI/team-bots |
| 6 | grok-bot/02 | Cmd+N only | `Cmd/Ctrl+N`; Settings `Cmd/Ctrl+,`; full shortcut list added | XAI/chat-and-collaboration#keyboard-shortcuts; CUR/docs/grok-bot/settings |
| 7 | grok-bot/02 | Share: "public share link" | Share → Create template → Copy link; Public link or Team-only (Enterprise default Team-only); Add to Grok Bot; Update template | XAI/bots |
| 8 | grok-bot/02 | Plugins at "Settings → Plugins → Marketplace/Yours" only | Sidebar Plugins/Marketplace; Marketplace → Your plugins → Manage plugins and skills; docs drift documented | XAI/settings-and-notifications; CUR/docs/grok-bot/settings |
| 9 | grok-bot/02 | Recover is in Settings → Updates beside Update/Reset | xAI docs: Recover only from the unreachable-computer error state; Cursor help says Settings → Updates or reconnect screen (conflict noted) | XAI/computer-and-apps; CUR/help/grok-bot/computer-recovery |
| 10 | grok-bot/02 | Auto-review "switch + personal rules" | Two rule types (Ask first, Allow automatically); stored per desktop | CUR/docs/grok-bot/security; XAI/approvals-security-and-privacy |
| 11 | grok-bot/02 | Computer-update/Test "desktop only" | Cursor: desktop only; xAI mobile page lists phone Update/Reset Computer; Test and schedule edit desktop-only (both sources agree) | XAI/mobile, XAI/troubleshooting |
| 12 | grok-bot/03 | Cloud Agents "delegate to separate computers" | Delegate *coding tasks* to Cursor Cloud Agents | CUR/docs/grok-bot/teams |
| 13 | grok-bot/03 | Community-only: connectors account-wide, no per-Bot scoping | Now confirmed in official docs (plugins account-wide; screens/Bots not security boundaries) | CUR/docs/grok-bot/work; XAI/computer-and-apps |
| 14 | grok-bot/04 | Custom MCP by URL [COMMUNITY] | Official: custom MCP servers (Remote HTTPS / Command) documented for Team Bots; personal-Bot UI detail still community | XAI/team-bots |
| 15 | grok-bot/04 | Slack trigger "reaction" | "when you react to a message"; one channel or all of Slack; part of routine, not Slack plugin | CUR/help/grok-bot/routines |
| 16 | grok-bot/04 | Webhook: "URL + auth key + header" | Fields POST to / key (`Authorization: Bearer`) / header; JSON body forwarded; 200 = run started | CUR/help/grok-bot/routines |
| 17 | grok-bot/05 | Limits "50 routines, 20 run records" [UNVERIFIED community] | **Official**: up to 50 routines per Bot, 20 most recent run records per routine | https://docs.x.ai/grok-bot/skills-routines-and-automations |
| 18 | grok-bot/05 | Approval expiry "~10 minutes" | Verified; added "Expired" card behavior | CUR/help/grok-bot/how-to |
| 19 | grok-bot/06 | Admin toggles listed without plan labels (Network Controls, Team Secrets, Action Recording, Enforce Auto-review, audit logs, OTel, SCIM, MCP allowlist) | Marked **Enterprise only**; Teams+Enterprise controls separated (Cloud Agents, template sharing, Team Rules, local-exec ceiling, Manage Team Bots, connector policy) | CUR/docs/grok-bot/teams, /security |
| 20 | grok-bot/06 | Execution on Local Computer "default Always allow" | Team ceiling default Always allow leaves choice to member; member default is Ask every time | CUR/docs/grok-bot/teams |
| 21 | grok-bot/06 | "US-only residency on request" | Computers run in US; Cursor's US-only residency program does not apply by default; commitments via account team | CUR/docs/grok-bot/security-faq |
| 22 | grok-bot/06 | "Team Secrets" implied for Bots | They are env vars for Team Setup scripts only; Team Bot secrets are separate (≤25, 8–4096 bytes) | CUR/docs/grok-bot/teams; XAI/team-bots |
| 23 | grok-bot/06 | "auto-terminate 30-day-inactive (Enterprise)" | Off by default; durable disk kept | CUR/docs/grok-bot/computers |
| 24 | grok-bot/06 | Free tier "not time-based" | Credit-based **and a 7-day window also applies** | CUR/help/grok-bot/plans |
| 25 | grok-bot/06 | "Cursor Pro ($20)" | $20 not on any Grok Bot page; marked [UNVERIFIED here]; tiers Pro<Pro+<Ultra | CUR/help/grok-bot/plans |
| 26 | grok-bot/06 | Limits all unverified | Reclassified (see #17 and additions); only "50 Bots+groups" stays community | XAI/skills-routines…; continuumcode.ai |
| 27 | dots/01 | UI: ••• → Pause / Reset / Delete | Help center says Reset, learn.chatgpt.com says Delete; same effect; Pause semantics (main task only) verified | HOA/20001530; LCG/dots/controls |
| 28 | dots/01 | Plugins at `chatgpt.com/plugins`; "replaced Apps in July 2026" | Official docs say **Plugins tab**; URL and July date unverified; custom GPTs→plugins transition verified | LCG/plugins.md; LCG/migrate-custom-gpts.md |
| 29 | dots/01 | "Aeon → o → Dots" [UNVERIFIED] | "o" corroborated by anchor IDs in the official admin guide; "Aeon" remains unverified | LCG/enterprise/dots-admin-guide.md |
| 30 | dots/02 | Microsoft Teams "Live" | **Invite-only alpha** per admin guide (docs/launch post say Teams is a channel) | LCG/enterprise/dots-admin-guide.md |
| 31 | dots/02 | SMS "Coming soon / limited beta" mixed | Both official: learn docs "coming soon"; help center: limited beta, Pro US only, third-party provider, STOP; both stated | LCG/dots/channels.md; HOA/20001530 |
| 32 | dots/02 | Slack "responds only to you" | Verified; added: only owner can direct it, adding to a channel ≠ monitoring, admin chain; `@ChatGPT` in Slack is a *different* product | LCG/dots/channels.md; admin guide; LCG/third-party/slack.md |
| 33 | dots/03 | Hard floor "password changes, money transfers, permanent deletions (per press)" | Official: password changes and money transfers → take over; permanent deletion and software install → may need approval each time; purchases → approval | HOA/20001529 (via web.archive.org) |
| 34 | dots/03 | Rule 2 only "Take action when you say so" | Two labels exist: "…when you say so" (learn) and "…if pre-approved" (help/mobile) | LCG/dots/controls.md; HOA/20001530 |
| 35 | dots/03 | Memory cannot be selectively deleted | Verified; added cannot even view; retained context excludes credentials/images/screenshots | HOA/20001529 |
| 36 | dots/04 | "Pro (100/200/500, entry ≈ $100)" | Tier names official; $200 and $500 official; $100 only press range "$100–$500" | OAI/devday release notes (archive); NBC News |
| 37 | dots/04 | "first month usage doesn't count" | Release notes: dots usage won't count for the next month then terms published; launch docs say "extended limits for first month" | ChatGPT release notes (archive); LCG/dots |
| 38 | dots/04 | Space pages "auto-update when underlying data changes" | **Not at launch**: "Keep Updated isn't available at launch" | LCG/space/agents.md |
| 39 | dots/04 | Space "tag/@mention dots or ChatGPT" | Exact syntax `@ChatGPT` / `@dot` (or "My dot" in `@` menu), plus `/` insert menu | LCG/space/agents.md |
| 40 | README / open-questions | "Dots help-center pages 403 so Dots detail leans on press" | Resolved via archived copies; detail now official | web.archive.org/web/2026/ captures |
| 41 | README / open-questions | "Neither has slash-command catalog" | Re-confirmed; added Grok shortcut list and Space `@dot`/`/` syntax | XAI/chat-and-collaboration; LCG/space/agents.md |
| 42 | matrix | Teams ✅, Webhook-in ?, Custom MCP ?, Slack ◐ etc. | Updated (see matrix) | as above |

## B. Additions (where)
- grok-bot/01: dual doc mirrors, @bot X account, no official changelog, internal prototype origin, voice memo, web-surface note.
- grok-bot/02: shortcut list, docs-drift table, Disk Saver, account switching, avatar tabs, delete-account path, support email, release-feed/installer URLs, phone capabilities, share sheet.
- grok-bot/03: use-case roles/prompts, new features 23–28 (voice memos, drafts, multi-account, Disk Saver, security keys, in-chat forms, share sheet), `/` troubleshooting.
- grok-bot/04: custom-MCP transports, plugin capability statements, Google admin approval steps, Team-Bot Slack setup flow, webhook fields, deployment/feed, private networking (Tailscale/Cloudflare Tunnel), allowlist domains.
- grok-bot/05: routine UI details, 50/20 limits, idle-pause behavior, usage tips, skill/launch-post framing.
- grok-bot/06: full Enterprise-vs-Teams control matrix, Team Bot details/limits, Action Recording contents, local-exec dialog, certification issuer, deployment/update policy, billing details (mobile, refunds, trial), Admin/Organization API scope.
- dots/01–04: handle/avatar editing, pets, profile controls (Call, pencil), Open computer/Take over/Return control, Allow/Revoke access/Offline states, mobile Customize menu, default approval policy, admin permission names, cloud-computer toggles, eligibility exclusions (FedRAMP/EKM/AE/residency), Compliance/Analytics API, plugin directory structure, `@`-plugin syntax (generic), generic shortcuts, Auto-review background, DevDay feature list (MCP Events, Agents API computer use, Pro 500, Ultrafast), Space syntax and permissions, Space availability.
- sources.md, README, open-questions rewritten/extended.

## C. Still unverifiable (kept [UNVERIFIED]/[COMMUNITY])
- Dots: exact Custom Rules action catalogue; `chatgpt.com/dots` and `chatgpt.com/plugins` URLs; July-2026 "Plugins replaced Apps"; "Aeon" name; Pro 100 price; post-launch allowance; whether Teams/texting are live; whether generic shortcuts/`@` plugin syntax work in a dot chat; approval expiry for unattended dot work; red-team percentages (flaviocopes); "no independent security audit"; dev.to Agents-API code; model-marketplace listings for GPT-6 Astra; dots safety blog and system-card appendix contents; Auto-review configuration article.
- Grok Bot: Pro $20; model identity (Grok 4.6/4.7); "50 Bots + groups" cap; Windows/Android/Enterprise launch dates; launch-day plan matrix differences; "Grok for Slack" product; grokbot.dev counts (1,359 setups, 53 plugins) not re-fetched; Team Bot X-post date; tagline wording; whether iPad is truly supported; whether phone can update/reset computers (docs disagree).
- Not reachable: x.ai/bot, x.ai/news, openai.com/help.openai.com (direct), x.com/bot, datacamp.com/blog/grok-bot (403).
- Reddit/HN/YouTube transcripts: searches returned mostly blogs; none yielded additional verifiable UI facts.
