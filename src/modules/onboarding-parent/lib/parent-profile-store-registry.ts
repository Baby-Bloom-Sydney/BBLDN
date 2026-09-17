// The boot slot for the module-level `parentProfileStore` binding. Fails closed until `configureParentProfileStore`
// installs the adapter: the write is a SECURITY DEFINER function per ADR-127 that the `0000`–`0016` set does not yet
// carry (migration owed — L-007 `1c`), and a default that answered `ok` would make a signup look complete with no
// `user_profiles` row behind it (02 §4.1: "exactly one … per user, created in the signup action").
import { createRegistry, err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { ParentProfileStore } from "../types";

const NOT_CONFIGURED = err(
  "INTERNAL",
  "We couldn't finish creating your account.",
  { reason: "profile-store-not-configured" as const },
);

const unconfigured: ParentProfileStore = Object.freeze({
  create: async () => NOT_CONFIGURED,
  get: async () => NOT_CONFIGURED,
});

export const PARENT_PROFILE_STORE_REGISTRY: Registry<ParentProfileStore> =
  createRegistry<ParentProfileStore>(unconfigured);
