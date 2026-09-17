# shellcheck shell=bash
# boot-outcome.sh — the one "start the built app and judge what happened" harness, shared by `boot-guard.sh` and
# `prod-guard-boot.sh` (E1 code-reviewer HIGH 2: the loop was hand-maintained in both, which is exactly why the
# loopback-binding fix landed in one of them and the cleanup trap in the other).
#
# Four outcomes, and the distinction is the whole point of both guards:
#   exited-nonzero  the process refused to boot          (what a guard must produce)
#   exited-zero     the process ended cleanly            (a guard must never do this)
#   listening       the server came up and answered      (what a healthy environment must produce)
#   indeterminate   neither, inside the grace period     (the log is dumped to stderr)
#
# **`boot_outcome` writes `BOOT_OUTCOME`; it does not echo.** A `$(…)` capture would run the function in a
# subshell, and the caller's cleanup trap could then never see the pid of the server it started — which is how a
# cancelled CI job or a local Ctrl-C leaks a `next start` holding a port (code-reviewer HIGH 1).

BOOT_GRACE_SECONDS="${BOOT_GRACE_SECONDS:-25}"
BOOT_POLL_SECONDS="${BOOT_POLL_SECONDS:-1}"
BOOT_PROBE_PATH="${BOOT_PROBE_PATH:-/api/health}"

# Set by `boot_outcome`; read by `boot_cleanup`. Never `readonly` — each case reuses them.
BOOT_SERVER_PID=""
BOOT_SERVER_LOG=""
BOOT_OUTCOME=""
# The server's stdout+stderr for the case that just ran, kept after the log file is removed so a caller can
# assert on what the boot *said* and not only on whether it came up (ADR-141: the production report must name no
# stub provider). Rebuilt on every `boot_outcome`, so one case can never be read as another's.
BOOT_SERVER_OUTPUT=""

# Install as `trap boot_cleanup EXIT INT TERM` in every script that calls `boot_outcome`.
boot_cleanup() {
  if [[ -n "$BOOT_SERVER_PID" ]]; then
    kill "$BOOT_SERVER_PID" 2> /dev/null || true
    BOOT_SERVER_PID=""
  fi
  if [[ -n "$BOOT_SERVER_LOG" ]]; then
    rm -f "$BOOT_SERVER_LOG"
    BOOT_SERVER_LOG=""
  fi
}

_boot_finish() {
  BOOT_OUTCOME="$1"
  if [[ -n "$BOOT_SERVER_LOG" && -f "$BOOT_SERVER_LOG" ]]; then
    BOOT_SERVER_OUTPUT="$(cat "$BOOT_SERVER_LOG")"
  fi
  boot_cleanup
}

# boot_outcome <port> — starts `next start` in whatever environment the caller has exported, on loopback only
# (a test server is never for anyone but this machine), and sets BOOT_OUTCOME.
boot_outcome() {
  local port="$1" elapsed=0
  BOOT_SERVER_OUTPUT=""
  BOOT_SERVER_LOG="$(mktemp "${TMPDIR:-/tmp}/boot-outcome.XXXXXX")"
  npx next start --hostname 127.0.0.1 --port "$port" > "$BOOT_SERVER_LOG" 2>&1 &
  BOOT_SERVER_PID=$!

  while ((elapsed < BOOT_GRACE_SECONDS)); do
    if ! kill -0 "$BOOT_SERVER_PID" 2> /dev/null; then
      if wait "$BOOT_SERVER_PID"; then
        _boot_finish "exited-zero"
      else
        _boot_finish "exited-nonzero"
      fi
      return 0
    fi
    if curl --silent --output /dev/null --max-time 2 \
      "http://127.0.0.1:${port}${BOOT_PROBE_PATH}"; then
      _boot_finish "listening"
      return 0
    fi
    sleep "$BOOT_POLL_SECONDS"
    elapsed=$((elapsed + BOOT_POLL_SECONDS))
  done

  cat "$BOOT_SERVER_LOG" >&2
  _boot_finish "indeterminate"
}
