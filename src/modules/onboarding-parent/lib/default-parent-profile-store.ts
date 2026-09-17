// The binding the signup action writes through. Re-reads the registry on every call so boot wiring reaches it.
import type { ParentProfileStore } from "../types";
import { PARENT_PROFILE_STORE_REGISTRY } from "./parent-profile-store-registry";

export const parentProfileStore: ParentProfileStore = Object.freeze({
  create: (input) => PARENT_PROFILE_STORE_REGISTRY.get().create(input),
  get: (userId) => PARENT_PROFILE_STORE_REGISTRY.get().get(userId),
});
