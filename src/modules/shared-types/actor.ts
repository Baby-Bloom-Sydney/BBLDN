// 03 §2.5 `Actor` — who acted. Never a free string: a system actor is a named job.
import type { ENUMS } from "./enums";
import type { AdminId, UserId } from "./ids";
import type { SYSTEM_JOB_NAMES } from "./system-job-names";

/** The two customer roles of `user_role` (02 §3) — an admin acts as `kind: "admin"`. */
export type CustomerRole = Exclude<(typeof ENUMS.user_role)[number], "admin">;

export type Actor =
  | {
      readonly kind: "user";
      readonly id: UserId;
      readonly role: CustomerRole;
    }
  | {
      readonly kind: "admin";
      readonly id: AdminId;
      readonly onBehalfOf?: {
        readonly role: CustomerRole;
        readonly id: UserId;
      };
    }
  | { readonly kind: "system"; readonly id: (typeof SYSTEM_JOB_NAMES)[number] };
