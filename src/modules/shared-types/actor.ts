// 03 §2.5 `Actor` — who acted. Never a free string: a system actor is a named job.
import type { AdminId, UserId } from "./ids";
import type { SYSTEM_JOB_NAMES } from "./system-job-names";

export type Actor =
  | {
      readonly kind: "user";
      readonly id: UserId;
      readonly role: "parent" | "nanny";
    }
  | {
      readonly kind: "admin";
      readonly id: AdminId;
      readonly onBehalfOf?: {
        readonly role: "parent" | "nanny";
        readonly id: UserId;
      };
    }
  | { readonly kind: "system"; readonly id: (typeof SYSTEM_JOB_NAMES)[number] };
