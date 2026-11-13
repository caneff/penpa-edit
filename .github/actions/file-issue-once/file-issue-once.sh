#!/usr/bin/env bash
# Ported from caneff/sudokupad-scripts `.github/actions/file-issue-once`, commenting where that one stays silent.
# A failed list stops the script: filing blind could duplicate.
set -euo pipefail
open=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --limit 200 --json number,title --jq '.[] | "\(.number)\t\(.title)"')
number=$(printf '%s\n' "$open" | awk -F '\t' -v title="$TITLE" '$2 == title { print $1; exit }')
if [[ -n $number ]]; then
  gh issue comment "$number" --repo "$GITHUB_REPOSITORY" --body "$BODY"
else
  gh issue create --repo "$GITHUB_REPOSITORY" --label bug,needs-info --title "$TITLE" --body "$BODY"
fi
