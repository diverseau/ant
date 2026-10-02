# ChatGPT Dots — Tasks, Memory, Scheduling, Controls, Safety

## Tasks [OFFICIAL learn.chatgpt.com/docs/dots/tasks-and-memory; help.openai.com 20001530]
- Dot manages multiple responsibilities simultaneously; can switch tasks/add detail/change priorities in the same conversation; pauses/resumes by progress ("no fixed schedules needed").
- **Background agents** work in parallel while you keep chatting and report back to the dot; dot can create separate visible threads and send follow-up instructions.
- Task types the dot can use:
  | Task | How |
  |---|---|
  | New local Work or Codex task | on a computer connected to the dot (computer online, ChatGPT app open) |
  | Existing local Codex task | continue it on the connected computer (identify task + change) |
  | New cloud coding task | in a Codex cloud environment you already set up (computer can be offline) |
  | Task the dot created | check results/send follow-ups via original computer/environment |
- Changing the dot's selected computer doesn't move an existing task. A new task gets instructions/context from the dot only, not every conversation you've had. A completed run doesn't by itself confirm the result was achieved or delivered; check errors.
- You specify which results warrant updates and which decisions need your input.
- Start with *ongoing responsibilities* (not one-offs), share sources, say what needs approval. Dot "keeps notes as you work together." Official prompt patterns: offsite tracker (decisions/deadlines/waiting-on + draft replies, don't send); fixed-schedule check-in ("each weekday at 9 AM Central for the next four weeks… message me in ChatGPT if a deadline is at risk… Confirm the schedule"); launch revision; study update; proposal upkeep; interview-to-content; feedback-to-PR.
- Doc-recommended exercise (third-party/secondary guide): starter kit with fictional project notes → "prepare a morning brief" → verify before connecting live sources; set Custom Rules *before* connecting work accounts. [SECONDARY]

## Scheduling / triggers
- Recurring work requires a saved schedule: **what to check/update, when (timezone, optional end date), which changes trigger notifications, where results are delivered**. Dot confirms what it saved; review under profile → **Scheduled** (open task to change repeat schedule, time, completion notifications). Scheduled runs and proactive updates appear in the conversation. You can also just ask for a reminder or to list/change/cancel scheduled tasks.
- Event triggers via natural language when a connected service supports event monitoring; ask the dot to confirm which events it can follow. Source connection alone doesn't create a monitoring task.
- Scheduled states: active / paused / completed.
- Platform context: ChatGPT-wide **Scheduled tasks** (learn.chatgpt.com/docs/automations; Scheduled tab; web/mobile can also run on supported app events) and DevDay **MCP Events** for plugin-started automations; Team Tasks for Business/Enterprise. [OFFICIAL]
- When the dot can start work without a new message from you: background research, reminders/recurring tasks you scheduled, follow-ups it decides on.

## Memory (three layers) [OFFICIAL]
1. **Conversation context** (current messages, instructions, tool results; calls use a selection that can differ from what background tasks see).
2. **Persistent memory** = relevant ChatGPT memory (inherited; conversations with the dot can contribute back to ChatGPT memory) + the dot's **own notes** (separate from ChatGPT saved memory; not a transcript), including memories formed from connected apps without a specific question.
3. **Cross-channel continuity** (ChatGPT/Slack/Teams/calls = same dot; visible conversations stay distinct).
- **Cannot view, selectively delete or edit individual dot memories**; only deleting/resetting the dot removes its context. Disconnecting a plugin stops new access but doesn't remove learned info. Turning off ChatGPT Memory stops the sharing but doesn't delete what the dot already received.
- Retained context excludes credentials, images and screenshots; encrypted at rest and in transit; files created elsewhere follow that location's retention.
- Learns from feedback/corrections ("the more you correct it, the more it learns preferences, goals, standards"). Official: "learn from feedback over time."

## Proactive research
- While you're inactive, dot researches using connected apps with **read-only** restricted tools (cannot send messages to others, change content through plugins, or control browser/computer). Keeps private notes; flags connections to previous work (example: release decision conflicts with a draft shared last week). Not trained on directly; if brought into an eligible conversation, settings apply. Cannot be turned off by the dot; follow-up actions need the normal permissions/approvals. Assigned recurring tasks have separate permissions.

## Controls [OFFICIAL learn.chatgpt.com/docs/dots/controls; help.openai.com 20001529]
- **Custom Rules** (Settings → Personalization → Custom rules, under Permissions; phone Customize → Custom rules): Add → describe action → pick behavior → Add rule; menu to edit/delete; "Open Plugins" → Plugin permissions. Behaviors:
  1. **Take action without asking**
  2. **Take action when you say so** (learn.chatgpt.com label) = **Take action if pre-approved** (help-center/mobile label): proceeds only when you explicitly request it in your prompt, otherwise asks right before acting
  3. **Ask before taking action**
  4. **Hand off to you**
  Examples: "send messages to customers" → ask first; "delete shared files" → hand off. Rules are *instructions the dot tries to follow* (it can make mistakes); they don't grant app/computer access, don't override built-in safety, don't remove required confirmations (e.g. using a saved login). The dot ships with "strong defaults" (default rules viewable in Custom rules); **the exact list of supported actions is not published** — help center only says "what your dot can share, purchase, or access." Workspace admins can disable Custom Rules entirely (saved rules then don't apply; defaults still do).
