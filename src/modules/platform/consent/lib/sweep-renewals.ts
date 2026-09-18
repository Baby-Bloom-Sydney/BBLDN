// **The per-user annual renewal sweep** (FATE `10.18`; ADR-174; L-009 `3g`). `3c` built the per-user plan and
// stopped, because the sweep needed a store read the port did not have and "half of it would look like a check
// that wasn't happening". `0029` is the read; this is the sweep.
//
// **The shape, and why each half is where it is.**
//
//   · *Who is due* is a database question — the newest row per subject for a purpose, older than the cadence —
//     and it lives in `0029`'s `consent_subjects_due_for_renewal`, because PostgREST cannot express it and a
//     TypeScript version would page the whole consent table into memory to find out.
//   · *What to do about her* is `dueForRenewal`'s, unchanged, because it is ADR-173's binding rule: compare the
//     **content hash** she signed with the one the document has now. Putting that comparison into the SQL would
//     have made a second place to get ruling 5.1 right, and the day `3a`'s ratified text lands as version 2 is
//     exactly the day two places disagree.
//
// **What it writes and what it deliberately does not.** A purpose whose words have not moved is carried forward
// and **the carry is a row** (ADR-174): without it, "no renewal was needed" and "the renewal never ran" are the
// same observation a year later, which is precisely what an accountability request asks. A purpose whose hash
// has moved is *counted* and nothing is written — a row saying we asked her would be false until a surface
// actually has, and `3c`'s reasoning on `dueForRenewal` ("a caller that cannot put the question in front of her
// has not already recorded that it did") is the same reasoning one level up. A decline is re-asked, never
// carried, because carrying one forward would record a consent she did not give; `dueForRenewal` already puts
// a declined purpose in `reAsk`, and the case for it is driven here as well as there.
//
// **Idempotency falls out of the shape rather than being managed.** The carry is itself the newest row, so a
// carried subject is not due tomorrow. A re-ask writes nothing and stays due — correctly, because she is — and
// that is what makes the `reAsk` count an operator number rather than a statistic: it is the number of people
// whose renewal nobody has put in front of them, and it only falls when somebody does.
//
// **A read failure fails the whole run.** Same rule as `auditConsentExpiry`: a partial sweep reporting a clean
// run is worse than no run, because the run-summary line is the only thing an operator sees.
import { CONSENT } from "@/modules/config";
import type {
  ConsentRecordId,
  Instant,
  Result,
  UserId,
} from "@/modules/shared-types";
import type {
  AgreementId,
  ConsentDeps,
  ConsentParty,
  LegalDocumentId,
  RenewalSweepSummary,
} from "../types";
import { ok } from "../../lib/ok";
import { dueForRenewal } from "./due-for-renewal";
import { RENEWAL_CARRY } from "./renewal-carry";
import { RENEWABLE_PURPOSES } from "./renewable-purposes";

/** The same resolved deps `createConsent` builds — clock and id generator already defaulted. */
type Deps = ConsentDeps & {
  readonly clock: () => Instant;
  readonly newId: () => ConsentRecordId;
};

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The cutoff: anything older than this is due for the *check*. Months are approximated at 30 days deliberately —
 * an exact calendar month would make the cutoff depend on which month the sweep runs in, and the precision
 * would be spurious: nothing expires at this boundary (ADR-174), it only decides which day the comparison
 * happens on.
 */
function cutoff(now: Instant, months: number): Instant {
  return new Date(Date.parse(now) - months * MONTH_MS).toISOString() as Instant;
}

export async function sweepRenewals(
  now: Instant,
  deps: Deps,
): Promise<Result<RenewalSweepSummary>> {
  const before = cutoff(now, CONSENT.renewalCheckMonths);
  let checked = 0;
  let carried = 0;
  let reAsk = 0;
  let unavailable = 0;

  for (const purpose of RENEWABLE_PURPOSES) {
    const subjects = await deps.store.subjectsDueForRenewal({
      purpose,
      before,
      limit: CONSENT.renewalSweepLimit,
    });
    if (!subjects.ok) return subjects;

    for (const userId of subjects.value) {
      checked += 1;
      const outcome = await checkOne(userId, purpose, deps);
      if (!outcome.ok) return outcome;
      carried += outcome.value.carried;
      reAsk += outcome.value.reAsk;
      unavailable += outcome.value.unavailable;
    }
  }

  return ok(Object.freeze({ checked, carried, reAsk, unavailable }));
}

/** One subject, one purpose: the plan, then the carry if there is one to write. */
async function checkOne(
  userId: UserId,
  purpose: LegalDocumentId,
  deps: Deps,
): Promise<
  Result<{
    readonly carried: number;
    readonly reAsk: number;
    readonly unavailable: number;
  }>
> {
  const plan = await dueForRenewal(userId, [purpose], deps);
  if (!plan.ok) return plan;
  if (plan.value.unavailable.length > 0)
    return ok({ carried: 0, reAsk: 0, unavailable: 1 });
  if (plan.value.reAsk.length > 0)
    return ok({ carried: 0, reAsk: 1, unavailable: 0 });

  const item = plan.value.carryForward[0];
  if (item === undefined) return ok({ carried: 0, reAsk: 0, unavailable: 0 });

  const party = await partyOf(userId, purpose, deps);
  if (!party.ok) return party;

  const written = await deps.store.insertConsent(
    Object.freeze({
      id: deps.newId(),
      userId,
      party: party.value.party,
      agreementId: party.value.agreementId,
      checkpointId: RENEWAL_CARRY.checkpointId,
      checkpointText: RENEWAL_CARRY.checkpointText,
      purpose,
      // The triple only. `item.current` also carries `requiresReacceptance`, which is a fact about the
      // document today rather than about what was checked, and a consent row is not the place for it.
      document: {
        id: item.current.id,
        version: item.current.version,
        contentHash: item.current.contentHash,
      },
      consentGiven: true,
      context: {},
      createdAt: deps.clock(),
    }),
  );
  if (!written.ok) return written;
  return ok({ carried: 1, reAsk: 0, unavailable: 0 });
}

/**
 * A carry belongs to **the agreement she already signed** (ADR-174), so both the party and the agreement id come
 * off her own latest row rather than being decided here. That is not a detail: inventing them would produce a
 * carry under an agreement she never entered, which is worse than no carry at all.
 */
async function partyOf(
  userId: UserId,
  purpose: LegalDocumentId,
  deps: Deps,
): Promise<
  Result<{
    readonly party: ConsentParty;
    readonly agreementId: AgreementId;
  }>
> {
  const latest = await deps.store.latestConsent(userId, purpose);
  if (!latest.ok) return latest;
  const row = latest.value;
  // `subjectsDueForRenewal` found her because a row exists, and `dueForRenewal` put this purpose in
  // `carryForward` only because that row is a matching signature — so `row` cannot be null here. It is checked
  // rather than asserted because "cannot happen" is how a null reaches production.
  if (row === null)
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "The renewal check could not read the signature it carries.",
      },
    };
  return ok({ party: row.party, agreementId: row.agreementId });
}
