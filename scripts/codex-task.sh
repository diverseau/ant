#!/usr/bin/env bash
# Run a delegated task with Codex (gpt-6.1-sol, high) in an isolated git worktree.
# Usage: scripts/codex-task.sh <slug> <brief.md>
# Output: branch codex/<slug>, worktree .worktrees/codex-<slug>,
#         logs in .worktrees/logs/<slug>.{jsonl,last.md}
set -euo pipefail

slug=${1:?usage: codex-task.sh <slug> <brief.md>}
brief=$(realpath "${2:?usage: codex-task.sh <slug> <brief.md>}")
root=$(git rev-parse --show-toplevel)
wt="$root/.worktrees/codex-$slug"
logs="$root/.worktrees/logs"

[[ -e "$wt" ]] && { echo "worktree exists: $wt" >&2; exit 1; }
# The worktree starts from HEAD, so uncommitted work (plans, patterns to copy) is invisible to Codex.
if [[ -n "$(git -C "$root" status --porcelain --untracked-files=no)" ]]; then
  echo "warning: uncommitted changes in $root are not in Codex's worktree" >&2
fi
mkdir -p "$logs"
git -C "$root" worktree add -q -b "codex/$slug" "$wt" HEAD

# Install deps from the lockfiles before Codex starts: its sandbox has no network.
for lock in $(cd "$wt" && git ls-files '*package-lock.json' ':!:reference/**'); do
  (cd "$wt/$(dirname "$lock")" && npm ci --prefer-offline --no-audit --no-fund --silent)
done

cp "$brief" "$logs/$slug.brief.md"
codex exec \
  -m gpt-6.1-sol \
  -c model_reasoning_effort='"high"' \
  -s workspace-write \
  -C "$wt" \
  --json \
  -o "$logs/$slug.last.md" \
  - < "$brief" > "$logs/$slug.jsonl"

echo "done: $slug"
echo "  diff:   git -C '$wt' diff --stat"
echo "  report: $logs/$slug.last.md"
