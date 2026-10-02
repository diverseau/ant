# Grok Bot — UI Map ("where do I go to do X")

Source: Cursor official docs/help center (desktop + iOS). [OFFICIAL] unless noted.

## Layout (desktop)
- **Left sidebar**: list of Bots (pinned), **sections** (user-defined folders), group chats, **New** button, **Plugins**, hidden-bots entry, search/command palette.
  - Status indicators per Bot: *needs attention* (question/approval pending), *unread*, *working*.
- **Center**: chat with the selected Bot. Composer supports paste text/links/images, attach files, `/` skills, `@` mentions, reply-to, react, mid-task messages, dictation (**Start voice input**, `Cmd/Ctrl+D`), voice chat (waveform button, empty composer only). Drafts a Bot prepares for email/Slack appear as an editable **New Email / New Slack Message** card with **Send / Discard**; Bots can also send playable **voice memos**.
- **Right panel**: **Computer preview** (live view of clicks/typing/navigation/status); xAI docs call the view **Agent Computer**. Buttons: **Open computer**, **Take over**, **I'm done** (Cursor how-to) / **Return control** (xAI docs), **Teach a task**; sign-in handoff card says **Action needed** with a **Skip** option.
- **Sidebar bottom**: **Hidden Bots** (phone: **Show Hidden Bots**). Left-sidebar "New chat" dialog also lets you type a name and pick **Create "Name" Bot**, **Create new Team Bot**, **Team Bots** (browse published), or group chat.
- **Account menu**: usage summary (weekly), About (version, "Copy version info"), "New update available → Install → Restart to update", Settings, **Switch account / Add account** (multiple Cursor accounts per desktop; inactive rows have **Remove**) [OFFICIAL docs.x.ai/grok-bot/faq], link to the iOS app. "Update required" full-window screen appears when the build is >14 days old and a newer one exists.
- Dock/taskbar badge for attention.

