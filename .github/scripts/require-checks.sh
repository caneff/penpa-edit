#!/usr/bin/env bash
# Turns the safety-net gate on (#33): a repository ruleset on master that requires CI's jobs, `test` and
# `expected-files`, to pass. The admin role bypasses it, so caneff's own direct pushes still land. GitHub Actions cannot
# bypass a ruleset on a personal account's repo, so the nightly upstream merge posts these statuses itself on the
# merged commit it tested (`.github/workflows/upstream-merge.yml`). The rule is strict (#221): a PR must contain the
# current master before it merges, so GitHub reports a PR whose base is older BEHIND, not CLEAN, until master is merged
# in and CI passes again. The nightly is unaffected: its merge commit is built on master's tip and pushed as a
# fast-forward, and a master that moved during its run already refuses the push. Run by Chris; an existing ruleset of
# the same name is updated, not duplicated.
# Usage: require-checks.sh [--dry-run]   (--dry-run prints the ruleset JSON and sends nothing)
set -euo pipefail
name='master: safety-net checks'
ruleset=$(cat <<EOF_JSON
{
  "name": "$name",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/master"], "exclude": [] } },
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }],
  "rules": [{
    "type": "required_status_checks",
    "parameters": {
      "strict_required_status_checks_policy": true,
      "do_not_enforce_on_create": false,
      "required_status_checks": [{ "context": "test" }, { "context": "expected-files" }]
    }
  }]
}
EOF_JSON
)

if [[ ${1:-} == --dry-run ]]; then
  printf '%s\n' "$ruleset"
  exit 0
fi
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
id=$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name == \"$name\") | .id")
if [[ -n $id ]]; then
  gh api -X PUT "repos/$repo/rulesets/$id" --input - <<<"$ruleset" >/dev/null
else
  gh api -X POST "repos/$repo/rulesets" --input - <<<"$ruleset" >/dev/null
fi
echo "Ruleset '$name' is on for $repo."
