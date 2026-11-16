#!/usr/bin/env bash
# Files one needs-triage issue per upstream commit that touched a file we own, unless an issue of any state already
# carries its sha in the title: a night that fails after filing lists the same commits again, and a closed issue is a
# triage already done. A failed list stops the script: filing blind could duplicate.
# Usage: file-upstream-triage.sh <owned-commits-file>   (the lines upstream-merge.sh writes)
set -euo pipefail
commits=$1
[[ -s $commits ]] || exit 0
titles=$(gh issue list --repo "$GITHUB_REPOSITORY" --state all --limit 1000 --json title --jq '.[].title')
while IFS=$'\t' read -r sha subject files; do
  title="Upstream ${sha:0:10}: $subject"
  if grep -qF -- "Upstream ${sha:0:10}: " <<<"$titles"; then continue; fi
  body="Upstream commit https://github.com/swaroopg92/penpa-edit/commit/$sha touched a file we own (merge=ours), so the
nightly merge kept our side. Triage it: port it if it is engine work, drop it with a one-line reason if it is UI.

Owned files it touched:

$(tr ',' '\n' <<<"$files" | sed 's/.*/- `&`/')"
  gh issue create --repo "$GITHUB_REPOSITORY" --label needs-triage --title "$title" --body "$body"
done <"$commits"
