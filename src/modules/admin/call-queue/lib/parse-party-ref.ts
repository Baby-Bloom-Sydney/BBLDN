// A `"use server"` export is a public HTTP surface, and TypeScript stops at the door: a malformed body reaches
// the action with `ref` absent or the wrong shape. Deriving the `CallRef` and the `Actor` from it before the
// gate has run turns that into a `TypeError` thrown out of an async function rather than a typed refusal
// (`common/coding-style.md`: validate at the boundary; security review, MEDIUM).
//
// This is **not** an authorisation check and must not be mistaken for one — `admin-on-behalf`'s gate is what
// decides whether the caller may act, and it reads the session (FIX-1). This only decides whether there is a
// well-formed request to gate at all.
import type { CallPartyRef } from "../types";

const isUuidish = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 64;

export function parsePartyRef(input: unknown): CallPartyRef | null {
  if (typeof input !== "object" || input === null) return null;
  const ref = input as Record<string, unknown>;
  if (ref.kind === "nanny")
    return isUuidish(ref.bookingId) && isUuidish(ref.nannyId)
      ? ({
          kind: "nanny",
          bookingId: ref.bookingId,
          nannyId: ref.nannyId,
        } as CallPartyRef)
      : null;
  if (ref.kind === "position")
    return isUuidish(ref.positionId) && isUuidish(ref.parentId)
      ? ({
          kind: "position",
          positionId: ref.positionId,
          parentId: ref.parentId,
        } as CallPartyRef)
      : null;
  return null;
}
