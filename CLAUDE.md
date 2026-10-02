# Ant

Ant is a Claude-flavoured take on Grok Bot and ChatGPT Dots: persistent, named agents ("ants") with a character, a job, chat, skills, routines and a cloud computer you can watch and take over. Group chats of ants are **colonies**.

- Research on the reference products: `docs/README.md`
- Frontend plan and locked decisions: `docs/plan-frontend-v1.md`
- Visual references (sample colours from these, don't guess): `docs/refs/`

## Status

Frontend v1 (`web/`) runs on mock data only. There is no backend and no real model calls; `web/src/lib/mock/engine.ts` scripts the replies.

## Commands

All run from `web/`:

- Install: `npm install`
- Dev: `npm run dev`
- Type check: `npm run check`
- Build: `npm run build`
- Preview build: `npm run preview`

## Structure (`web/src`)

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

- Semantic versioning (`web/package.json` is the source of truth, currently `0.1.0`) and Conventional Commits (`feat:`, `fix:`, `perf:`…).
- Match the style of surrounding code. TypeScript strict, Svelte 5 runes only (no legacy `$:` or stores).
- Never commit secrets. Use `.env` (gitignored) and keep `.env.example` current.
