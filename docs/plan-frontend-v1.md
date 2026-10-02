# Ant — Frontend v1 Plan

Status: decisions locked 2026-10-02. **Build started 2026-10-03** in `web/` (v0.1.0: M0 to M3 plus the creator, palette and connectors on mock data). Scope: the first clickable iteration of the Ant UI, running on mock data. No backend, no real model calls.

## 0. Decisions (locked)

| Topic | Decision |
|---|---|
| Terms | **Ant** (agent), **Colony** (group chat). Skill, Routine, Connector stay generic |
| Fonts | Claude/Anthropic brand fonts: **Poppins** (headings, UI labels) + **Lora** (body, message text), self-hosted |
| Design guidance | `brand-guidelines` skill (installed) for colour and type, applied during every UI build step |
| Theme | **Dark only** (no light tokens in v1) |
| Art | Characters via ChatGPT/Codex image generation, or hand-built SVG; decide per asset. Placeholder SVGs until then |
| Versioning | **Semantic versioning**, starting at `0.1.0` (see §13) |
| Stack | **Svelte 5 + Vite + TypeScript + plain CSS** (see §8) |
| Priority | **Looks beat bytes.** If a few extra MB makes it look better, spend them. Stay fast, but never trade visual quality for size |

## 1. Product in one paragraph

Ant is the Claude-flavoured answer to Grok Bot and ChatGPT Dots: persistent named agents ("ants"), each with a character, a job, a chat history, skills, routines and a cloud computer you can watch and take over, gated by approvals. The UI is a **Grok Bot skeleton wearing Claude's skin**: Grok Bot's sidebar-of-agents + per-agent chat + right-hand computer panel, drawn with Claude's warm dark palette, serif accents, spacing and softness. The ants are the characters, like the dots in Dots and the blob icons in Grok Bot.

## 2. What we take from where

| From | Take |
|---|---|
| **Grok Bot** | Layout and mechanics: sidebar is a list of *agents* (not a list of chats); one continuous conversation per agent; avatar + name + time + 1-line preview rows; unread / working / needs-attention markers; stacked-avatar group chats (`+2`); sender label above each message in group chats; inline `@mention` chips with avatar; "Computer" card with `Working` pill and live screenshot; check-list result bubbles; centred system lines ("Renamed to Sales Outbound"); pill composer with `+` left and mic right; computer-preview toggle top-right; `/` skills and `@` mentions in the composer; Cmd+K palette; approval cards (Allow once / Always allow / Deny); Take over → I'm done |
| **Claude.ai** | Palette (warm near-black, off-white text, orange accent), serif display type (the "Up late, Leon?" greeting), sidebar width (~286px) and row height (~33px), 1px low-contrast borders, 8–12px radii on controls and ~16–20px on the composer, muted secondary text, small icon-led nav (New / Projects / Artifacts / Scheduled / Customize), bottom-left account row, message-action icons under replies (copy, speak, thumbs, retry), model chip bottom-right of the composer, understated hover/active states (a slightly lighter fill, never a colour change) |
| **Dots** | Customisable character (shape, colour, eyes, accessories), profile page with Activity / Scheduled / Computers / Add / Call / Pause / Reset, Custom Rules with four behaviours, and the "Dots" idea that the character *is* the product identity |

Not copied: Claude's chat-list sidebar (replaced by the agent list), Grok Bot's red-to-black palette and macOS-only window chrome.

## 3. Information architecture

```
App shell
├─ Sidebar
│  ├─ Top: collapse toggle, wordmark "ant", + New
│  ├─ Search (Cmd+K opens palette)
│  ├─ Ant list  (pinned, then sections; group chats = "Colonies")
│  ├─ Hidden ants (footer link)
│  └─ Bottom: Marketplace/Connectors, account row (avatar, name, plan, settings)
├─ Main: conversation with the selected ant (or colony)
│  ├─ Header: avatar, name, label chip, status, computer-panel toggle, details menu
│  ├─ Message stream
│  └─ Composer
├─ Right panel (toggleable): Computer | Details
│  ├─ Computer: live preview, status, Open computer / Take over / I'm done, Teach a task
│  └─ Details: Settings, Skills, Routines, Memory, Secrets, Rules, Activity
└─ Overlays: Cmd+K palette, New-ant dialog, Marketplace, Settings
```

