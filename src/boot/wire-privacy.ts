// `platform/privacy` (07 §6.1; B-46) over `auth`'s port: `0028`'s two RPCs, the request ledger and the storage
// surface (`db-privacy-store.ts`), with `account.deleted` emitted through the events connector.
import { auth } from "@/modules/auth";
import { configurePrivacy, createPrivacy, log } from "@/modules/platform";
import { dbPrivacyStore } from "./db-privacy-store";
import { emitAccountDeleted } from "./emit-account-deleted";
import type { PortWiring } from "./types";

export function wirePrivacy(): PortWiring {
  configurePrivacy(
    createPrivacy({
      store: dbPrivacyStore(auth.data),
      onErased: emitAccountDeleted,
      log,
    }),
  );
  return {
    port: "privacy",
    binding:
      "db-privacy (account_erasure_requests · erase_account · collect_erasure_objects · storage)",
  };
}
