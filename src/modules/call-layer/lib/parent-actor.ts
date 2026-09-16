// The signed-in parent as the `Actor` the C rows and `scheduling` take (03 §2.5 "never a free string"). The
// role gate is `auth.requireRole` — one read, one refusal shape (03 §1.4), so no action here reads a cookie or
// trusts a caller-supplied id.
import { auth } from "@/modules/auth";
import type { Actor, Result } from "@/modules/shared-types";

export async function parentActor(): Promise<
  Result<Extract<Actor, { readonly kind: "user" }>>
> {
  const session = await auth.requireRole("parent");
  if (!session.ok) return session;
  return {
    ok: true,
    value: { kind: "user", id: session.value.userId, role: "parent" },
  };
}
