// The inverse of `mint-link-ref.ts`, applied at the webhook boundary: a ref that is not one of ours by shape is
// `E_EVENT_UNRESOLVED` before any row is read. Shape only — whether the family exists and the ref is the one on
// its row is the spine's job.
import type { FamilyId, LinkRef } from "@/modules/shared-types";
import type { LinkPurpose } from "./mint-link-ref";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PURPOSES: ReadonlySet<string> = new Set([
  "deposit",
  "balance-after-week-1",
  "self-serve-app",
  "custom",
  "checkout",
]);

export type ParsedLinkRef = {
  readonly familyId: FamilyId;
  readonly purpose: LinkPurpose;
};

export function parseLinkRef(ref: LinkRef): ParsedLinkRef | null {
  const parts = ref.split(".");
  if (parts.length !== 3) return null;
  const [familyId, purpose, nonce] = parts;
  if (
    familyId === undefined ||
    purpose === undefined ||
    nonce === undefined ||
    !UUID.test(familyId) ||
    !UUID.test(nonce) ||
    !PURPOSES.has(purpose)
  )
    return null;
  return { familyId: familyId as FamilyId, purpose: purpose as LinkPurpose };
}
