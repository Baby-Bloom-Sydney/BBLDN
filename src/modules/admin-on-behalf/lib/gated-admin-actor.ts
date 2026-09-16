// The gate (FIX-1, REVIEW-1 C-1). One question, asked the same way for every lever: **is the caller an admin,
// and who are they acting for?**
//
// Authority is read from the session and nowhere else. `auth.requireRole('admin')` is the gate 01 §4d puts in
// `auth` — it re-checks the role in the connector method rather than trusting middleware (07 §5.4 row 1) and
// refuses an admin session that never passed a second factor (row 2, Supabase `aal2`). Nothing here
// re-implements it; a locally-invented role test is what this file exists to delete.
//
// The `Actor` a caller hands in is read for exactly one field: `onBehalfOf`. It is **required** (07 §5.4 row 6)
// and the admin id forwarded downstream is the session's, so a caller cannot name themselves as some other
// admin, and an on-behalf move can never reach a stage handler without saying whose move it is.
import { auth } from "@/modules/auth";
import { err, ok } from "@/modules/platform";
import type { Actor, ErrorCode, Result } from "@/modules/shared-types";
import type {
  AdminOnBehalfErrorDetails,
  GatedAdminActor,
  OnBehalfOf,
} from "../types";
import { adminIdFromUserId } from "./admin-id-from-user-id";

/** One message for every refusal: a gate that explains what the caller is missing is an enumeration oracle (07 §4). */
const REFUSED = "You do not have access to this.";

const MISSING_SUBJECT =
  "An on-behalf action must name the person it is taken for.";

/**
 * `Actor` says this is always present, but this is a **boundary**: a route that forwards a malformed body reaches
 * here with `undefined` and TypeScript cannot stop it. A typed `VALIDATION` refusal is the right answer there, not
 * a `TypeError` thrown out of an `async` function (`common/coding-style.md`; security-reviewer, LOW).
 */
const subjectOf = (
  supplied: Actor | null | undefined,
): OnBehalfOf | undefined =>
  supplied?.kind === "admin" ? supplied.onBehalfOf : undefined;

/** The two codes `requireRole` uses for a **verdict** about the caller. Any other code is the read itself failing. */
const VERDICT_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "UNAUTHENTICATED",
  "FORBIDDEN",
]);

export const gatedAdminActor = async (
  supplied: Actor,
): Promise<Result<GatedAdminActor, AdminOnBehalfErrorDetails>> => {
  const session = await auth.requireRole("admin");
  if (!session.ok) {
    // A failed **session read** is not a verdict about the caller, and `auth` goes out of its way to keep the two
    // apart — `get-session.ts`: "no session" and "we could not tell" must not look the same to the gate. So an
    // `INTERNAL` (a provider outage, a broken cookie jar) is forwarded with its own message and `cause` intact
    // rather than relabelled; re-encoding it as a refusal would bury an outage as a routine access denial in
    // exactly the logs an incident is diagnosed from. `details` is dropped because this module closes its own
    // reason union (03 §1 rule 4) and `requireRole` sends none on this path anyway; `code` and `cause` are what
    // carry the diagnosis.
    if (!VERDICT_CODES.has(session.error.code)) {
      const { code, message, cause } = session.error;
      return Object.freeze({
        ok: false as const,
        error: Object.freeze({
          code,
          message,
          ...(cause === undefined ? {} : { cause }),
        }),
      });
    }
    // A verdict. `auth`'s code is kept — `UNAUTHENTICATED` when there is no session, `FORBIDDEN` for the wrong
    // role or a missing second factor — so an expired admin session routes to sign-in rather than reading as a
    // refusal, and the cause travels in `which` because `AuthErrorDetails` cannot cross the union boundary.
    return err<AdminOnBehalfErrorDetails>(session.error.code, REFUSED, {
      reason: "E_ACTOR_FORBIDDEN" as const,
      which: session.error.details?.reason ?? "session",
    });
  }

  const onBehalfOf = subjectOf(supplied);
  if (onBehalfOf === undefined) {
    return err<AdminOnBehalfErrorDetails>("VALIDATION", MISSING_SUBJECT, {
      reason: "E_ON_BEHALF_OF_REQUIRED" as const,
    });
  }

  // Frozen, not merely `readonly`: this is the object that carries the authority and the audit subject into every
  // lever, and `ok()` freezes only its own wrapper. Compile-time `readonly` would not stop a downstream spread or
  // reassignment from rewriting `id` on the way to an audit write (typescript-reviewer, MEDIUM).
  return ok(
    Object.freeze({
      kind: "admin" as const,
      id: adminIdFromUserId(session.value.userId),
      onBehalfOf,
    }),
  );
};
