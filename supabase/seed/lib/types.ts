// The development seed's type group (06 §2.3; TRIAGE `12.09`). One file, because these types are read by every
// other file here and by `int.seed`; nothing in this folder is imported by `src/`.

/** Why the seed refused. Each code is a separate gate; the runner prints all of them, not just the first. */
export type RefusalCode =
  | "PRODUCTION_ENVIRONMENT"
  | "REMOTE_TARGET_NOT_ALLOWED"
  | "REAL_PERSON_PRESENT"
  | "REAL_ACCOUNT_PRESENT"
  | "ALREADY_SEEDED";

export type Refusal = {
  readonly code: RefusalCode;
  readonly reason: string;
};

/** One row of `areas`, as the seed reads it — never invented (02 §4.2 row 1: seed-only, the geography source). */
export type SeedArea = {
  readonly district: string;
  readonly area: string;
};

export type PersonRole = "parent" | "nanny" | "admin";

export type SyntheticPerson = {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly mobile: string;
};

/**
 * The verification states the seed has to be able to produce. Named for what a person reading the admin queue
 * or the nanny's own screen would call them, not for the columns underneath.
 */
export type NannyState =
  | "submitted"
  | "needs-admin"
  | "level-2"
  | "level-3"
  | "level-4"
  | "barred"
  | "held";

export type SeedPlan = {
  readonly areas: ReadonlyArray<SeedArea>;
  /** Verified nannies per area — 08 §3.4's per-area floor is what decides whether an area has supply at all. */
  readonly poolPerArea: number;
  /** How many of the pool are carried all the way to L4 rather than stopping at the pool floor. */
  readonly poolAtL4: number;
  /** One nanny per state the admin queue and the level model have to tell apart. */
  readonly states: ReadonlyArray<NannyState>;
};

export type SeedCounts = {
  readonly admins: number;
  readonly parents: number;
  readonly poolNannies: number;
  readonly stateNannies: number;
  /** Of the state nannies, how many sit at or above `MATCHING.minVerificationLevel` and so join the pool. */
  readonly stateNanniesInPool: number;
  readonly isolatedNannies: number;
  readonly positions: number;
  readonly connections: number;
  readonly heldConnections: number;
};

export type SeedReport = {
  readonly areas: ReadonlyArray<SeedArea>;
  readonly counts: SeedCounts;
};
