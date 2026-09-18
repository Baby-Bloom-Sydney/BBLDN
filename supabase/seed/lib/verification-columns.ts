// What each seeded state *is*, in columns — and nothing else. **No level is written here.** The level is
// derived afterwards by `sync_nanny_verification_state()` (0023, ADR-157: the ONE writer), so a seeded world
// is the product's own derivation applied to a set of section statuses, not a second opinion about it. If the
// two could disagree, the seed would be the first place London's level model silently forked.
//
// Read the table against 02 §4.3's derivation: L1 = identity has left `not_started`; L2 = the identity section
// verified; L3 = L2 + `dbs_outcome = cleared` + the cross-check passed; L4 = L3 + an admin-recorded Update
// Service check reading `no_change` (B-19's built default); `barred` ⇒ L0 + suspended (I-V5), which the table
// has to satisfy *at insert time* because `verifications_barred_is_suspended_check` is a row constraint.
import type { NannyState } from "./types.ts";

export type VerificationColumns = {
  readonly identityStatus: string;
  readonly dbsStatus: string;
  readonly dbsOutcome: string;
  readonly crossCheck: string;
  readonly rtwStatus: string;
  readonly contactStatus: string;
  readonly updateService: boolean;
  readonly suspended: boolean;
  /** What the provider ledger row for the identity submission reads as in the admin queue. */
  readonly ledgerStatus: "pending" | "needs_admin" | "passed" | "failed";
};

const NOT_STARTED = "not_started";
const VERIFIED = "verified";

const COLUMNS: Readonly<Record<NannyState, VerificationColumns>> =
  Object.freeze({
    submitted: row({ identityStatus: "pending", ledgerStatus: "pending" }),
    "needs-admin": row({
      identityStatus: "review",
      ledgerStatus: "needs_admin",
    }),
    "level-2": row({ identityStatus: VERIFIED, ledgerStatus: "passed" }),
    "level-3": pooled({}),
    "level-4": pooled({ updateService: true }),
    held: pooled({}),
    barred: row({
      identityStatus: VERIFIED,
      dbsStatus: VERIFIED,
      dbsOutcome: "barred",
      suspended: true,
      ledgerStatus: "failed",
    }),
  });

function row(over: Partial<VerificationColumns>): VerificationColumns {
  return Object.freeze({
    identityStatus: NOT_STARTED,
    dbsStatus: NOT_STARTED,
    dbsOutcome: "unset",
    crossCheck: NOT_STARTED,
    rtwStatus: NOT_STARTED,
    contactStatus: VERIFIED, // 02 §4.3: "contact saved" IS verified (ADR-154)
    updateService: false,
    suspended: false,
    ledgerStatus: "pending",
    ...over,
  });
}

/** L3 and above: identity verified, DBS cleared, the cross-check passed, right to work on file (ADR-153). */
function pooled(over: Partial<VerificationColumns>): VerificationColumns {
  return row({
    identityStatus: VERIFIED,
    dbsStatus: VERIFIED,
    dbsOutcome: "cleared",
    crossCheck: "passed",
    rtwStatus: VERIFIED,
    ledgerStatus: "passed",
    ...over,
  });
}

export function verificationColumns(state: NannyState): VerificationColumns {
  return COLUMNS[state];
}
