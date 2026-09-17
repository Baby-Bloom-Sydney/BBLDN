// Boot hook: installs the adapter the module-level `parentProfileStore` binding delegates to (the real one over
// `auth`'s data port once `create_parent_profile` exists; an in-memory one in tests).
import type { ParentProfileStore } from "../types";
import { PARENT_PROFILE_STORE_REGISTRY } from "./parent-profile-store-registry";

export function configureParentProfileStore(next: ParentProfileStore): void {
  PARENT_PROFILE_STORE_REGISTRY.set(next);
}
