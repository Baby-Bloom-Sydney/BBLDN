// `LinkRef` is minted by `payments`, never the provider (03 §5.2). It carries the family and the purpose so the
// completion spine can resolve the family without a keyed read, plus a fresh uuid so no two links share a ref.
// The family id is a uuid, the purpose one of the closed set, so `parse-link-ref.ts` can validate the shape at the
// webhook boundary before anything is looked up.
import type { PricePreset } from "@/modules/purchase-paths";
import type { FamilyId, LinkRef } from "@/modules/shared-types";

export type LinkPurpose = PricePreset | "checkout";

export function mintLinkRef(familyId: FamilyId, purpose: LinkPurpose): LinkRef {
  return `${familyId}.${purpose}.${crypto.randomUUID()}` as LinkRef;
}
