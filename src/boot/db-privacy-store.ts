// The `PrivacyStore` of `platform/privacy` (07 §6.1; B-46) over `auth`'s data port — the two halves, joined.
// **Service scope throughout**, and the use is named in `auth/README.md`'s service-role table: `delete-account`
// is already on it.
import type { DataAccessPort } from "@/modules/auth";
import type { PrivacyStore } from "@/modules/platform";
import { privacyErasureOps } from "./privacy-erasure-ops";
import { privacyPurgeOps } from "./privacy-purge-ops";
import { privacyRequestOps } from "./privacy-request-ops";
import { privacyRetentionOps } from "./privacy-retention-ops";

export function dbPrivacyStore(port: DataAccessPort): PrivacyStore {
  return Object.freeze({
    ...privacyRequestOps(port),
    ...privacyErasureOps(port),
    ...privacyPurgeOps(port),
    ...privacyRetentionOps(port),
  });
}
