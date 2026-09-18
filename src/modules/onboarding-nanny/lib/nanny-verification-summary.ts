// The verification half of S-N-17 and S-N-21, and the one place either screen speaks about it (04 §6.3).
//
// ★ **THE RULE THIS FILE EXISTS TO HOLD (ADR-157; the planner's ruling on ADR-158's silent hold).** The hold has
// no copy anywhere, so this function is given nothing to say it with: its whole input is the level
// `verification.getStatus` answered and the four section statuses. A nanny at L3 whose connections are waiting
// on the level-4 Update Service check reads **exactly** what a nanny mid-check reads, because there is no branch
// that could tell them apart and no field that carries the difference. `onboarding-nanny.my-profile.test.ts`
// sweeps every level × every section status and asserts that nothing in the output says hold, held, withheld or
// hidden.
//
// The level is **read, never derived** (`2c`'s first rule): `sync_nanny_verification_state()` is the one writer
// and `getStatus` is the one reader; nothing here recomputes it from the sections it also renders.
//
// What she IS told is documented and is hers: 04 §4.1 row 14's three outcomes (verified · action required · in
// review), row 15's "Fully verified", and I-V5's suspension, which VER-010 already emailed her about.
import type { SectionState, VerificationState } from "@/modules/verification";
import type { NannyVerificationRow, NannyVerificationSummary } from "../types";

/** 04 §6.3's three evidence rows, in the document's order. Contact is the wizard's, not a row here. */
const ROWS = Object.freeze([
  { section: "identity", label: "Who you are" },
  { section: "dbs", label: "Your DBS certificate" },
  { section: "right-to-work", label: "Your right to work" },
] as const);

/** The words a status reads as. Status is text, never colour alone (04 §6.3's L·E·E and a11y rule). */
const STATUS_LABEL: Readonly<Record<string, string>> = Object.freeze({
  not_started: "Not started",
  pending: "Sent — waiting to be checked",
  processing: "Being checked",
  verified: "Confirmed",
  review: "In review — a person is looking at it",
  rejected: "Needs another look",
  failed: "Needs another look",
  expired: "Expired — please send it again",
});

/** The statuses only she can move on. Everything else is ours to finish, and the screen says nothing about it. */
const HERS = new Set(["not_started", "rejected", "failed", "expired"]);

const statusOf = (
  state: VerificationState,
  section: NannyVerificationRow["section"],
): SectionState["status"] =>
  state.sections.find((each) => each.section === section)?.status ??
  "not_started";

/**
 * The one line. It is a function of the level and of whether anything is open or in flight — never of anything
 * else, which is what keeps the hold unnamed.
 */
function lineFor(state: VerificationState, needsHer: boolean): string {
  if (state.suspended)
    // I-V5's suspension, which VER-010 has already emailed her about. The word "hold" is deliberately not used
    // anywhere on a nanny surface — it belongs to the connection mechanism she is never told about.
    return "We've paused your account while we look into something. We've emailed you about it.";
  if (needsHer) return "Something needs another look — it won't take long.";
  if (state.level === "L4_FULLY_VERIFIED") return "Fully verified.";
  if (state.level === "L3_PROVISIONALLY_VERIFIED") return "You're verified.";
  const started = state.sections.some(
    (each) => each.section !== "contact" && each.status !== "not_started",
  );
  return started
    ? "We're checking your details. We'll email you the moment we're done."
    : "Verify your details so we can introduce you to families.";
}

export function nannyVerificationSummary(
  state: VerificationState,
): NannyVerificationSummary {
  const rows: ReadonlyArray<NannyVerificationRow> = Object.freeze(
    ROWS.map((row) => {
      const status = statusOf(state, row.section);
      return Object.freeze({
        section: row.section,
        label: row.label,
        status,
        statusLabel: STATUS_LABEL[status] ?? STATUS_LABEL.not_started,
        needsHer: HERS.has(status),
      });
    }),
  );
  const needsHer = rows.some((row) => row.needsHer) && !state.suspended;
  return Object.freeze({
    level: state.level,
    line: lineFor(state, needsHer),
    dbs: statusOf(state, "dbs"),
    rows,
    needsHer,
    suspended: state.suspended,
  });
}
