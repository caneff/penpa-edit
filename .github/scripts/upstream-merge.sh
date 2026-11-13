#!/usr/bin/env bash
# A failed merge exits non-zero with no merge left in progress; the report says whether it conflicted.
# Usage: upstream-merge.sh <upstream-ref> <report-file>
set -euo pipefail
upstream=$1
report=$2
: >"$report"

if git merge-base --is-ancestor "$upstream" HEAD; then
  echo "merged=false" >>"$GITHUB_OUTPUT"
  exit 0
fi

# Git has no built-in `ours` driver; without this a merge=ours file both sides changed is text-merged.
git config merge.ours.driver true

# Every file an upstream commit touched, not the net diff, so a change upstream later undid is still reported.
# Attributes come from our working tree: a file is ours by our .gitattributes.
touched=$(git -c core.quotePath=false log --format= --name-only "HEAD..$upstream" | sed '/^$/d' | sort -u)
owned=
if [[ -n $touched ]]; then
  owned=$(git check-attr --stdin merge <<<"$touched" | sed -n 's/: merge: ours$//p')
fi
owned_section=
if [[ -n $owned ]]; then
  mapfile -t owned_files <<<"$owned"
  owned_section=$(cat <<EOF
## Upstream commits that touched a file we own (merge=ours)

Our side of each file was kept: port each change by hand or drop it.

$(git log --full-history --no-merges --format='- %h %s' "HEAD..$upstream" -- "${owned_files[@]}")
EOF
)
  printf '%s\n\n' "$owned_section" >>"$report"
fi

if ! git merge --no-ff --no-commit "$upstream"; then
  conflicted=$(git diff --name-only --diff-filter=U)
  if [[ -n $conflicted ]]; then
    printf '## The merge conflicted\n\n%s\n' "$(sed 's/.*/- `&`/' <<<"$conflicted")" >>"$report"
  else
    printf '## The merge failed with no conflicting file\n\nRead the run.\n' >>"$report"
  fi
  # A merge git refused before starting leaves nothing to abort.
  if git rev-parse -q --verify MERGE_HEAD >/dev/null; then git merge --abort; fi
  exit 1
fi

# The driver runs only when both sides changed a file, so a file only upstream changed or added still came in.
for file in ${owned:+"${owned_files[@]}"}; do
  if git cat-file -e "HEAD:$file" 2>/dev/null; then
    git checkout HEAD -- "$file"
  else
    git rm -q -f -- "$file"
  fi
done

message=(-m "Merge $upstream")
if [[ -n $owned_section ]]; then message+=(-m "$owned_section"); fi
git commit -q "${message[@]}"
echo "merged=true" >>"$GITHUB_OUTPUT"
