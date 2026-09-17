// The binding the signup, portal and profile actions write through. Re-reads the registry on every call.
import type { NannyAccountStore } from "../types";
import { NANNY_ACCOUNT_STORE_REGISTRY } from "./nanny-account-store-registry";

export const nannyAccountStore: NannyAccountStore = Object.freeze({
  create: (input) => NANNY_ACCOUNT_STORE_REGISTRY.get().create(input),
  liftIsolation: () => NANNY_ACCOUNT_STORE_REGISTRY.get().liftIsolation(),
  updateProfile: (input) => NANNY_ACCOUNT_STORE_REGISTRY.get().updateProfile(input),
  get: () => NANNY_ACCOUNT_STORE_REGISTRY.get().get(),
});
