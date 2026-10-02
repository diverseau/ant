# ChatGPT Dots — Overview & UI Map

> Research snapshot 2026-10-02 (cross-checked). Announced **2026-09-29 at OpenAI DevDay**; gradual rollout ("may take several days to reach your account"). Tags: [OFFICIAL] = openai.com / help.openai.com / learn.chatgpt.com, [SECONDARY] press, [COMMUNITY], [UNVERIFIED]. **Source note:** help.openai.com and openai.com still return HTTP 403 to direct fetches, but archived copies at `web.archive.org/web/2026/<url>` were readable and are the basis for the [OFFICIAL] help-center content below. learn.chatgpt.com pages are readable directly and every page has a raw Markdown twin (append `.md`; index at learn.chatgpt.com/llms.txt).

## What it is
- A **dot** = a named, persistent, always-on personal agent inside ChatGPT, powered by **GPT-6 Astra**, with **its own cloud computer + browser**. [OFFICIAL openai.com/index/introducing-dots]
- **One primary dot per user at launch**; "in the future, you'll be able to add more dots, and scale the output of each dot by either increasing its speed or the total amount of work it can take on per month" (pricing unannounced). OpenAI "envisions teams of dots working together." [OFFICIAL]
- Works while your devices are off; keeps notes/memory; works multiple tasks in parallel via background agents; can "decide when to pause and wake up" so no fixed schedule is needed for every follow-up; proactively reaches out when it needs a decision. [OFFICIAL]
- Default handle `@yourname-dot` → `@yourname-agentname` after naming (learn.chatgpt.com example: dot "Alfred" → `@tibo-alfred`). [OFFICIAL]
- Visual identity: floating cartoon "dot"; customise **name, shape, color, eyes, glasses, accessories**; help center adds you can pick from available **characters or a pet** (the dot may generate a pet for you). Change later: select the dot's name/avatar to open the profile → **pencil icon**. [OFFICIAL]
- Differs from Grok Bot: **one dot ≈ one agent with its own computer** (Grok Bot: many Bots share one computer).
- Internal inspiration claims from OpenAI: bug appears in Slack → dots start investigating; design arrives → dots build a working app; early tester's dot noticed an un-invoiced publication, prepared the invoice and sent it after approval. [OFFICIAL launch post]

