// S-A-16's counters (04 §6.4; 05 AC-A-17): what needs a person now, today's decisions either way (London day),
// and how many nannies are fully verified — from the ledger and the level counts, never a Sydney status code.
import { LOCALE } from "@/modules/config";
import { ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import { listSubmissions } from "@/modules/vetting-providers";
import type {
  AdminOverview,
  VerificationDeps,
  VerificationErrorDetails,
} from "../types";
import { requireAdmin } from "./require-admin";

const londonDay = (instant: string, now: Date): boolean =>
  new Intl.DateTimeFormat("en-GB", { timeZone: LOCALE.timezone }).format(
    new Date(instant),
  ) === new Intl.DateTimeFormat("en-GB", { timeZone: LOCALE.timezone }).format(now);

export async function adminOverview(
  deps: VerificationDeps,
  now: Date = new Date(),
): Promise<Result<AdminOverview, VerificationErrorDetails>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const [all, levels] = await Promise.all([
    listSubmissions({}),
    deps.store.countByLevel(),
  ]);
  if (!all.ok) return all as Result<never, VerificationErrorDetails>;
  if (!levels.ok) return levels;
  const today = all.value.filter(
    (entry) => entry.checkedAt !== undefined && londonDay(entry.checkedAt, now),
  );
  return ok({
    pending: all.value.filter((entry) => entry.status.kind === "needs-admin")
      .length,
    verifiedToday: today.filter((entry) => entry.status.kind === "verified")
      .length,
    rejectedToday: today.filter((entry) => entry.status.kind === "rejected")
      .length,
    fullyVerified: levels.value.L4_FULLY_VERIFIED,
  });
}