Terminology (locked): Bot → **Ant**, group chat → **Colony**, skill → **Skill**, routine → **Routine**, plugin → **Connector**. Keep generic words where they're clearer than cute ones.

## 4. Screens for v1 (in build order)

1. **Shell + sidebar** with mock ants (see §7). Row = avatar, name, optional label chip, timestamp, 1-line preview, unread dot, working spinner, needs-attention marker. Sections, pin, hide, right-click menu (Rename, Move to, Hide, Duplicate, Delete).
2. **Conversation** with the full message vocabulary (§6): text bubbles, sender labels, mention chips, system lines, tool/Computer card, result checklist, approval card, draft-email card, voice-memo bubble, secret-request card.
3. **Composer**: auto-growing textarea, `+` attach menu, `/` skills popover, `@` mentions popover, mic (dictate) and waveform (voice chat, only when empty), Enter send / Shift+Enter newline, "Stop now" button while an ant is working, attachment chips.
4. **Computer panel**: browser-frame preview with a fake screenshot, `Working` pill, URL bar, Take over mode (border + banner + "I'm done"), "Action needed" sign-in card, Teach a task button.
5. **New-ant flow**: name, label, description (the durable instructions), then the **ant creator**: pick colour, body shape, eyes, accessory (wrench, leaf, satchel, glasses, hat), live preview. This is the Dots-style hook, so it gets real attention.
6. **Ant details / settings**: Settings (name, label, description, notifications), Skills, Routines (list with pause/test/edit, run history), Memory (read-only notes), Secrets (write-only), Rules.
7. **Cmd+K palette** and **Marketplace** (grid of connector cards, Installed tab, Connect card inside chat).
8. **Global settings**: Appearance (Dark / Light / System), Auto-review rules (Ask first / Allow automatically), Usage, Computer, Shortcuts.
9. **Empty/first-run**: Claude-style greeting with the serif headline and a rotating ant mascot, plus the "Meet a future teammate" picker (Chief of staff, Sales outbound, Inbox manager, Talent scout, Expense manager, etc., taken from the Grok Bot use-case list).

## 5. Design system

### 5.1 Colour tokens
Source of truth for neutrals and accent: the installed `brand-guidelines` skill (`.agents/skills/brand-guidelines`). **Dark only.** No light tokens, no theme switch, no `prefers-color-scheme` branching; set `color-scheme: dark`.

| Token | Value | Use |
|---|---|---|
| `--bg-app` | `#141413`-adjacent warm dark, final value sampled from the Claude reference (it reads ~`#1f1e1d` in the main pane) | main pane |
| `--bg-sidebar` | one step darker/lighter than main, sampled from reference | sidebar |
| `--bg-raised` | one more step up | composer, cards, bubbles |
| `--border` | white at ~8% | 1px dividers |
| `--text` | `#faf9f5` | primary |
| `--text-muted` | `#b0aea5` | secondary, timestamps, previews |
| `--accent` | `#d97757` | primary accent, focus rings, send button, links |
| `--ok` / `--warn` / `--danger` | brand green `#788c5d`, amber (Working pill), a muted red | status |

Ant character colours (eyeballed from the design inspo, **sample exactly from the image before committing**): purple ~`#8b76e0`, yellow ~`#f9c73f`, green ~`#46c395`, coral ~`#ff7757`, blue ~`#17a5ff`. The coral is close enough to `#d97757` that the default ant can be coral and double as the brand mark. Eyes are always off-white with near-black pupils.

### 5.2 Type
- **Poppins** for headings, nav, buttons, chips and other UI labels. **Lora** for message text, descriptions, long-form and the greeting. Fallbacks Arial / Georgia, per the brand skill.
- Self-host as `woff2`: full Poppins weights and Lora variable (roman + italic), Latin plus Latin-Extended. Preload the two above-the-fold files, `font-display: swap`, size-adjusted fallback faces to avoid layout shift.
- Wordmark: the heavy serif "ant" from the inspo image, shipped as an SVG path, not a font.
- Note: claude.ai itself uses proprietary faces; Poppins/Lora is the closest sanctioned pairing and what the brand skill specifies.

