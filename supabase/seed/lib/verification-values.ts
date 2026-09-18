// The `verifications` row as plain values, computed in TypeScript rather than in a wall of SQL `case`
// expressions. Pure, so the shape of a seeded state is readable in one place and `int.seed` can reason about
// it without a database.
//
// Everything a real verification would hold and a seed must not is simply absent: no object path, no URL, no
// share code (I-V7 / 07 §6 row 5), no extracted document fields, no AI reasoning. The seed has never read a
// document, so it has nothing to put there.
import { VETTING } from "../../../src/modules/config/vetting.ts";
import { syntheticDbsNumber } from "./synthetic-dbs-number.ts";
import { verificationColumns } from "./verification-columns.ts";
import type { NannyState, SyntheticPerson } from "./types.ts";

export type VerificationValues = {
  readonly suspended: boolean;
  readonly identityStatus: string;
  readonly identityEvidenceType: string;
  readonly identityCheckedBy: string;
  readonly surname: string;
  readonly givenNames: string;
  readonly dbsStatus: string;
  readonly dbsNumber: string | null;
  readonly dbsOutcome: string;
  readonly dbsCheckedBy: string;
  readonly updateServiceSubscribed: boolean | null;
  readonly updateServiceResult: string | null;
  readonly updateServiceCheckedBy: string | null;
  readonly rtwStatus: string;
  readonly rtwEvidenceType: string | null;
  readonly rtwCheckedBy: string;
  readonly contactStatus: string;
  readonly crossCheck: string;
  readonly ledgerStatus: string;
  readonly hasIdentitySubmission: boolean;
};

const NOT_STARTED = "not_started";
const checkedBy = (status: string): string =>
  status === "verified" ? "admin" : "none";

export function verificationValues(
  state: NannyState,
  person: SyntheticPerson,
  index: number,
  adminUserId: string,
): VerificationValues {
  const columns = verificationColumns(state);
  const onUpdateService = columns.updateService;
  return Object.freeze({
    suspended: columns.suspended,
    identityStatus: columns.identityStatus,
    identityEvidenceType: VETTING.identityEvidence[0],
    identityCheckedBy: checkedBy(columns.identityStatus),
    surname: person.lastName,
    givenNames: person.firstName,
    dbsStatus: columns.dbsStatus,
    dbsNumber:
      columns.dbsStatus === NOT_STARTED ? null : syntheticDbsNumber(index),
    dbsOutcome: columns.dbsOutcome,
    dbsCheckedBy: checkedBy(columns.dbsStatus),
    updateServiceSubscribed: onUpdateService ? true : null,
    updateServiceResult: onUpdateService ? "no_change" : null,
    updateServiceCheckedBy: onUpdateService ? adminUserId : null,
    rtwStatus: columns.rtwStatus,
    rtwEvidenceType:
      columns.rtwStatus === NOT_STARTED
        ? null
        : Object.keys(VETTING.rightToWorkEvidence)[0],
    rtwCheckedBy: checkedBy(columns.rtwStatus),
    contactStatus: columns.contactStatus,
    crossCheck: columns.crossCheck,
    ledgerStatus: columns.ledgerStatus,
    hasIdentitySubmission: columns.identityStatus !== NOT_STARTED,
  });
}
