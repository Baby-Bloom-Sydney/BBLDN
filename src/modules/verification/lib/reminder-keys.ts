// The dedupe keys the comms of `2c` are keyed on (03 §8.2 rows 30 and 32; ADR-161) — one place, so the schedule,
// the cancel and the tests cannot spell them apart. Pure.
import type { UserId } from "@/modules/shared-types";
import type { VerificationSection } from "../types";

export const REMINDER_KEYS = Object.freeze({
  /** `verification-reminder:{nanny}:{i}` — LCY-1…4, one key per offset */
  reminder: (nannyId: UserId, step: number): string =>
    `verification-reminder:${nannyId}:${step}`,
  /** `verification-action-needed:{nanny}:{section}` — +10 min, cancelled on resubmission */
  actionNeeded: (nannyId: UserId, section: VerificationSection): string =>
    `verification-action-needed:${nannyId}:${section}`,
  /** `verification-approved:{nanny}:{level}` — once per level reached */
  approved: (nannyId: UserId, level: string): string =>
    `verification-approved:${nannyId}:${level}`,
  /** `verification-pending:{nanny}:{day}` — once per day of submitting */
  pending: (nannyId: UserId, day: string): string =>
    `verification-pending:${nannyId}:${day}`,
});
