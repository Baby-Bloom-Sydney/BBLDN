#!/usr/bin/env bash
# promote-guard.sh — refuse a production promote that would REVERT prod.
#
# The 2026-06-01 incident: a deployment whose commit was NOT a descendant of the
# then-live prod commit was promoted, silently reverting 252 files. This guard
# makes that impossible: a promote is allowed ONLY if the candidate commit is a
# fast-forward (descendant) of the currently-live production commit.
#
# Usage:  promote-guard.sh <current-prod-sha> <candidate-sha> [repo-dir]
# Exit 0 = safe (fast-forward); non-zero = BLOCKED (would revert prod).
set -euo pipefail
CUR="${1:?usage: promote-guard.sh <current-prod-sha> <candidate-sha> [repo-dir]}"
CAND="${2:?usage: promote-guard.sh <current-prod-sha> <candidate-sha> [repo-dir]}"
REPO="${3:-.}"

if git -C "$REPO" merge-base --is-ancestor "$CUR" "$CAND" 2>/dev/null; then
  echo "OK: candidate $CAND is a descendant of current prod $CUR — safe fast-forward promote."
  exit 0
else
  echo "BLOCKED: candidate $CAND is NOT a descendant of current prod $CUR." >&2
  echo "        This promote would REVERT production (non-fast-forward). Refusing." >&2
  echo "        If this is intentional, reconcile via a merge that includes prod first." >&2
  exit 1
fi
