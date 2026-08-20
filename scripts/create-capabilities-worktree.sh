#!/usr/bin/env bash
set -euo pipefail

checkpoint_sha="${1:-}"
if [[ -z "$checkpoint_sha" ]]; then
  echo "Usage: scripts/create-capabilities-worktree.sh <reviewed-api-core-checkpoint-sha>" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to create the capabilities lane from a dirty integration checkout." >&2
  exit 1
fi
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "$checkpoint_sha")" ]]; then
  echo "Integration HEAD must equal the supplied reviewed checkpoint SHA." >&2
  exit 1
fi

branch="lane/api-capabilities"
path=".worktrees/api-capabilities"
if git show-ref --verify --quiet "refs/heads/${branch}"; then
  echo "Branch ${branch} already exists; refusing to reuse it." >&2
  exit 1
fi
if [[ -e "$path" ]]; then
  echo "Path ${path} already exists; refusing to overwrite it." >&2
  exit 1
fi

git worktree add "$path" -b "$branch" "$checkpoint_sha"
test "$(git -C "$path" rev-parse HEAD)" = "$(git rev-parse "$checkpoint_sha")"
test -z "$(git -C "$path" status --porcelain)"
printf 'Created API capabilities worktree at reviewed checkpoint %s.\n' "$checkpoint_sha"
