// ★ **ADR-084's other half, and the reason `1i` exists at all.**
//
// `set_access_window` recomputes `parent_subscriptions.access_until` to the youngest child's third birthday,
// and it never shrinks an already-granted window — "your bundle covers every child you have after that" is a
// promise the family was sold, so a later-born child extends it and an unlink never takes it back (0010 §8).
// `payments` calls it on every paid transition and at `openDfyAccess`. **Nothing called it when a child was
// linked**, which meant the window moved when money moved and not when the thing it is computed *from*
// changed. This is that call: once, at the link, and once when a child is created.
//
// It fails soft and says so. The window is derived data — the children are the fact — and the next paid
// transition, the next link and the `expire-*` sweeps all recompute it from the same rows. Refusing a family
// the child they just added because a derived timestamp could not be refreshed would be the wrong trade, so
// the failure is logged with the family id in `fields` (never interpolated — 01 §4b) and the caller carries on.
import { log } from "@/modules/platform";
import type { FamilyId, Instant } from "@/modules/shared-types";
import type { SetAccessWindowPort } from "./child-linking-deps";

export async function recomputeAccessWindow(
  setAccessWindow: SetAccessWindowPort | undefined,
  familyId: FamilyId,
  action: "createChild" | "claimInvite",
): Promise<Instant | null> {
  if (setAccessWindow === undefined) {
    log.warn("access window not recomputed: no port wired", {
      module: "app",
      action: `child-linking.${action}`,
      familyId,
    });
    return null;
  }
  const result = await setAccessWindow(familyId);
  if (result.ok) return (result.value as Instant | null) ?? null;
  log.warn("access window not recomputed", {
    module: "app",
    action,
    familyId,
    errorCode: result.error.code,
  });
  return null;
}
