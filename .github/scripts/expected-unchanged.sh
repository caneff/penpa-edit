#!/usr/bin/env bash
# Fails when HEAD changes a recording's expected file against <base>, and names each file in the report. Every
# expected-file change an upstream merge brings goes to Chris (#33), so the nightly pushes no such merge.
# Usage: expected-unchanged.sh <base> <report-file>
set -euo pipefail
base=$1
report=$2

changed=$(git -c core.quotePath=false diff --name-only "$base" HEAD -- ':(glob)live/recordings/**/*.expected.json')
if [[ -n $changed ]]; then
  printf '## The merge changes expected files\n\nChris rules whether each is a fix or a regression.\n\n%s\n\n' \
    "$(sed 's/.*/- `&`/' <<<"$changed")" >>"$report"
  exit 1
fi
