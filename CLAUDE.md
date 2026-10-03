# Ant

Ant is a Claude-flavoured take on Grok Bot and ChatGPT Dots: persistent, named agents ("ants") with a character, a job, chat, skills, routines and a cloud computer you can watch and take over. Group chats of ants are **colonies**.

- Research on the reference products: `docs/README.md`
- Frontend plan and locked decisions: `docs/plan-frontend-v1.md`
- Backend plan (Claude Code CLI runtime, ant folders, safety, colonies, computer): `docs/plan-backend-v1.md`
- Hermes Agent reference clone (MIT, read-only, gitignored, never run it): `reference/hermes-agent`
- Delegation to Codex (gpt-6.1-sol, high) for bulk work, and what stays with Claude: `docs/delegation.md`. Run tasks with `scripts/codex-task.sh`.
- Visual references (sample colours from these, don't guess): `docs/refs/`

## Status

`web/` (Svelte UI) talks to `server/` (antd), which runs each ant as a real `claude -p` session in `~/Ants/<ant>/`. Without antd running the UI falls back to a scripted demo. Release 0.10.0 (see `CHANGELOG.md`) adds phone access (device pairing, Tailscale, push), event routines (GitHub, Slack, page watches), the rule editor, secure secret cards, skills/memory UI, Activity, templates and dictation on top of the v1 plan. Open items are tracked in `docs/audit-vs-reference.md` (full-desktop computer use needs TigerVNC; channels need live bot tokens).

## Commands

From the repo root (npm workspaces):

- Install: `npm install`
- antd: `npm run dev:server` (port 7420; ants in `~/Ants`, state in `~/.local/share/ant`)
- Web: `npm run dev:web` (Vite proxies `/api` and `/ws` to antd)
- Pair a phone or another computer (prints a one-time code): `npm run pair`
- Type check everything: `npm run check`
- Tests (no model calls; fake `claude`): `npm test`
- Real end-to-end (spends a little usage, Haiku): `server/e2e/run.sh [chat|browser|all]`
- Build web: `npm run build`

## Structure

`server/src`: `service.ts` (ants, turns, events), `broker.ts` (approvals), `tools.ts` (ant MCP tool handlers), `runner/` (claude process + stream parser), `provision/` (ant folders, generated CLAUDE.md/settings), `rules/` (permission engine, floors), `computer/` (Chromium + screencast + lease), `db/` (node:sqlite repos), `api/http.ts`. `packages/ant-mcp`: the MCP server and PreToolUse hook each ant loads. `packages/shared`: types shared by server and web.

### `web/src`

- `styles/tokens.css`: every colour, radius, duration and easing. Change values here, not in components.
- `lib/store.svelte.ts`: app state (Svelte 5 runes) and all actions. Components call these; they don't mutate deeply on their own.
- `lib/mock/`: seed data and the scripted reply engine. Replace with a real provider later without touching components.
- `lib/ant/Ant.svelte`: the ant character (SVG). Head or full body, statuses `idle | working | attention | paused`, accessories, pointer-following eyes.
- `lib/motion.ts`: shared Svelte transitions (`rise`, `pop`, `modal`, `collapse`) that respect reduced motion.
- `lib/ui/`: generic primitives (Menu, Modal, Switch).
- `features/*`: sidebar, chat (messages and cards), composer, computer panel, details, palette, creator, connectors.

## Design rules

- Dark only. Colours come from the `brand-guidelines` skill plus values sampled from `docs/refs/`; load that skill before UI work.
- Fonts: Poppins for UI, labels and headings; Lora for message text, descriptions and display text.
- Layout and mechanics follow Grok Bot (agent list sidebar, per-ant chat, computer panel, approvals). Colours, spacing and softness follow claude.ai.
- Looks beat bytes, but motion must stay at 60 fps. Animate `transform` and `opacity` only, and respect `prefers-reduced-motion`.
- Nearly everything should animate: entrances, state changes, selection, hover and press. Use the shared tokens (`--ease-out`, `--ease-spring`, `--dur*`) and `lib/motion.ts` rather than one-off curves.
- Ant art is placeholder SVG until generated art lands. Keep the `<Ant />` props stable so the art can be swapped underneath.

## Conventions

- Semantic versioning (all workspace `package.json` files share one version, currently `0.10.0`) and Conventional Commits (`feat:`, `fix:`, `perf:`…).
- Match the style of surrounding code. TypeScript strict, Svelte 5 runes only (no legacy `$:` or stores).
- Never commit secrets. Use `.env` (gitignored) and keep `.env.example` current.