## Task → location
| Task | Where |
|---|---|
| Create a Bot | Sidebar **New → Create new Bot** (or `Cmd/Ctrl+N`); new Bot is named "New Bot". First sign-in auto-creates a Bot named "Grok Bot" and a **Meet a future teammate** picker (xAI docs) |
| Create a Team Bot | **New → Create new Team Bot** (or Share menu → **Publish to Team** on an existing Bot) |
| Edit Bot identity | Click Bot name → **View conversation details → Bot settings** (Name, Label (optional), Description, avatar, Notifications toggle). Quick rename: right-click → **Rename Bot** or double-click the name. Avatar tabs: **Bot** (character look) / **Generate** (from text) / **Upload** (<25 MB). Phone calls these Title / Instructions. Owner only. ("Edit Profile" was removed from the right-click menu.) |
| Organize Bots | Right-click Bot → **Move to new section / Move to**; right-click section → rename; deleting a section → Bots go to *Unassigned* |
| Hide a Bot | Right-click → **Hide from sidebar**; unhide via **Hidden Bots** → right-click → **Show in sidebar**. Hidden Bots still run but don't notify |
| Duplicate a Bot | **Duplicate** (docs list it under Bot management; Cursor help says iPhone); copy named "<name> copy"; copies profile, settings, enabled skills, routines, avatar; NOT history/memory/attachments |
| Share Bot config | **Share menu → Create template → Copy link**; choose **Public link** or **Team-only** (Enterprise defaults to Team-only; others to public). Recipient opens an x.ai preview → **Add to Grok Bot** (accepts third-party bot terms) → gets a *copy* (identity, description, skills, routines). Never gets computer/logins/history. Admins can disable public sharing; **Update template** after edits [OFFICIAL docs.x.ai/grok-bot/bots] |
| Install plugin | Sidebar **Plugins** (Cursor docs) / **Marketplace** (xAI docs; `Cmd/Ctrl+Shift+M`) or in-chat **Connect** card → search → **Add** → authorize in browser → verify under **Installed**. Installed list + private skills: Marketplace → **Your plugins → Manage plugins and skills**. Phone: avatar (top-left) → Plugins |
| Add 2nd account to a plugin | Plugins → plugin → **Accounts → Add Another Account** (phone: "Authorize new account") → label it ("work") → Authorize. Tell Bot which label to use |
| Reconnect plugin | Plugins → plugin → **Authorize / Reopen / Retry** (sign-in must finish within ~10 min); statuses: Connected, Needs auth, Disconnected, Disabled by team admin |
| Log into a website for the Bot | Bot shows **Computer card "Action needed"** → **Take over** → sign in (password/2FA/passkey/security key) → **I'm done** |
| Teach a task by demo | 1:1 chat with computer view open → **Teach a task** → describe result → perform workflow (records up to 10 min, no mic) → draft skill. Desktop only; "rolling out gradually" |
| Save a skill | Ask in chat: "Save the process we used as a skill called X" → invoke with `/X` |
| Create/edit routine | Ask the Bot in chat; edit via Bot name → **Tasks** (xAI docs: View conversation details → **Routines**) → open routine → **Edit** (starts a message "Edit your routine: <name>"). Phone: Bot profile → **Routines → Add routine** (starts "Set up a routine to "). Editing schedule/instruction and Test are desktop-only |
| Pause/resume/test routine | **Tasks** list switches; **Test** button (performs REAL work) |
| Routine run history | Phone: Bot profile → Routines → **Run history** (Running / Succeeded / Failed) |
| Approvals | Approval card in chat; sidebar attention; notification if per-Bot Notifications on |
| Auto-review rules | Settings → General → **Auto-review** (xAI docs also show it under Settings → General → **Bot**) switch + personal rules of two kinds: **Ask first** (always stops) and **Allow automatically** (proceeds only if reviewer finds no other reason to stop); "Ask first" wins. Personal rules are stored per desktop and synced to that desktop's computer. Admin-locked rows say "Required by your admin. You can't edit or delete this rule." Phone: Settings → Configure Auto Review (when available) |
| Local command execution policy | Settings → **Computer → Execution on this computer** (per-command approval default; always allow / ask every time / never) |
| Route Bot web traffic via your desktop | Settings → Computer → Network → **Route traffic through this computer** (new connections only; admin can lock via "Allow Local Egress") |
| Secrets | Secure secret card in chat ("Save securely") or Bot → **Secrets → Add secret** (env var name, description visible to Bot, value write-only) |
| Group chat | New → group chat with 2–6 Bots; `@Bot` to route, `@everyone` for broadcast; rename via right-click |
| Voice chat | Open 1:1 chat, empty composer, tap waveform **Start voice chat**; mute/end/transcript/voice/speed/language settings; one call at a time; not in groups or Team Bots |
| Search | Command palette `Cmd/Ctrl+K` / **Search Bots** `Cmd/Ctrl+Shift+F`; phone home-screen search tabs: Messages, Bots, Group Chats, Files, Routines, All. Cross-conversation search availability "can vary during rollout" |
| Usage | Settings → **Usage & Billing** (weekly included + on-demand); spending cap: Settings → **On-demand monthly limit** (Enable) or cursor.com/dashboard → Spending → Monthly Limit. Not a hard stop mid-run. No Grok-Bot-specific cap exists for Teams. Link SuperGrok/X Premium+: **Link Grok Account / Link X Account** shown only on the pre-sign-in Get Started screen (quit+relaunch to see it again); desktop Settings → Usage & Billing also offers "Link SuperGrok …" per xAI docs |
| Time zone for schedules | Settings → **Bot** |
| Language | Settings → General → Appearance → Language (31 desktop, 11 phone); voice has own setting |
| Appearance | Settings → General → Appearance: Follow System / Light / Dark |
| Update app | Settings → Updates → Check for Updates → Restart to Update; toggle Automatic Updates |
| Update/recover/reset the *cloud computer* | Settings → Updates → **Grok Bot's Computer**: **Update**, **Reset** (last resort). **Recover** is offered from the unreachable/"Couldn't Reach Grok Bot's Computer" error screen (xAI docs say *only* there; Cursor help says Settings → Updates or the reconnect screen). All rebuild from last saved data; conversations survive. Phone: Settings → Bot → Bot Computer → **Update Computer / Reset Computer** (xAI docs) though Cursor docs say computer updates are desktop-only. Low-disk warning → **Go to Disk Saver** (a Bot that audits space, asks before deleting) |
| Security keys | Settings → General → Security Key → "Use hardware security keys" (Mac/Windows) |
| Copy request ID (support) | Right-click message → **Copy request ID** |
| Delete Bot | Permanently removes profile, conversation, routines (files/sign-ins persist on shared computer). Team Bot: right-click → Delete (irreversible for whole team) |
| Delete account | iOS: avatar → Settings → account → Delete Account. Desktop/web: no separate account; delete the Cursor account at cursor.com/dashboard → Advanced Account Settings → Delete Account (cancel subscription first; data removed within 30 days) [OFFICIAL cursor.com/help/grok-bot/delete-account] |
| Switch accounts | Account menu → Switch account / Add account |
| Mic for voice | Settings → Microphone |
| Contact support | Email **hi@cursor.com** (account email, platform/version, screenshot, request ID); status at status.cursor.com [OFFICIAL cursor.com/help/grok-bot/get-help] |

