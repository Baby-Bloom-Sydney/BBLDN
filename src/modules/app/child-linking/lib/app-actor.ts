// Whoever is signed in, as the `Actor` this module's methods take (03 §2.5 "never a free string"). It is
// deliberately **not** role-gated: both sides of an invite reach S-X-13, and an admin acting on behalf reaches
// S-A-11, so the caller here is any of the three — and it is the method, not the read, that decides who may do
// what (`invite-authorisation.ts`). `null` for a signed-out visitor, which the landing page handles as a state
// rather than a refusal.
//
// ★ **An admin session that has not passed its second factor is not an admin here** (07 §5.4 row 2; security
// review H1). `auth.requireRole` already refuses one — its own header says the check belongs there "and not
// only by the middleware" — but this is a **second, independent road to an `Actor`**, and the first draft of
// it skipped the check. That mattered more than it looks: `/invite/connect/[token]` carries no required role
// at all, and a server action resolves by a build-global reference rather than by the route that rendered its
// form, so an admin whose password alone was compromised could have reached `createChildInviteAction` from an
// unprotected path and minted or revoked an invite for **any** child — with `aal2`, the control that exists to
// contain exactly that compromise, never consulted. A half-authenticated admin is therefore not an actor at
// all: the caller sees a signed-out visitor and is sent to finish signing in.
import { auth } from "@/modules/auth";
import type { Actor, AdminId } from "@/modules/shared-types";

export async function appActor(): Promise<Actor | null> {
  const session = await auth.getSession();
  if (!session.ok || session.value === null) return null;
  const { userId, role, mfaVerified } = session.value;
  if (role === "admin") {
    if (!mfaVerified) return null;
    // `Session.userId` and `AdminId` are the same uuid under two brands (02 §4.1) — the admin *is* the user row.
    return { kind: "admin", id: userId as string as AdminId };
  }
  if (role === "parent" || role === "nanny")
    return { kind: "user", id: userId, role };
  return null;
}
