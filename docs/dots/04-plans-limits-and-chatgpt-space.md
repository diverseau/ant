# ChatGPT Dots — Plans, Limits, Admin Controls, ChatGPT Space

## Availability / pricing [OFFICIAL openai.com/index/introducing-dots; help.openai.com 20001530; ChatGPT release notes]
| Plan | Access |
|---|---|
| ChatGPT **Pro** (tiers **Pro 100 / Pro 200 / Pro 500**) | First dot included at no extra cost. **Excludes EEA, Switzerland, UK**; 18+. Prices: Pro 200 = $200/mo and Pro 500 = $500/mo are official (release notes: "Pro 500, a new $500/month plan… Astra Ultrafast"); Pro 100 ≈ $100 inferred from press "$100–$500/month" [SECONDARY NBC/Product Hunt coverage] |
| **Business Premium** | First dot included; all supported regions |
| Enterprise / Edu / Healthcare | **Beta, admin-enabled, off by default** |
| Specialist dots | focused pilots only (Contact sales) |
- Rollout is gradual ("Access may take several days to reach your account").
- **Usage**: conversations with your dot don't count against ChatGPT usage limits. Release notes: "For the next month, dots usage won't count toward eligible Pro, Business, and Enterprise users' plan allowances. After this period, we'll share usage terms for each plan." Launch/learn docs phrasing: "Your plan includes an allowance for deeper work, with extended limits for the first month after launch." Codex/Work tasks started by the dot count normally. [OFFICIAL]
- Unannounced: numeric allowance, extra-dot price, higher-capacity tiers (speed or monthly work volume), specialist pricing. OpenAI "has not published the ongoing Dots allowance or pricing for additional dots." [SECONDARY Vellum]
- Functional limits at launch: setup desktop-only; no mobile web; one primary dot; no outbound calls; no own email; SMS limited beta (Pro, US) / "coming soon"; Teams invite-only alpha; one personal computer connection; individual memories not viewable/deletable; Pro unavailable in EEA/CH/UK; under-18 unavailable; no numeric task/schedule limits published (none found).

## Workspace admin controls [OFFICIAL learn.chatgpt.com/docs/enterprise/dots-admin-guide, /cloud-local-access]
- Admin Console / **Workspace settings → Permissions & roles** (workspace default or custom roles assigned to groups): **Use dots (Beta)**, **Add dots to Slack**, **Allow local computer access** (separate opt-in under *Use Dots*; confirmation modal; Agent Security policies), **Use custom rules for dots**.
- **Cloud computer capabilities** (shared by Work Cloud and dots): **Cloud browser use**, **Cloud network access**, **Cloud computer use**; plus workspace capability **Use password manager**. Configuring one doesn't configure another.
- Plugin controls: app availability and allowed actions. Enterprise **model controls do not apply** to dots. Custom rules off → members can't add/edit, saved rules don't apply (defaults still apply).
- Eligibility limits: no data residency or inference residency during Enterprise beta (can opt in after acknowledging); unavailable for FedRAMP workspaces, EKM workspaces, inference residency AE; HIPAA workspaces can participate; `enforce_residency` policy disables local computer access for dots. Admin-managed remote MCP hooks supported with cloud orchestration; command/prompt/agent handlers and local/plugin hooks are not.
- Audit/monitoring: Compliance API (user messages + dots' replies; confirm coverage), Analytics API (usage), local executor OTel events only. Revoke access via workspace permissions (plus disconnect apps/sign out of sites separately).
- Slack: admin guide steps are in 02. Teams: invite-only alpha.

## ChatGPT Space (DevDay companion product) [OFFICIAL learn.chatgpt.com/docs/space*, openai.com devday recap, release notes; SECONDARY VentureBeat]
- Replaces ChatGPT **Library** ("Space replaces Library for accounts with access; your existing Projects remain separate"). Available to eligible Pro, Business, Enterprise on desktop app and web; mobile can find/read/share pages, creation/editing "coming soon"; Enterprise sharing is an opt-in preview.
- **Workspaces vs spaces**: a *space* groups pages around a topic/team; share the space to give access to its pages; sidebar sections include Pages, Sites, Images, Google Drive; All view tabs: Suggested, Favorites, Your items, Shared with you; **New → Page / Space**.
- **Pages**: real-time collaborative documents built for human + agent collaboration (text, tables, images, charts, interactive visualizations, files, subpages, comments). Create from **New page** or ask ChatGPT to make one from a conversation. Selection toolbar: **Ask for change**, **Comment**, formatting, Text styles. Drag handles to move blocks.
- **Syntax in Space** (the only slash/@ syntax found anywhere in the dots docs):
  - `/` insert menu: Generate, Image (Generate/Attach), File, Table, Code, Highlight, Page / Link to page, Files / Pages / Chats references, **Visualize** (`/visualize …`: calculators, diagrams, screen designs, apps, widgets), **Prompt** (reusable runnable prompt; "Chat about this"), **Task**, **Agent Instructions**.
  - `@` mention menu tabs: All, People, Pages, Chats; entries include `@ChatGPT` (starts a task) and **`@dot` / "My dot"** (sends a prompt to your dot). Works inline or inside a comment thread. A comment to a person is feedback; mentioning an agent asks it to act.
- Also: spreadsheets and presentations (**collaborative slides** "in the coming weeks"; export to PowerPoint/Google Slides), **Sites**, uploaded files; **Meetings plugin** (macOS beta, notes + action items saved into Space; audio deleted after notes).
- Connected materials: Google Drive etc. as context; linked files keep their original permissions; content copied/summarized onto a page is visible to all page collaborators; sharing a page doesn't expose private chats or saved memory.
- Collaboration: access levels **View / Comment / Edit** (Team invites may lack Comment); inherited access from parent page/space; each participant uses their own ChatGPT; deletion → Trash; admin sharing controls (disabling blocks new shares, existing access remains).
- **Correction vs earlier docs:** "auto-update when underlying data changes" is not supported at launch — the agents doc says **"Keep Updated isn't available at launch."** Recurring page updates must be set up as a scheduled task via ChatGPT chat and verified.
- Examples (secondary): project pages pulling action items from Slack/email/calendar; dots maintaining dashboards; blocker flagging [SECONDARY VentureBeat].

## Other DevDay 2026 items (context)
GPT-6.1 Sol (1/5 price of Astra), **Ultrafast** tier (Pro 500/Enterprise), **Pro 500** plan (25× Plus allowance), Agents API with computer use, Bedrock Managed Agents, Decisions API (limited preview), plugin extensions, improved plugin discovery, **MCP events for plugin automations**, Sites hosting plugins, **teams and Team Tasks** (Business/Enterprise), `@ChatGPT` in Slack/Teams (Business/Enterprise), Meetings plugin, shareable profiles, Sign in with ChatGPT (16 partners incl. Devin, Notion, Vercel, OpenClaw), OpenAI Marketplace (32 partners), Private Intelligence (ZDR + private safety processing; Private Inference preview this fall), Codex in the cloud, refreshed Codex CLI (`/agents` view), Codex Security Cloud.

## Competitive context cited by press
Meta Muse (free/$20/$100), Manus 2.0, Instinct, OpenClaw (open source), SpaceXAI Grok Bot.
