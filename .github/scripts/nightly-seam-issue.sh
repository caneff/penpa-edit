#!/usr/bin/env bash
# Files the nightly full seam's failure (#268): the failing tests named in the parts' logs, then one issue, or a comment
# on the open one with the same title.
# Usage: nightly-seam-issue.sh <logs-dir> <run-url>
set -euo pipefail
scripts=$(dirname "$0")
body=$(mktemp)
shopt -s nullglob
logs=("$1"/*.log)
{
  echo 'The nightly full seam (`npm test` and every live file) failed on master.'
  echo
  echo '## Failing tests'
  echo
  if ((${#logs[@]})); then
    all=$(mktemp)
    cat "${logs[@]}" >"$all"
    bash "$scripts/failing-tests.sh" "$all"
  else
    echo '- No part left a log; read the run.'
  fi
  echo
  echo "Run: $2"
} >"$body"
bash "$scripts/file-issue-once.sh" 'Nightly seam failed' "$body"
