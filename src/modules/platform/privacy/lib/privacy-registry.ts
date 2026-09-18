// The boot slot for the module-level `privacy`. Until `configurePrivacy` installs a connector over a real (or
// memory) store, every call fails closed — which for an erasure means it **refuses**, never "did nothing and said
// yes". A person told her account was deleted when it was not is the one answer this capability must never give.
import type { Privacy, PrivacyErrorDetails, PrivacyStore } from "../types";
import { createRegistry } from "../../lib/create-registry";
import { err } from "../../lib/err";
import { createPrivacy } from "./create-privacy";

const NOT_CONFIGURED = err<PrivacyErrorDetails>(
  "INTERNAL",
  "Privacy is not configured",
  { reason: "privacy-not-configured" },
);

const unconfiguredStore: PrivacyStore = Object.freeze({
  openRequest: async () => NOT_CONFIGURED,
  readRequest: async () => NOT_CONFIGURED,
  listOpenRequests: async () => NOT_CONFIGURED,
  findSubjectByEmail: async () => NOT_CONFIGURED,
  collectObjects: async () => NOT_CONFIGURED,
  removeObject: async () => NOT_CONFIGURED,
  runErasure: async () => NOT_CONFIGURED,
});

export const PRIVACY_REGISTRY = createRegistry<Privacy>(
  createPrivacy({ store: unconfiguredStore }),
);
