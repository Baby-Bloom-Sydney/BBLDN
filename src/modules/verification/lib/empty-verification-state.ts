// I-V1 (as amended by ADR-154): before her first wizard write a nanny has no row, and reads as every section
// `not_started` at level 0.
import type { UserId } from "@/modules/shared-types";
import type { VerificationState } from "../types";

export function emptyVerificationState(nannyId: UserId): VerificationState {
  const state: VerificationState = {
    nannyId,
    level: "L0_SIGNED_UP",
    suspended: false,
    sections: [
      { section: "contact", status: "not_started" },
      { section: "identity", status: "not_started", attempts: 0 },
      { section: "dbs", status: "not_started" },
      { section: "right-to-work", status: "not_started" },
    ],
  };
  return Object.freeze(state);
}
