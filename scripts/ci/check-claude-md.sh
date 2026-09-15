#!/usr/bin/env bash
# check-claude-md.sh — CLAUDE.md must equal ../LDN/SPECS/00-foundations/CODE-CLAUDE.md
# byte-for-byte (HANDOFF §3.3 (ii); 08 §2.1 step 0 gate: "diff … is empty").
#
# LOCAL GATE. The source file lives in the LDN planning tree (workspace repo),
# which is not checked out in GitHub CI. Locally the diff is mandatory and a
# missing source is an error; in CI (CI=true) a missing source prints a notice
# and passes, so the CI step documents the gate without pretending to run it.
# Override the source path with CLAUDE_MD_SOURCE.
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly DEFAULT_SOURCE="${REPO_ROOT}/../LDN/SPECS/00-foundations/CODE-CLAUDE.md"
readonly SOURCE="${CLAUDE_MD_SOURCE:-$DEFAULT_SOURCE}"
readonly TARGET="${REPO_ROOT}/CLAUDE.md"

if [[ ! -f "$TARGET" ]]; then
  echo "check-claude-md: FAIL — ${TARGET} is missing (CLAUDE.md §1 read 1 cannot complete)" >&2
  exit 1
fi

if [[ ! -f "$SOURCE" ]]; then
  if [[ "${CI:-false}" == "true" ]]; then
    echo "check-claude-md: local gate — source not available in CI (${SOURCE}); run 'npm run check:claude-md' before every push"
    exit 0
  fi
  echo "check-claude-md: FAIL — source not found at ${SOURCE} (ADR-107: LDN must be a sibling checkout or symlink; set CLAUDE_MD_SOURCE to override)" >&2
  exit 1
fi

if diff -q "$SOURCE" "$TARGET" > /dev/null; then
  echo "check-claude-md: OK — CLAUDE.md equals CODE-CLAUDE.md"
  exit 0
fi

echo "check-claude-md: FAIL — CLAUDE.md differs from CODE-CLAUDE.md (copy the source verbatim; never edit CLAUDE.md in the repo)" >&2
diff "$SOURCE" "$TARGET" >&2 || true
exit 1
