// The one bearer check every machine-facing route uses (01 §4e: "Route handlers authenticate explicitly … and
// **fail closed** when the secret is unset (Sydney's crons skipped auth when `CRON_SECRET` was missing; not
// carried)").
//
// Two rules, both of which the legacy routes broke:
//   1. **An absent secret is never authorisation.** `if (secret) { …check… }` skipped the check entirely; here an
//      undefined, empty or whitespace-only secret rejects every caller.
//   2. **The compare is constant time.** A plain `!==` on a secret leaks its prefix through timing.
// The scheme is matched exactly (`Bearer `, capitalised as RFC 6750 writes it) rather than guessed, so a
// mis-cased header fails loudly at the caller instead of widening the parser.
import { constantTimeEquals } from "./constant-time-equals";

const SCHEME = "Bearer ";

export function authoriseBearer(
  header: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (secret === undefined || secret.trim() === "") return false;
  if (typeof header !== "string" || !header.startsWith(SCHEME)) return false;
  const presented = header.slice(SCHEME.length);
  if (presented === "") return false;
  return constantTimeEquals(presented, secret);
}
