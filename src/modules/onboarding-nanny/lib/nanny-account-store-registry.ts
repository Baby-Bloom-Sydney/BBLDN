// The boot slot for the module-level `nannyAccountStore` binding. Fails closed until
// `configureNannyAccountStore` installs the adapter over `0021`'s definers (ADR-152): a default that answered
// `ok` would make a signup look complete with no `nannies` row behind it (02 §4.2).
import { createRegistry, err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { NannyAccountStore } from "../types";

const NOT_CONFIGURED = err(
  "INTERNAL",
  "We couldn't finish setting up your account.",
  { reason: "nanny-store-not-configured" as const },
);

const unconfigured: NannyAccountStore = Object.freeze({
  create: async () => NOT_CONFIGURED,
  liftIsolation: async () => NOT_CONFIGURED,
  updateProfile: async () => NOT_CONFIGURED,
  get: async () => NOT_CONFIGURED,
});

export const NANNY_ACCOUNT_STORE_REGISTRY: Registry<NannyAccountStore> =
  createRegistry<NannyAccountStore>(unconfigured);
