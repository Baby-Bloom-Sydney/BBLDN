// `app/child-linking` (03 §9.3 "App / invite") — the real inside in every environment, over the store that
// reads and writes `children`, `child_client` and `child_invites` through `auth`'s data port.
//
// ★ **This file is the only place `payments` and `app` are both in scope, and that is the point.** 01 §2.3
// gives `app` no arrow to `payments`, yet 03 §5.4.4 names `app/child-linking` as `startTrial`'s caller and
// ADR-083 / 084 make it the caller of `set_access_window` at the link. Both arrive as injected functions — the
// shape `wire-placements.ts` uses for `openDfyAccess` — so the contract is honoured without widening the
// table, and `lint:boundaries` still refuses the import inside the module.
//
// `setAccessWindow` is reached through `dbSpineStore`, which `payments`' connector exports (03 §11 row 4),
// because the RPC is a spine write and not a purchase method: it lives on `SpineStore`, not on `PurchasePath`.
// `PRICES.accessAgeYears` is read here rather than inside `app`, so there is exactly one place the number
// crosses from config into the RPC (L4).
import {
  configureChildLinking,
  createChildLinking,
  dbChildLinkingStore,
} from "@/modules/app";
import { auth } from "@/modules/auth";
import { PRICES, URLS } from "@/modules/config";
import { dbSpineStore, payments } from "@/modules/payments";
import { Events, nowInstant } from "@/modules/platform";
import type { PortWiring } from "./types";

export function wireApp(): PortWiring {
  const spine = dbSpineStore(auth.data);
  configureChildLinking(
    createChildLinking({
      store: dbChildLinkingStore(auth.data),
      events: Events,
      now: nowInstant,
      inviteBaseUrl: URLS.invite,
      startTrial: (familyId, actor) => payments.startTrial(familyId, actor),
      setAccessWindow: (familyId) =>
        spine.setAccessWindow(familyId, PRICES.accessAgeYears),
    }),
  );
  return {
    port: "app/child-linking",
    binding: "db inside",
    reason:
      "02 §4.6's children, links and invites through auth's data port; the mint and the revoke run service-scoped because 0012 ships no definer for either (07 §5.2 wants a 0019) and invite-authorisation.ts is therefore the authorisation; startTrial and set_access_window are injected here because 01 §2.3 gives app no arrow to payments",
  };
}
