#!/usr/bin/env bash
# Merges <upstream-ref> into the checked-out branch with a merge commit, writing a Markdown report to <report-file>:
# the upstream commits that touched a file we own (merge=ours), and on a conflict the conflicting files.
# Writes merged=true|false to $GITHUB_OUTPUT; exits non-zero on a conflict, with no merge left in progress.
# Usage: upstream-merge.sh <upstream-ref> <report-file>
set -euo pipefail
upstream=$1
report=$2
output=${GITHUB_OUTPUT:-/dev/null}
: >"$report"

if git merge-base --is-ancestor "$upstream" HEAD; then
  echo "merged=false" >>"$output"
  exit 0
fi

# Git has no built-in `ours` driver; without this a merge=ours file is text-merged and takes upstream's change.
git config merge.ours.driver true

# Attributes are read from our working tree, so a file is ours by our .gitattributes, not upstream's.
base=$(git merge-base HEAD "$upstream")
mapfile -t owned < <(git diff --name-only "$base" "$upstream" | git check-attr --stdin merge | sed -n 's/: merge: ours$//p')
owned_commits=
if ((${#owned[@]})); then
  owned_commits=$(git log --format='- %h %s' "HEAD..$upstream" -- "${owned[@]}")
fi
if [[ -n $owned_commits ]]; then
  owned_section=$(printf '%s\n\n%s\n\n%s' \
    "## Upstream commits that touched a file we own (merge=ours)" \
    "Port each by hand or drop it." \
    "$owned_commits")
  printf '%s\n\n' "$owned_section" >>"$report"
fi

message=(-m "Merge $upstream")
[[ -n $owned_commits ]] && message+=(-m "$owned_section")
if ! git merge --no-ff "${message[@]}" "$upstream"; then
  {
    echo "## The merge conflicted"
    echo
    git diff --name-only --diff-filter=U | sed 's/.*/- `&`/'
  } >>"$report"
  git merge --abort
  exit 1
fi
echo "merged=true" >>"$output"
