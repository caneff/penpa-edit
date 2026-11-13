#!/usr/bin/env bash
# Files a bug, needs-info issue, or comments on the open one with exactly that title.
# A failed list stops the script: filing blind could duplicate.
# Usage: file-issue-once.sh <title> <body-file>
set -euo pipefail
title=$1
body=$(cat "$2")
open=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --limit 200 --json number,title --jq '.[] | "\(.number)\t\(.title)"')
number=$(awk -F '\t' -v title="$title" '$2 == title { print $1; exit }' <<<"$open")
if [[ -n $number ]]; then
  gh issue comment "$number" --repo "$GITHUB_REPOSITORY" --body "$body"
else
  gh issue create --repo "$GITHUB_REPOSITORY" --label bug,needs-info --title "$title" --body "$body"
fi
