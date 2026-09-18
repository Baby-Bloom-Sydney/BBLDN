// **The media consent gate, re-based onto the registry** (FATE `07.71`; L-009 `3g`, sub-task `3d`).
//
// It decides one thing: may a media URL be written against this child? It is read-only — the caller writes.
//
// **What the re-base changed, and why each change had to happen here rather than in `3b`.**
//
// 1. **It keys on the registry's `purpose`, not on an agreement label.** It read
//    `agreement_id = 'PARENT-APP-CONSENT'`; the recorder now writes London's `AGR-15` (02 §4.1 says an agreement
//    id is `AGR-nn`, and the Sydney labels are not). A gate reading a label the writer no longer writes is a
//    gate that answers "never given" for every real consent — so it reads `purpose`, which is `0017`'s enum
//    column and the registry's own key, and is therefore immune to an agreement being renumbered.
//
// 2. **The TTL is `CONSENT.renewalCheckMonths`, not `365 * 24 * 60 * 60 * 1000`.** One cadence, in `config`,
//    shared with the renewal sweep — otherwise the day someone changes the product dial, the sweep and this
//    gate disagree about whether a given consent is still good, which is the worst kind of disagreement because
//    both look right in isolation.
//
// 3. ★ **The OAIC "15 and over needs no consent" cliff is GONE, and nothing replaces it.** It came from the
//    Australian Privacy Commissioner's Children's Online Privacy Code exposure draft. It has no force in England
//    and Wales, and the fate table already records that it "needs its UK equivalent" as research (T-3.3).
//    Leaving it in would have meant an Australian rule silently governing an English child's photographs; guessing
//    a UK age would have meant inventing a legal threshold, which L-009's kickoff §3 forbids. So the gate now
//    requires a parent consent for **every** child, which is the conservative direction: it can only ever refuse
//    an upload that a later ruling would have allowed, never allow one it would have refused. The open question
//    — whether UK law recognises a child's own consent here, and from what age — is recorded for the solicitor.
//    With the cliff gone the child's date of birth is no longer read at all, which is also the right outcome:
//    a gate that fetched a child's DOB to decide a consent question was processing a special-category-adjacent
//    field for no purpose it can now state.
//
// 4. **The `NODE_ENV === "test"` bypass is gone.** It returned `allowed: true` for every caller in a test run,
//    so no test outside this file's own could ever have caught the gate being wrong — including the three ways
//    it *was* wrong above. A gate that is off under test is a gate whose coverage number is a fiction.
//
// **What it deliberately does not do.** It does not close on a **moved document hash**. ADR-174 says a consent
// expires when the words change, so strictly a re-published `parent-app-consent` should stop the gate — but no
// surface exists yet to re-ask her (that is `3b`'s modal, and the sweep counts the re-ask), so closing on the
// hash today would turn `3a`'s ratified text landing into an outage for every parent at once. The question is
// recorded rather than answered.
import { CONSENT } from "@/modules/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import { purposeForAgreement } from "./purpose-for-agreement";

/** The registry purposes the two bundled per-child agreements are acceptances of (`purpose-for-agreement.ts`). */
export const PARENT_APP_CONSENT_PURPOSE = purposeForAgreement(
  "PARENT-APP-CONSENT",
)?.purpose as "parent-app-consent";
export const NANNY_ATTESTATION_PURPOSE = purposeForAgreement(
  "NANNY-ATTESTATION",
)?.purpose as "nanny-attestation";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Months at 30 days, matching `sweepRenewals` — nothing expires at the boundary, it only decides the day. */
const TTL_MS = CONSENT.renewalCheckMonths * 30 * DAY_MS;
const NEARING_EXPIRY_MS = CONSENT.renewalNoticeDays * DAY_MS;

export type MediaConsentState =
  | "active"
  | "nearing_expiry"
  | "expired"
  | "revoked"
  | "never_given";

export interface MediaConsentGateResult {
  allowed: boolean;
  state: MediaConsentState;
  signedAt?: string;
  expiresAt?: string;
  consentingUserId?: string;
}

export interface MediaConsentGateDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>;
  now?: Date;
}

interface ConsentRow {
  user_id: string;
  consent_given: boolean;
  created_at: string;
}

/**
 * Per-child consent freshness for either bundled agreement (FATE `10.16`): the parent's media/app consent, or
 * the nanny's attestation for the same child. One TTL rule, one read, because they are the same shape — the
 * Sydney version had two nearly-identical copies and an age cliff on one of them.
 */
export async function hasChildConsent(
  input: {
    childId: string;
    purpose:
      | typeof PARENT_APP_CONSENT_PURPOSE
      | typeof NANNY_ATTESTATION_PURPOSE;
  },
  deps: MediaConsentGateDeps,
): Promise<MediaConsentGateResult> {
  const now = deps.now ?? new Date();

  const { data: top } = await deps.admin
    .from("consent_records")
    .select("user_id, consent_given, created_at")
    .eq("purpose", input.purpose)
    .eq("related_entity_id", input.childId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ConsentRow>();

  if (!top) return { allowed: false, state: "never_given" };

  // A decline is a new row with `false` (02 §4.1), and the newest row is the answer — so a withdrawal closes
  // the gate on the next read, without anything having to delete the consent that preceded it.
  if (!top.consent_given)
    return {
      allowed: false,
      state: "revoked",
      signedAt: top.created_at,
      consentingUserId: top.user_id,
    };

  const expiresAt = new Date(Date.parse(top.created_at) + TTL_MS);
  const remaining = expiresAt.getTime() - now.getTime();
  const base = {
    signedAt: top.created_at,
    expiresAt: expiresAt.toISOString(),
    consentingUserId: top.user_id,
  };

  if (remaining <= 0) return { allowed: false, state: "expired", ...base };
  if (remaining <= NEARING_EXPIRY_MS)
    return { allowed: true, state: "nearing_expiry", ...base };
  return { allowed: true, state: "active", ...base };
}

/** The media gate proper: the **parent's** bundled consent for this child (FATE `07.71`). */
export async function hasParentMediaConsent(
  input: { childId: string },
  deps: MediaConsentGateDeps,
): Promise<MediaConsentGateResult> {
  return hasChildConsent(
    { childId: input.childId, purpose: PARENT_APP_CONSENT_PURPOSE },
    deps,
  );
}

/**
 * Server-action helper: the same decision in the structured-error envelope the rest of the tree returns for
 * `subscription_required`-style gates.
 */
export async function requireParentMediaConsent(
  input: { childId: string },
  deps: MediaConsentGateDeps,
): Promise<
  | { ok: true; gate: MediaConsentGateResult }
  | {
      ok: false;
      error: "media_consent_required";
      gate: MediaConsentGateResult;
    }
> {
  const gate = await hasParentMediaConsent(input, deps);
  if (gate.allowed) return { ok: true, gate };
  return { ok: false, error: "media_consent_required", gate };
}
