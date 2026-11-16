#!/usr/bin/env bash
# Files one needs-triage issue per upstream commit that touched a file we own, unless an issue of any state already
# carries its sha in the title: a night that fails after filing lists the same commits again, and a closed issue is a
# triage already done. A failed search stops the script: filing blind could duplicate.
# Usage: file-upstream-triage.sh <owned-commits-file>   (the lines upstream-merge.sh writes)
set -euo pipefail
commits=$1
[[ -s $commits ]] || exit 0
# GitHub refuses a title over 256 characters, and upstream has had a 379-character subject.
MAX_SUBJECT=200
while IFS=$'\x1f' read -r sha subject files; do
  prefix="Upstream ${sha:0:10}: "
  # A search on the sha, not a listing of the newest issues, so a long tracker cannot hide the earlier issue.
  found=$(gh issue list --repo "$GITHUB_REPOSITORY" --state all --search "${sha:0:10} in:title" --limit 20 --json title --jq '.[].title')
  if grep -qF -- "$prefix" <<<"$found"; then continue; fi
  body="Upstream commit https://github.com/swaroopg92/penpa-edit/commit/$sha touched a file we own (merge=ours), so the
nightly merge kept our side. Triage it: port it if it is engine work, drop it with a one-line reason if it is UI.

Subject: $subject

Owned files it touched:

$(tr ',' '\n' <<<"$files" | sed 's/.*/- `&`/')"
  gh issue create --repo "$GITHUB_REPOSITORY" --label needs-triage --title "$prefix${subject:0:MAX_SUBJECT}" --body "$body"
done <"$commits"
