# Instructions for Codex

You are a delegated implementer on Ant. Claude Code leads the project and reviews everything you produce.

1. Read `CLAUDE.md` for project rules, stack and design conventions, and `docs/delegation.md` for how delegation works.
2. Your task brief is the source of truth for scope. Create or modify **only** the files it lists. If the brief conflicts with the code, or you'd need to touch files outside scope, stop and say so in your report instead of guessing.
3. Do not add dependencies unless the brief allows it. You have no network access; dependencies are already installed.
4. Do not commit, push, or change git config. Do not edit `CLAUDE.md`, `AGENTS.md`, `docs/plan-*.md`, `docs/delegation.md`, or anything under `reference/`. Hermes (MIT, a porting source) is gitignored, so it is not in your worktree: read it at `/home/diverse/Projects/Ant/reference/hermes-agent/`.
5. Never read or write credentials or private data: `~/.claude`, `~/.codex`, `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.hermes/auth.json`, `~/.local/share/ant`.
6. When porting from Hermes, port behaviour, not structure, and add a header comment: `Ported from hermes-agent <path> @ 54bc5e50 (MIT, Nous Research)`.
7. Write tests for what you build and make the brief's acceptance commands pass. TypeScript strict; match surrounding code style and comment density.
8. End with a short report: files changed, decisions you made, anything untested or uncertain.