### 5.3 Spacing and shape
- 4px base grid. Sidebar 286px (collapsed 56px). Sidebar row ~56px for ant rows (Grok Bot density) vs Claude's 33px for nav rows. Composer max-width ~640px centred in the stream; message column ~680px.
- Radii: controls 8px, cards 12px, bubbles 16px, composer 20px, avatars fully rounded or squircle (decide in the character spec).
- Motion: 120–180ms ease-out, no bounces on chrome; ants themselves may bob, blink and walk.

### 5.4 The ant character system
- One SVG component `<Ant color shape eyes accessory pose size />`. Layers: body, head, antennae, eyes, optional prop. Keep the shape language of the inspo: rounded blobs, big off-white eyes, stubby limbs, flat colour, no outlines.
- Sizes: 24px (inline mention chip, head only), 40px (sidebar, head only), 96px (profile/creator, full body), 200px+ (empty states, full body).
- Poses for the sidebar and chat headers are heads only. Full bodies appear in creator, empty states, loading and the working state (walking loop).
- States: idle (blink), working (carrying its prop, walks), needs attention (waves), offline (desaturated), asleep/paused (eyes closed).
- Group avatars: overlapping heads with `+N`, as in Grok Bot's "Corporation".
- Art pipeline: generate reference sheets with ChatGPT/Codex image generation, then **trace/clean into SVG** (SVGO-optimised, flat colour, shared path data) for crisp scaling. Raster (AVIF/WebP, 2x/3x) is fine wherever it looks better than a vector, and animated ants move to Rive. Until art lands, simple geometric SVG placeholders behind the same `<Ant />` interface.

## 6. Message vocabulary

Every one of these needs a component and a mock fixture:

| Type | Notes |
|---|---|
| Text bubble | left-aligned agent bubble, user bubble right or full-width (match Claude: user is a subtle raised block) |
| Sender label | above bubble, only in colonies or on a sender change |
| Mention chip | avatar + name pill inline |
| System line | centred, muted ("Renamed to Sales Outbound") |
| Computer card | title, status pill (Working / Needs you / Done), screenshot, Open computer |
| Result checklist | ✓ lines with bold service name, "→ result · detail" |
| Approval card | action description, Allow once / Always allow / Deny, expiry countdown for unattended runs, Expired state |
| Draft card | New Email / New Slack Message, editable, Send / Discard |
| Secret card | masked input, "Save securely" |
| Voice memo | play button, waveform, duration |
| Sign-in handoff | "Action needed", Take over, Skip |
| Routine-run line | "Ran Weekday digest · Succeeded · 2:04 PM" |
| Message actions | copy, speak, thumbs up/down, retry (Claude's icon row), reply-in-thread, react, copy request ID |
| Streaming | token-by-token text with a blinking caret and a Stop button |

## 7. Mock data

Ship a single typed fixture module, no network. Seed ants, one per character colour so the five inspo ants appear on first load:

| Ant | Colour | Prop | Label | Purpose in the demo |
|---|---|---|---|---|
| Chief | coral | satchel | Main ant | chief of staff, owns a colony |
| Inbox | blue | satchel | Gmail | drafts and approvals demo |
| Scout | green | leaf | Talent | research + checklist result |
| Fixer | purple | wrench | Engineering | computer-card demo, bug repro |
| Sunny | yellow | leaf | Sales Outbound | routine + schedule demo |
| Offsite crew | stacked | n/a | Colony | group chat, sender labels, @mentions |

Plus a handful of marketplace connectors, three skills, two routines with run history, and canned "scripted conversations" so every card type is reachable by clicking around.

## 8. Tech: small, fast, beautiful

**Choice: Svelte 5 + Vite + TypeScript, hand-written CSS with custom properties.**

Why: Svelte stays the pick even with the size limit lifted, because it's fast at runtime (fine-grained updates, no virtual DOM) and has motion built in. Its tiny runtime (a few KB vs ~45KB gzip for React + ReactDOM) is now a bonus, not the reason. It ships transitions, springs, FLIP list animations and `bind:`/reactivity (runes) built in, which is exactly what a chat UI full of moving parts needs (streaming text, sidebar reordering, panel slides, ant animations) without Framer Motion or similar. Fine-grained updates keep long streaming conversations smooth. Solid and Preact were the close alternatives; Svelte wins on built-in motion and authoring speed for a design-heavy app.

| Concern | Decision |
|---|---|
| Framework | Svelte 5 (runes), plain SPA, no SvelteKit/SSR in v1 |
| Build | Vite + `vite-plugin-svelte`; Lightning CSS for minification; Brotli + gzip precompression |
| Language | TypeScript strict |
| Styling | Hand-written CSS with design tokens as custom properties, component-scoped styles, no UI kit. No Tailwind (keeps CSS tiny and the tokens explicit) |
| Primitives | Native platform first: `<dialog>` for modals, Popover API + CSS anchor positioning for menus/popovers, `<details>`, `inert`. A small headless lib (e.g. bits-ui) only where native falls short (listbox/combobox for `/` and `@`) |
| Command palette | ~150 lines custom, no dependency |
| Icons | `@lucide/svelte`, imported per icon (`@lucide/svelte/icons/<name>`) so only used icons ship |
| Animation | Svelte transitions + CSS keyframes + Web Animations API for UI; **Rive** (or Lottie) for ant characters; optional Motion library; respect `prefers-reduced-motion` |
| State | Svelte runes stores; `localStorage` for UI prefs only |
| Virtualisation | Hand-rolled windowing for long message lists and big ant lists, added when needed |
| Fonts | Self-hosted woff2, full families (see §5.2) |
| Images | SVG first; AVIF/WebP for anything raster; lazy-load below the fold |
| Tests | Vitest for logic, Playwright for smoke + screenshots + a11y (axe) |
| Lint/format | Biome (one fast tool) or ESLint + Prettier; pick Biome unless Svelte support gaps appear |
| Package manager | npm (pnpm isn't installed on the dev machine; switch later if wanted) |
| Desktop later | Tauri wrapper (tiny binary, system webview); nothing in the app depends on a server |

**Performance budgets (revised: looks beat bytes).** Size is no longer a gate; smoothness is.
- First-load transfer target ≤ ~5 MB, and anything that makes it prettier may use that headroom: richer ant art and animation, extra font weights, high-res AVIF/WebP, subtle textures/grain, blur and glass effects, WebGL/canvas flourishes, a motion library if it earns its keep.
- Keep the *app shell interactive fast*: lazy-load heavy assets (large art, Rive/Lottie files, Marketplace, creator) so first paint isn't blocked, and preload only the fonts and hero ant.
- Hard gates that stay: 60 fps scrolling, streaming and animation on a mid-range laptop; INP < 100 ms; CLS ≈ 0; no main-thread jank from effects (prefer GPU-composited transforms/opacity); `prefers-reduced-motion` respected.
- Soft target: Lighthouse Performance ≥ 90 (was 98). A bundle report runs on every build for visibility, not as a fail condition. Still justify big dependencies in the PR, but "it looks better" is a valid justification.

**Where the extra budget goes first (in priority order):**
1. **Ant animation quality:** Rive (or Lottie) state machines for idle/blink/walk/wave/sleep, instead of hand-rolled CSS only. SVG remains the static fallback.
2. **Art fidelity:** full-detail ant sheets and empty-state illustrations, 2x/3x AVIF where raster.
3. **Type:** full Poppins and Lora families (more weights, italics), not a minimal subset.
4. **Surface richness:** soft shadows, layered depth, subtle noise/grain, backdrop blur on overlays, smooth springs on everything.
5. **Motion library:** add Motion (or similar) alongside Svelte's built-ins if it gives choreography Svelte can't.

**"Looks REALLY nice" is a budgeted deliverable, not leftover time:** a polish pass at every milestone covering motion timing, hover/press/focus states, empty and loading states, optical alignment, text rendering (`text-wrap: balance/pretty`, tabular numerals for times), scrollbars, selection colour, and a deliberate ant idle animation set.

Folder sketch: `src/app/` shell, `src/features/{sidebar,chat,composer,computer,ants,marketplace,settings,palette}/`, `src/lib/ui/`, `src/lib/ant/`, `src/mock/`, `src/styles/{tokens,base}.css`, `public/fonts/`.
Keep a clean seam for later: a `data/` layer with a provider interface that the mock implements, so a real backend or the Claude API can replace it without touching components.

## 9. Interaction and keyboard (from Grok Bot's list)

`Cmd/Ctrl+K` palette · `Cmd/Ctrl+N` new ant · `Cmd/Ctrl+B` collapse sidebar · `Cmd/Ctrl+I` or `L` focus composer · `Cmd/Ctrl+1..9` jump to ant · `Alt+↑/↓` prev/next ant · `Cmd/Ctrl+[ / ]` history · `Cmd/Ctrl+Shift+M` marketplace · `Cmd/Ctrl+,` settings · `Cmd/Ctrl+D` dictate · `Enter` send, `Shift+Enter` newline · `Esc` closes overlays or denies an approval. Right-click menus on ants and messages.

## 10. Milestones

| # | Deliverable | Done when |
|---|---|---|
| M0 | Scaffold, tokens, fonts, brand tokens as CSS variables, perf-budget CI check, `CLAUDE.md` updated with commands and design rules (`0.1.0`) | `pnpm dev` shows an empty themed shell; lint, typecheck, test commands work |
| M1 | Sidebar + ant avatar component + mock ant list | all five ants render at 24/40/96px with states |
| M2 | Conversation stream + composer with every message type | scripted demo conversation scrolls and streams |
| M3 | Computer panel + Take over flow + approval cards | Allow/Deny/Expired and Take over → I'm done all work on mocks |
| M4 | New-ant creator + ant details (skills, routines, rules) | can create an ant, see it in the sidebar, edit its identity |
| M5 | Palette, marketplace, settings, empty state | every shortcut in §9 works; first-run feels finished |
| M6 | Polish: motion, responsive, a11y (focus order, contrast, reduced motion), Playwright screenshots | screenshot diff suite and an a11y check pass |

Versions: M0 = `0.1.0`, M1 = `0.2.0`, and so on (see §13). M0–M2 is the smallest slice that already looks like the product; the first review should happen there.

## 11. Explicitly out of scope for v1

Auth, real LLM calls, real computer/browser streaming, real connectors/OAuth, billing and usage metering, team/admin features, native mobile, email/Slack/voice channels, persistence beyond `localStorage`. Each has a stub UI only where it appears in the references.

## 12. Remaining open questions

1. **Design skill**: I'm taking "the Claude design style skill" to mean the installed `brand-guidelines` skill. If you meant Anthropic's `frontend-design` skill (UI craft guidance), say so and I'll install it too; they complement each other.
2. **Reference screenshots**: please save the four references (and the ant inspo image) into `docs/refs/` so colours and spacing are measured, not eyeballed. Without them I'll have to approximate.
3. **Ant creator in v1**, or after the core chat UI (M4 in the plan, easy to defer)?
4. **Fonts are Poppins + Lora** per the brand skill. claude.ai's own UI faces are proprietary, so this is the closest sanctioned match. OK?

## 13. Versioning and repo hygiene

- **Semantic Versioning 2.0.0**: `MAJOR.MINOR.PATCH`. Start at **`0.1.0`** (pre-1.0, anything may change); `1.0.0` when the public surface is stable. Pre-release tags like `0.2.0-beta.1` are allowed.
- Source of truth: `version` in `package.json`; git tag `vX.Y.Z` per release; the app shows its version in Settings → About.
- **Conventional Commits** (`feat:`, `fix:`, `perf:`, `docs:`, `refactor:`, `chore:`, `feat!:` for breaking). They map to minor, patch, and major bumps.
- `CHANGELOG.md` generated from commits (release-please or changesets; pick release-please for zero-config).
- Milestones map to versions: M0 `0.1.0`, M1 `0.2.0`, M2 `0.3.0`, and so on, with patch releases for fixes between them.
- Branching: `main` always releasable; short-lived feature branches; squash-merge with a conventional title.
