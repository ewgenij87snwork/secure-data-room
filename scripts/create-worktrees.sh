#!/usr/bin/env bash
set -euo pipefail

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to create worktrees from a dirty integration checkout." >&2
  exit 1
fi

foundation_sha="$(git rev-parse HEAD)"
mkdir -p .worktrees

for lane in api-core web qa-docs; do
  branch="lane/${lane}"
  path=".worktrees/${lane}"
  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    echo "Branch ${branch} already exists; refusing to guess whether it is safe." >&2
    exit 1
  fi
  if [[ -e "$path" ]]; then
    echo "Path ${path} already exists; refusing to overwrite it." >&2
    exit 1
  fi
  git worktree add "$path" -b "$branch" "$foundation_sha"
done

for lane in api-core web qa-docs; do
  test "$(git -C ".worktrees/${lane}" rev-parse HEAD)" = "$foundation_sha"
  test -z "$(git -C ".worktrees/${lane}" status --porcelain)"
done

printf 'Created clean Wave A worktrees at foundation %s.\n' "$foundation_sha"
