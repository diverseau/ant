# Grok Bot vs ChatGPT Dots — Feature Matrix (the "what to copy" checklist)

Legend: ✅ has · ◐ partial/limited · ❌ no · ? unknown. Use this as the master list of copyable surface area. Per-item detail lives in `docs/grok-bot/` and `docs/dots/`.

## Agent identity & structure
| Capability | Grok Bot | Dots |
|---|---|---|
| Named persistent agent | ✅ Bot (name/label/description/avatar) | ✅ dot (name/shape/color/eyes/glasses/accessories) |
| Multiple agents per user | ✅ many Bots (+ helper Bots created by Bots) | ◐ one primary dot at launch |
| Agents share one computer | ✅ shared VM, separate screens | ❌ each dot has own computer |
| Agent-to-agent comms | ✅ group chats (2–6), bot-to-bot async messages, `@` routing | ◐ roadmap ("teams of dots") |
| Shared/team agents | ✅ Team Bots | ◐ Specialist dots (enterprise pilot), ChatGPT Space |
| Role description as durable instructions | ✅ Bot description | ✅ notes + custom rules |
| Duplicate / share template | ✅ (Duplicate; Share → Create template, Public link or Team-only) | ❌ |

## Compute
| Cloud computer w/ browser, shell, FS | ✅ (`/workspace`) | ✅ (browser emphasized; Codex cloud env for code) |
| Live view of agent screen | ✅ right panel preview | ✅ profile → Computers |
| Human takeover of browser | ✅ Take over → I'm done | ✅ browser handoff |
| Secure credential entry | ✅ secret card; passwords never seen | ✅ secure form + saved logins |
| Connect user's own computer | ✅ local exec + local egress | ✅ Allow access (1 machine; Work/Codex tasks, local skills, local browser) |
| Computer recover/update/reset UI | ✅ (Update / Recover / Reset; Disk Saver Bot) | ? (only Pause and Reset/Delete of the dot documented) |

## Interaction surfaces
| Desktop app | ✅ (Mac/Win/Linux) | ✅ (ChatGPT desktop) |
| Mobile app | ✅ iOS (also runs on iPad per xAI docs), Android | ✅ message-only; setup desktop only; no mobile web |
| Voice | ✅ in-app voice chat 1:1 | ✅ call dot in ChatGPT (in only) |
| Slack | ✅ routine triggers; Team Bots get own Slack app (posts as itself); personal Slack plugin posts as user | ✅ DM / channel mention; dot messages you; owner-only control; admin permission "Add dots to Slack" |
| Teams | ❌ | ◐ invite-only alpha (admin guide) |
| SMS | ❌ | ◐ limited beta (Pro US; learn docs say "coming soon") |
| Telegram / Discord / WhatsApp | ❌ native (community bridges only) | ❌ |
| Email-in | ❌ (plugin) | ❌ |
| Webhook-in | ✅ routine webhook (Bearer key, JSON body) | ❌ none documented (event triggers only via supported connected services / MCP Events) |
| Public API | ❌ (Admin/Org APIs only) | ❌ |

## Tools & integrations
| Connector marketplace | ✅ 219 listings; Plugins sidebar | ✅ 4,000+ apps; chatgpt.com/plugins |
| Custom MCP | ✅ (Remote HTTPS / Command servers documented for Team Bots) | ◐ via plugins (plugins can bundle MCP servers; no per-dot custom MCP UI documented) |
| Multi-account per connector | ✅ labelled accounts (not Gmail) | ? (not documented) |
| Tokens hidden from model | ✅ | ✅ |
| Fallback to website UI when no connector | ✅ headline feature | ✅ |
| Packaged skills in plugins | ✅ | ✅ |
| Coding agent hookup | ◐ shell on computer | ✅ Codex cloud/local tasks |

## Autonomy & automation
| Natural-language scheduled tasks | ✅ routines (≤50/Bot, 20 run records each) | ✅ scheduled tasks (Scheduled tab; no published numeric limits) |
| Event triggers | ✅ Slack, GitHub, Linear, Sentry, PagerDuty, email, webhook | ✅ (conversational; Slack example; event automations) |
| Teach by demonstration | ✅ Teach a task (≤10 min, desktop, gradual rollout) | ❌ |
| Saved reusable skills `/` | ✅ `/` in desktop composer | ◐ local skills / plugin skills; `@` invokes plugin/skill in ChatGPT generally; no dots-specific `/` |
| Proactive background research | ❌ documented | ✅ read-only |
| Memory | ✅ summaries/prefs (non-authoritative) | ✅ inherits ChatGPT memory + own notes |
| Test run of routine | ✅ Test (real work; desktop) | ? (docs advise confirming schedule and checking an actual run) |
| Run history | ✅ | ✅ Activity view |

## Safety & control
| Separate review model | ✅ Auto Review | ✅ Auto-review (non-disableable) |
| Approval UX | Allow once / Always allow / Deny; Auto-review rules Ask first / Allow automatically | Custom Rules: 4 modes per action (action list unpublished); default policy by action class |
| Hard-floor actions | credentials, passwords/2FA/CAPTCHA, payment/identity checks handoff | password changes and money transfers = take over; permanent deletion/software install = approval each time |
| Approval expiry for unattended runs | ✅ ~10 min (card shows Expired) | ? not documented |
| Pause agent | ✅ pause routines (no whole-Bot pause; hide/delete) | ✅ Pause (main task only) / Resume |
| Activity oversight | chat + sidebar states | Activity / Scheduled tabs |
| Admin controls | ✅ extensive; many Enterprise-only (network controls, Team Setup/Secrets, Enforce Auto-review, SCIM, audit, OTel, computer recreate) | ◐ role permissions (Use dots, Add to Slack, local computer, custom rules), cloud browser/network/computer toggles, plugin controls, Compliance/Analytics APIs, Agent 365 (specialist pilot) |

## Packaging
| Pricing | bundled in every paid individual Cursor plan/Teams seat or linked SuperGrok/X Premium+; weekly allowance + on-demand (monthly cap) | bundled in Pro ($100–$500)/Business Premium; first-month usage not counted; terms TBD |
| Model choice | hidden | hidden (GPT-6 Astra) |

## Added by cross-check (2026-10-02)
| Capability | Grok Bot | Dots |
|---|---|---|
| Keyboard shortcuts | ✅ full desktop list (`Cmd/Ctrl+K`, `+N`, `+D` dictate, …) | ◐ only generic ChatGPT-app shortcuts documented |
| Slash/@ syntax | `/` skills; `@` Bot/group/routine/connector/everyone | none for dots; `@dot` and `/` menu exist in ChatGPT Space pages |
| Team-shared agent in chat apps | ✅ Team Bot (Slack app) | ❌ (`@ChatGPT` in Slack/Teams is a separate Business/Enterprise product) |
| Bot-sent voice memos / dictation | ✅ | ✅ voice calls; dictation via ChatGPT |
| Draft cards before send | ✅ New Email / New Slack Message (Send/Discard) | ✅ approval flow; drafts per instructions |
| Disk/housekeeping Bot | ✅ Disk Saver | ? |
| Share-sheet / mobile attach | ✅ iPhone share sheet; photo/file | ✅ + attach |
| Bulk limits published | routines 50/Bot, 20 runs, 6 attachments, 25/200 MB, group 2–6, Team Bot secrets 25 | none found |
| Workspace for humans+agents | ❌ | ✅ ChatGPT Space (Pages, @dot) |
| Region limits | US-hosted computers; no residency commitment by default | Pro excludes EEA/CH/UK; no residency in Enterprise beta |
