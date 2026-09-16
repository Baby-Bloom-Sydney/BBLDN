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
import type { Actor, AdminId, Result } from "@/modules/shared-types";
import type {
  AdminOnBehalfErrorDetails,
  GatedAdminActor,
  OnBehalfOf,
} from "../types";

/** One message for every refusal: a gate that explains what the caller is missing is an enumeration oracle (07 §4). */
const REFUSED = "You do not have access to this.";

const MISSING_SUBJECT =
  "An on-behalf action must name the person it is taken for.";

const subjectOf = (supplied: Actor): OnBehalfOf | undefined =>
  supplied.kind === "admin" ? supplied.onBehalfOf : undefined;

export const gatedAdminActor = async (
  supplied: Actor,
): Promise<Result<GatedAdminActor, AdminOnBehalfErrorDetails>> => {
  const session = await auth.requireRole("admin");
  if (!session.ok) {
    // `auth`'s own code is kept — `UNAUTHENTICATED` when there is no session, `FORBIDDEN` for the wrong role or
    // a missing second factor — so an expired admin session routes to sign-in rather than reading as a refusal.
    // Its `details` cannot cross: this module closes its own reason union (03 §1 rule 4), so the cause is
    // carried in `which`. A `requireRole` failure with no details is a session read that failed, not a verdict.
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

  // `Session.userId` is the admin's own id. `AdminId` and `UserId` are separate brands over the same
  // `auth.users.id` (02 §4.1 — an admin is a user whose `user_roles.role` is `admin`), so the re-brand is the
  // one place that correspondence is stated, rather than a cast repeated at every call site.
  return ok({
    kind: "admin" as const,
    id: session.value.userId as string as AdminId,
    onBehalfOf,
  });
};
