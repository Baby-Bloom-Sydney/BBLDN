// Whoever is signed in, as the `Actor` this module's methods take (03 §2.5 "never a free string"). It is
// deliberately **not** role-gated: both sides of an invite reach S-X-13, and an admin acting on behalf reaches
// S-A-11, so the caller here is any of the three — and it is the method, not the read, that decides who may do
// what (`invite-authorisation.ts`). `null` for a signed-out visitor, which the landing page handles as a state
// rather than a refusal.
import { auth } from "@/modules/auth";
import type { Actor, AdminId } from "@/modules/shared-types";

export async function appActor(): Promise<Actor | null> {
  const session = await auth.getSession();
  if (!session.ok || session.value === null) return null;
  const { userId, role } = session.value;
  // `Session.userId` and `AdminId` are the same uuid under two brands (02 §4.1) — the admin *is* the user row.
  if (role === "admin")
    return { kind: "admin", id: userId as string as AdminId };
  if (role === "parent" || role === "nanny")
    return { kind: "user", id: userId, role };
  return null;
}