## Where you do things (UI map)
| Task | Location |
|---|---|
| Create your dot | **Desktop ChatGPT app (macOS; also Windows) or ChatGPT on a desktop browser** ("Open dots in ChatGPT" and follow the introduction). **Cannot create on mobile; mobile web unsupported.** (`chatgpt.com/dots` URL is [UNVERIFIED]; 403 to us) |
| Onboarding | intro → connect apps (email/calendar/files; skippable) → in desktop app choose whether to connect your computer → connect messaging channels from desktop (Slack, texting if eligible) → dot introduces itself and suggests ways to help |
| Dot profile | open the dot in ChatGPT → profile: **Activity** (In progress / Scheduled / Completed), **Scheduled**, **Computers** (**Your computer** + cloud computer), **Add** (contact methods), **Call** button (desktop app), **pencil** (edit name/avatar), **••• menu** (Pause / Reset-or-Delete). Phone: profile has **Customize → Plugins / Memory / Custom rules** |
| Give it work | Message in the dot's conversation; **+** attaches file/photo; ask in plain language ("review my calendar", "remind me later", "check X every weekday 9 AM Central for four weeks; confirm the schedule") |
| See work in progress | profile → **Activity** (desktop app): tasks with description/status/steps/files/results, pending decisions, app connections, sign-ins, approvals. Shortcut `⌘+⌥+U` "Toggle Activity view (when available)" is in the generic ChatGPT app shortcut table [OFFICIAL learn.chatgpt.com/docs/reference/commands]; whether it applies to dots is [UNVERIFIED] |
| Tasks as threads | each cloud task = separate conversation in desktop/web/mobile; local Codex tasks appear on the connected computer (sidebar); dot can create/check/continue them |
| See recurring work | profile → **Scheduled** (instructions, timing, destination; active/paused/completed; open a task to change repeat schedule, time, completion notifications; disable or delete) |
| Add messaging channel | profile → **Add** → shows contact methods available to you (Slack; Teams (invite-only alpha); texting only if in beta; calls in ChatGPT) |
| Call it | phone button in the dot's conversation, or **Call** in the profile (desktop app). Can type while on call. Dot can't call you |
| Inspect/take over its browser | profile → **Computers** → **Open computer** (view only) → **Take over** → **Return control**. On mobile the computer opens "in your control". Website sign-in takeover ends with **Done** |
| Connect *your* computer | ChatGPT desktop app on that computer → dot profile → **Computers → Your computer → Allow → Allow access** (confirm). One personal computer at a time; persists between tasks; must be online with ChatGPT open; status **Offline** ≠ revoked; **Revoke access** removes (status Disconnected). Off by default |
| Plugins/apps | ChatGPT **Plugins** tab (web/desktop; mobile: dot profile → Customize → Plugins). Directory tabs: **OpenAI**, **<your workspace>**, **Personal** (Created by me / Shared with me), plus **Installed** row; install with **+**. Custom GPTs are being transitioned to plugins. [OFFICIAL learn.chatgpt.com/docs/plugins, /migrate-custom-gpts] (`chatgpt.com/plugins` URL and "replaced Apps in July 2026" are [UNVERIFIED]) |
| Permissions | **Settings → Personalization → Custom rules** (under **Permissions**): **Add** → describe action → choose behavior → **Add rule**. Phone: **Customize → Custom rules**. Plugin permissions: Plugins tab ("Open Plugins" from Custom rules) |
| Memory | phone: Customize → Memory shows ChatGPT memory (shared settings); dot's own notes can't be viewed |
| Pause | profile ••• → **Pause** (state shows "Paused • Tap to resume"; **Resume**). Stops the current *main* task; does not stop delegated tasks or cancel schedules |
| Stop delegated task / schedule | task in **Activity** → stop; **Scheduled** → disable/delete (separate actions) |
| Reset/Delete | profile ••• → **Reset** (help center) / **Delete** (learn.chatgpt.com) — same effect: deletes dot, its conversations, saved memories, scheduled tasks; irreversible. Files, Codex threads, ChatGPT conversations it created persist; other ChatGPT memories persist. After reset you land in a new chat and must recreate on desktop |
| Texting STOP | reply **STOP** to stop outgoing texts (beta only) |
| Data controls | existing ChatGPT data controls ("Improve the model for everyone" on personal plans) apply |
| Shared workspace | **ChatGPT Space** (replaces Library) — see 04 |
| Report a mistake | OpenAI "support page for dots" (URL not captured) [UNVERIFIED] |

## Docs map
- learn.chatgpt.com: [Meet dots](https://learn.chatgpt.com/docs/dots) · [Get started](https://learn.chatgpt.com/docs/dots/getting-started) · [Message your dot](https://learn.chatgpt.com/docs/dots/channels) · [Tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory) · [Computers and apps](https://learn.chatgpt.com/docs/dots/computers-and-apps) · [Controls](https://learn.chatgpt.com/docs/dots/controls) · admin: [Set up dots for work](https://learn.chatgpt.com/docs/enterprise/dots-admin-guide) · [Local computer access for Work Cloud and dots](https://learn.chatgpt.com/docs/enterprise/cloud-local-access).
- Help center: "Getting started with your dot" (20001530), "Dots privacy, security, and safety FAQs" (20001529); linked: plugins (20001256), app accounts (20001494), app permissions (20001495), "Auto-review configuration" (not captured).
- Also referenced by OpenAI: a **dots safety blog**, a **system card appendix** inside the GPT-6 Astra system card (deploymentsafety.openai.com/gpt-6-astra), and the alignment write-up on Auto-review (alignment.openai.com/auto-review — about Codex sandbox escalations, uses GPT-5.4 Thinking low; ~99% approvals; not dots-specific).

## Names / history
Anchor IDs in the official admin guide read `...-o-...` (e.g. "can-we-use-o-if-our-workspace-requires-ekm-or-zdr"), which corroborates an internal short name "o" [OFFICIAL, inferred]. "Aeon" → "o" → "Dots" within ~8 days pre-launch comes from leaked strings [UNVERIFIED]. Leaked strings also mentioned "text it, call it, Slack it, email it", purchases with approval, 3D customizable character.
