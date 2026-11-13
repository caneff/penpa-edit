#!/usr/bin/env bash
# Node's non-TTY report closes with a "failing tests:" block of "test at <file:line:col>" then "✖ <title> (<duration>)";
# a failing todo test is listed there with ⚠ instead.
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
