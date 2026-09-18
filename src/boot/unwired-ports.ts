// The ports boot deliberately leaves on their fail-closed default — stated on the report rather than left out
// of it (REVIEW-2, code-review HIGH-1). `verification` and `vetting-providers` left this list with L-008 `2b`
// (`wire-verification.ts`, ADR-154): REVIEW-1 M-9's objection is answered by construction — `stub-manual`'s only
// outcome is needs-admin, so binding it cannot make a nanny look verified.
//
// `wire-ports.ts`'s header carries the invariant: "a port left on its fail-closed default carries its reason on
// the report, never silence." Four privileged ports broke it by omission — no `configure*` call anywhere in
// `src/boot/`, and no row saying so, so an operator reading the boot log could not tell a port that boot chose
// to leave closed from one it forgot.
//
// **This file configures nothing.** Each module's registry already refuses every method until something calls
// its `configure*` (proved for thirteen of them by `ports.fail-closed.test.ts`), and for `admin-on-behalf` that
// default is the standing safety argument — FIX-1 made the gate structural, but the port being unbound is what
// keeps the eight levers unreachable today. Wiring it here would be the exact change REVIEW-1's C-1 told the
// boot-file unit not to make. So the rows are a disclosure, not a binding.
//
// The visible cost this makes legible: `src/app/admin/calls/page.tsx` renders four S-A-04 levers that all reach
// `adminOnBehalf`, and every one of them answers `INTERNAL { admin-on-behalf-not-configured }` until its Tier A
// unit lands. That is correct-and-closed, and until now it was also invisible.
import type { PortWiring } from "./types";

export function unwiredPorts(): ReadonlyArray<PortWiring> {
  return Object.freeze([
    Object.freeze({
      port: "admin-on-behalf" as const,
      binding: "unconfigured",
      reason:
        "REVIEW-1 C-1 / FIX-1: the eight levers move real families. configureAdminOnBehalf now gates whatever it is handed (lib/gate-admin-on-behalf.ts), so a binding would be safe by construction — but the inside is a Tier A unit that has not landed, and S-A-04's four buttons therefore refuse with admin-on-behalf-not-configured",
    }),
    Object.freeze({
      port: "hire-docs" as const,
      binding: "unconfigured",
      reason:
        "REVIEW-1 L-1: the stub answers ok() carrying a zero-byte PDF, so a production boot with it bound would send a family a legally empty hire summary that reported success. Left closed until the real generator exists",
    }),
  ]);
}
