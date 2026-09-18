// **Ruling 5.2** (L-009 `3c`, kickoff §5.2) — what an annual renewal actually asks.
//
// The default the brief gave, taken: re-ask only for the purposes whose document changed since the user's last
// signature; carry the unchanged ones forward and record the carry (`renewal-carry.ts`). The reasoning is on
// `RenewalPlan` in `types.ts`; the one thing worth repeating here is **what "changed" is measured on**. It is the
// content hash, not the version number. A version is a row; the words are what a person consented to, and the
// words are what can stop being the ones she read — ruling 5.1 is the same argument from the other end.
// Comparing hashes makes the two rulings agree by construction: the plan asks exactly when the triple she signed
// no longer resolves to the current words.
//
// Pure read. It writes nothing, so a caller that cannot put the question in front of her right now has not
// already recorded that it did.
import type { Result, UserId } from "@/modules/shared-types";
import type {
  ConsentErrorDetails,
  ConsentStore,
  LegalDocumentId,
  RenewalItem,
  RenewalPlan,
} from "../types";
import { err } from "../../lib/err";
import { ok } from "../../lib/ok";

type Deps = { readonly store: ConsentStore };

const carry = (error: { code: Parameters<typeof err>[0]; message: string }) =>
  err<ConsentErrorDetails>(error.code, error.message, undefined, error);

export async function dueForRenewal(
  userId: UserId,
  purposes: ReadonlyArray<LegalDocumentId>,
  deps: Deps,
): Promise<Result<RenewalPlan, ConsentErrorDetails>> {
  const reAsk: RenewalItem[] = [];
  const carryForward: RenewalItem[] = [];
  const unavailable: LegalDocumentId[] = [];

  for (const purpose of purposes) {
    const current = await deps.store.currentDocument(purpose);
    if (!current.ok) return carry(current.error);
    if (current.value === null) {
      // Not a renewal question: there is nothing to renew against. `0026` seeds every day-one slug, so this can
      // only mean the seed is missing, and silently treating it as "re-ask" would put an empty page in front of
      // her and record a consent to nothing.
      unavailable.push(purpose);
      continue;
    }
    const latest = await deps.store.latestConsent(userId, purpose);
    if (!latest.ok) return carry(latest.error);
    const signed =
      latest.value !== null && latest.value.consentGiven
        ? latest.value.document
        : undefined;
    const item: RenewalItem = Object.freeze({
      purpose,
      current: current.value,
      ...(signed === undefined ? {} : { signed }),
    });
    // A decline is a new row with `false`, so `signed === undefined` also covers "she declined last time" —
    // which is a re-ask, not a carry: carrying a decline forward would record consent she never gave.
    if (
      signed === undefined ||
      signed.contentHash !== current.value.contentHash
    )
      reAsk.push(item);
    else carryForward.push(item);
  }

  return ok(
    Object.freeze({
      reAsk: Object.freeze(reAsk),
      carryForward: Object.freeze(carryForward),
      unavailable: Object.freeze(unavailable),
    }),
  );
}
