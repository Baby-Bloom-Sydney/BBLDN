// `onboarding-parent`'s profile store (02 §4.1; L-007 `1c`) over `create_parent_profile` (`0017`).
//
// The one binding on the report that belongs to a feature module rather than to `platform` / `auth` / a service
// seam. It is here because 02 §4.1's rule — exactly one `user_roles` and one `user_profiles` row per user,
// written by the signup action, no triggers (C-8) — has no home in the module: the write is a definer function,
// and which definer exists is a property of the applied schema, which is boot's to know.
import { auth } from "@/modules/auth";
import { configureParentProfileStore } from "@/modules/onboarding-parent";
import { dbParentProfileStore } from "./db-parent-profile-store";
import type { PortWiring } from "./types";

export function wireParentProfileStore(): PortWiring {
  configureParentProfileStore(dbParentProfileStore(auth.data));
  return {
    port: "parent-profile",
    binding: "db-parent-profile (create_parent_profile, session scope)",
  };
}
