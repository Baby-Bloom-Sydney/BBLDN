// Whether S-P-03's position card may offer the family a road to change what she asked for.
//
// The rule is `positions`' and is never re-derived here: `parentMayAmend` is the same predicate `amend`
// enforces at the write (`may-amend.ts`), so the link the hub shows and the refusal the module would give
// cannot disagree. `/parent/request` asks the same question to pick between its "new" and "edit" states
// (04 §6.2); this is the hub's half of it, reduced to the one boolean the client component needs.
//
// **Fail closed.** A read that does not answer, or a family with no live position, is `false` — the card then
// offers nothing rather than a link `amend` would refuse.
import { parentMayAmend, positions } from "@/modules/positions";
import type { ParentId, UserId } from "@/modules/shared-types";

export async function canAmendPosition(userId: UserId): Promise<boolean> {
  const live = await positions.findLive(userId as string as ParentId);
  if (!live.ok || live.value === null) return false;
  return parentMayAmend(live.value.stage);
}
