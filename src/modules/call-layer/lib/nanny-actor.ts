// The signed-in nanny as the `Actor` `scheduling` takes (03 §2.5 "never a free string"), for S-N-02's two
// actions. The role gate is `auth.requireRole`, the same one read `parentActor` uses — so the nanny whose
// booking is written is the session's, never a caller-supplied id. That is the whole of S-N-02's
// authorisation: unlike the parent's picker there is no position to check ownership of, because the subject
// **is** the nanny (03 §3.2's `Subject`).
import { auth } from "@/modules/auth";
import type { Actor, Result } from "@/modules/shared-types";

export async function nannyActor(): Promise<
  Result<Extract<Actor, { readonly kind: "user" }>>
> {
  const session = await auth.requireRole("nanny");
  if (!session.ok) return session;
  return {
    ok: true,
    value: { kind: "user", id: session.value.userId, role: "nanny" },
  };
}
