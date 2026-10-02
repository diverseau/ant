# Grok Bot — Routines, Triggers, Skills (automation layer)

Source: https://cursor.com/help/grok-bot/routines, https://cursor.com/docs/grok-bot/work, https://docs.x.ai/grok-bot/skills-routines-and-automations [OFFICIAL]

## Routines
- Created **by asking the owning Bot in chat** (natural language), e.g. "Every weekday at 9:00 AM, summarize new support tickets in this chat." There is no separate form-first creation UI; editing exists (Edit button).
- A routine = **Instruction** + **When to run** + owning Bot (+ webhook details if applicable).
- Schedules: plain language ("every weekday at 8:00 AM", "every 2 hours"). Uses timezone from Settings → Bot.
- New routines **do not run immediately**; wait for next slot. Use **Test** to run now.
- **Test = real run** (navigates sites, changes files, calls tools). Use safe inputs; keep writes behind approval.
- Runs in cloud, laptop closed.
- States: paused/active (switch). Run history (phone): **Running / Succeeded / Failed**; failed runs show a reason; phone detail shows Active, Schedule, Next run, Instruction, Run history; delete by swiping the row. Desktop: routine opens to **Instruction**, **When to run**, **Webhook**; buttons Pause/Resume, Test ("Running…" until done), Edit, Delete routine (trash; confirm; irreversible). Some routines don't show Test.
- **Limits [OFFICIAL docs.x.ai]: a Bot can own up to 50 routines; the app keeps the 20 most recent run records per routine.** Previously [UNVERIFIED community]; now confirmed.
- After a long period away, Grok Bot may ask whether to keep routines running and **pauses them if you don't respond**.
- Edit flow: **Edit** pre-fills a chat message beginning "Edit your routine: <name>"; phone **Add routine** pre-fills "Set up a routine to ".
- Where listed: desktop Bot name → **Tasks** (Cursor) / View conversation details → **Routines** (xAI) → Routines; empty state text: "Ask in chat to set a routine".
- Usage tip (official): hourly/short-interval schedules and Slack triggers on busy channels can burn a week of usage in a day; pause or widen/narrow before raising plan or on-demand limit. A routine that never runs spends nothing; Test does.
- Every run consumes usage.

## Trigger types
1. **Schedule** — interval/time.
2. **Slack** — Bot mention, specific word/phrase, *you* reacting to a message, or any message; one channel or all of Slack. Only new activity counts (pre-existing messages don't fire). Is part of the routine via a Cursor account integration, **not** the Slack plugin; the trigger is shown in words under When to run. Docs: keep narrow ("when a message in #customer-escalations contains a ticket link and 'needs repro', reproduce in staging"); avoid "every new message".
3. **Event integrations** — GitHub, Linear, Sentry, PagerDuty events; emails.
4. **Webhook** — three fields: **POST to** URL, **key** (sent as `Authorization: Bearer <key>`), **header** (copyable). JSON body is delivered to the Bot with the instruction. 200 OK = run started (not finished); anything else = no run. Check paused state and current key if it fails.

## Approvals inside routines
- Approvals raised by unattended runs (routine, trigger, message from another Bot) **expire after ~10 minutes** (card shows **Expired**, action doesn't run; may offer "Always allow this in the future"); approvals in a chat you're in wait indefinitely.
- Mitigations: enable Notifications on Bot, "Always allow" trusted actions, ask Bot to retry.

## Review checklist docs recommend for a routine test
Selected current inputs? Met output format? Kept source trail? Stopped at intended approval point? Made failure states explicit?

## Trust ladder (docs' philosophy)
Automate *preparation* before *execution*; keep sending, purchasing, deleting, publishing, production changes behind approval; report missing/stale sources rather than working around; re-test after website/plugin/format change.

## Skills
- Create: "Save the process we used for this task as a skill called X." Or **Teach a task** (demo recording ≤10 min; desktop; gradual rollout) → draft skill.
- Contents of a good skill: when to use, required inputs/access, sequence, validation, what to return, what needs approval.
- Skills are **cross-Bot** (one private-skill library for all your Bots), invoked via `/` in the **desktop** composer (xAI docs); reference routines/groups/Bots/connectors with `@`.
- Launch-post framing: watching a workflow "saves your workflow as a routine"; docs framing: demonstration → *draft skill* → you add rules → test → routine. [OFFICIAL x.ai launch post vs docs] Skills can be shared inside Bot templates and as Team Bot skills (only the owner can save a team skill; teammate-taught processes stay in per-person notes).
- Plugins can ship packaged skills (appear under Plugins → Yours as private skills / marketplace).
- Skill sharing: included in Bot template public links.

## Troubleshooting matrix (official)
- Routine not running → check not paused, "When to run", timezone; if no error for 24h+, report bug.
- Webhook failing → verify 200 response and current key.
- Run crashes → copy request ID (right-click message → **Copy request ID**, or hover → More message actions), retry, report; if same prompt fails fresh, file a bug with error text + ID.
- Also check: owning Bot still exists, required plugins still authenticated, computer can reach source, usage/account not paused.