## Desktop keyboard shortcuts [OFFICIAL docs.x.ai/grok-bot/chat-and-collaboration#keyboard-shortcuts]
`Cmd/Ctrl+K` search palette · `Cmd/Ctrl+Shift+F` search Bots · `Cmd/Ctrl+N` new Bot/chat · `Cmd/Ctrl+F` find in chat · `Cmd/Ctrl+B` compact sidebar · `Cmd/Ctrl+I` or `+L` focus prompt · `Cmd/Ctrl+1..9` sidebar Bot · `Alt+↑/↓` prev/next Bot · `Cmd/Ctrl+[ / ]` history back/forward · `Control+Tab` / `Control+Shift+Tab` cycle Bots · `Cmd/Ctrl+Shift+M` (or `+W`) Marketplace · `Cmd/Ctrl+Shift+,` toggle Bot settings · `Cmd+Shift+I` / `Cmd+Alt+B` (mac) or `Ctrl+Alt+B` conversation details · `Enter` send / `Cmd/Ctrl+Enter` send from anywhere / `Shift+Enter` newline · `Cmd/Ctrl+D` dictate · `Cmd/Ctrl+,` settings · `Cmd/Ctrl+= / - / 0` zoom · `F11` fullscreen. Start voice chat has **no keybinding**. First-use local-exec prompt: Always allow / Allow once / Never / Deny once (`Esc`).

## Docs drift (same feature, different labels between Cursor and xAI docs)
Plugins ↔ Marketplace/connectors · "Route traffic through this computer" ↔ "Route egress through this desktop" · "Open computer" ↔ "Agent Computer" · "I'm done" ↔ "Return control" · "Tasks" ↔ "Routines" in conversation details · "Public share link" ↔ "Create template". Treat as UI-version differences; re-check in the live app.

## Desktop-only vs phone
- Phone can: message Bots, watch/take over computer, approve actions, pause/resume routines, view run history, duplicate Bot, create Bots/groups (**+ → New Bot / New Group Chat**), pin/hide/delete, take/attach photos, iPhone share-sheet "Grok Bot" → pick chat → Attach (Android share sheet: text only), configure Auto Review, chat with already-added Team Bots (not create/publish/connect to Slack).
- Desktop only: **Teach a task**, **Test** routines and editing schedule/instruction, **computer updates/recovery/reset** (Cursor docs; xAI docs list phone Update/Reset Computer), Team Bot creation/publish, hardware security keys.
- iOS sections (Move to) need app v1.2.0+.

## Web dashboard
- `cursor.com/dashboard/bot` — download link row ("Download Grok Bot setup"), copyable share link; invite members ("Invite Team"). Direct installers: `cursor.com/download/bot` (every platform/format); Linux builds also under "More downloads" on `x.ai/bot`; release JSON feed `https://api2.cursor.sh/updates/api/download/stable/{platform}/sand`.
- Dashboard → **Manage Team Bots**, Analytics (Conversation Insights), Spending (admin).