- **Default approval policy** [OFFICIAL help.openai.com 20001529 FAQ]: changing a password or transferring money → you must **take over**; permanently deleting data or installing software → may need approval each time; recurring messages → approval can be given in advance; card purchase on a merchant site → approval (advance OK); read-only research → allowed. Approving one message ≠ standing permission; be specific (who/what/when).
- **Auto-review** (cannot be disabled by dot or user): before actions that could affect accounts or share information, checks against your instructions, Custom Rules, permissions and built-in safety; decides proceed / ask approval / you must do it. Example: before sending an email checks recipient and message. If it blocks, dot may ask clarification/approval, try a permitted alternative, or stop; approval can't override core safety. Applies to delegated and background work. Separate **safety monitoring** can pause/stop work (reviews actions and, per OpenAI, chain of thought). OpenAI also published an Auto-review write-up (alignment.openai.com/auto-review) about Codex sandbox escalations (separate reviewer model, ~99% approved) — related design, not dots-specific.
- **Safety layers listed by OpenAI**: model safeguards (GPT-6 Astra refusals), plugin permissions, Custom Rules, Auto-review, safety monitoring, restricted proactive-research tools, prompt-injection defenses ("content doesn't grant permission"). Secondary red-team figures: 0 successful prompt-injection in 19,238 simulated attempts; scope violations rose with long task chains (8.6% at 5 tasks, 19.7% at 10) [SECONDARY flaviocopes.com — not verified against system card].
- **Activity view** for oversight (desktop app); pause/resume; stop delegated tasks; delete. Stopping doesn't undo completed actions; reversibility depends on action/app (dot may be able to undo e.g. edits/recall email).
- OpenAI can pause/stop a dot if monitoring detects a safety concern. Human review in limited cases (safety), even with model improvement off.
- Training: Business/Enterprise/Edu not used by default; personal plans governed by "Improve the model for everyone". DSAR via privacy portal / dsar@openai.com. Under-18 not allowed.
- Enterprise governance: Compliance API records for user messages and dots' replies; Analytics API for usage; OTel only for local executor, not cloud orchestration events. Admin permissions list is in 04.
- Critics: no independent security audit pre-launch (press) [SECONDARY, unverified]. NBC reported OpenAI disclosed past internal-model incidents and withheld GPT-6.1 Astra for scope reasons [SECONDARY].

## Enterprise "Specialist dots" (pilot)
- Org-identity agents with their own **identity, credentials, IT-provisioned hardware, deep integrations with systems of record**; defined business roles (procurement, invoice processing, email marketing, customer support, commercial contracting). Integrate with **Microsoft Agent 365** for governance (machine identity: onboarding, credentials, access policy, monitoring, offboarding). Focused pilots with OpenAI engineers only; "we'd like to hear from you" for new roles. [OFFICIAL launch post; Contact sales]
