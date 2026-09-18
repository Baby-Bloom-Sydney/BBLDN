// The module-level `privacy` every caller imports. Each method re-reads the registry, so a later `configure`
// wins and an import taken at module load never pins the unconfigured default.
import type { Privacy } from "../types";
import { PRIVACY_REGISTRY } from "./privacy-registry";

export const privacy: Privacy = Object.freeze({
  eraseOwnAccount: (input) => PRIVACY_REGISTRY.get().eraseOwnAccount(input),
  openRequestForEmail: (input) =>
    PRIVACY_REGISTRY.get().openRequestForEmail(input),
  listOpenRequests: (limit) => PRIVACY_REGISTRY.get().listOpenRequests(limit),
  runRequest: (requestId) => PRIVACY_REGISTRY.get().runRequest(requestId),
  sweepRequests: (now) => PRIVACY_REGISTRY.get().sweepRequests(now),
});
