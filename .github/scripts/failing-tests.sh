#!/usr/bin/env bash
# Prints a Markdown list of the failing tests in <log>, the output of `node --test` run without a TTY.
# Reads the runner's closing "failing tests:" block: a "test at <file:line:col>" line, then "✖ <title> (<duration>)".
# A todo test that fails is listed there with ⚠ and is skipped.
# Usage: failing-tests.sh <log>
set -euo pipefail
names=$(awk '
  /^✖ failing tests:$/ { block = 1; next }
  block && /^test at / { at = substr($0, 9); next }
  block && at != "" && /^✖ / { title = $0; sub(/^✖ /, "", title); sub(/ \([0-9.]+m?s\)$/, "", title); print "- `" at "` " title }
  { if (!/^test at /) at = "" }
' "$1")
if [[ -n $names ]]; then
  printf '%s\n' "$names"
else
  echo "- No failing test is named in the log; read the run."
fi
