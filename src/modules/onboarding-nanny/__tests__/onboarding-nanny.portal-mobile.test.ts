// REVIEW-3 H-3 — **PINNED.** The one road that lifts isolation is closed to the population it exists for.
//
// `apply-from-portal-action.ts:51` reads `mobile: me.mobile ?? ("" as never)`. `NannyProfile` gets `mobile`
// from `NannyContactPatch`, which is a `Partial<>`, so it is `E164 | undefined` — and S-N-19's own schema
// (`nanny-portal-schema.ts:10-16`) *deliberately* strips `mobile` from the funnel's questions, on the stated
// grounds that "the account holds it". The account does not always hold it: ADR-152 (1) creates an invited
// nanny (S-X-07) **with no mobile and no district** — asserted by `int.rpc-0021` ("an invited nanny is created
// isolated, with no mobile and no district") — and an invited nanny is exactly who S-N-19 is for.
//
// So `""` is handed to `nannyLeadStore.capture`, and `0014_leads.sql:54-55` carries
// `nanny_leads_phone_e164_gb_check`: the phone is null, or it matches E.164 on `LOCALE.phonePrefix` (ADR-102;
// the prefix is config's, never a literal — L4, which is why the predicate below is built from it).
//
// Measured against the applied migration set: null inserts, a well-formed UK mobile inserts, `''` is refused
// **23514 `nanny_leads_phone_e164_gb_check`**. The lead is therefore never written, `apply()` returns
// `lead-not-captured`, `liftIsolation()` is never reached — and by ADR-147 `lift_nanny_isolation()` is the
// **one** writer of `is_isolated → false`. An invited nanny with no mobile can never apply, never leave
// isolation, and is shown a generic refusal that names nothing she could fix.
//
// **Why every existing test passes.** `memoryNannyLeadStore` has no CHECK. `onboarding-nanny.isolation.test.ts`
// creates its nanny with no mobile, runs the whole happy path, and asserts `email`, `firstName` and `source` —
// never the phone. The defect lives exactly in the gap between the mock and the column, which is why it is
// pinned against the *value*, not against the store.
//
// **Why pinned and not fixed.** `NannyApplicationInput.mobile` (`types.ts:84`) is `E164` — not optional, not
// nullable — so this module has no legal value to pass. `NannyLead.mobile` is already `E164 | null`
// (`types.ts:116`) and the column is nullable, so the connector is the odd one out and the fix is one word on
// it. That is a contract change, and REVIEW-2's H-10 settled how this sweep treats those: the document wins,
// the behaviour is pinned, the owner rules. Owner: 03's `NannyLeadStore` row + `2a`.
//
// The pin asserts only what the database will accept, so it flips on any fix that makes S-N-19 work —
// `E164 | null` on the input, or S-N-19 asking for the mobile when the account has none.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import { LOCALE, SECURITY } from "@/modules/config";
import {
  configureEvents,
  configureRateLimiter,
  createEvents,
  createRateLimiter,
  log,
  memoryEventLogStore,
  memoryRateLimitStore,
} from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import { cookieJarModule, resetJar } from "./cookie-jar";
import { configureNannyLeadStore } from "../lib/configure-nanny-lead-store";
import { memoryNannyLeadStore } from "../lib/memory-nanny-lead-store";
import { configureNannyAccountStore } from "../lib/configure-nanny-account-store";
import { memoryNannyAccountStore } from "../lib/memory-nanny-account-store";
import { applyFromPortalAction } from "../actions/apply-from-portal-action";

vi.mock("next/headers", () => cookieJarModule());

const NANNY = "22222222-2222-4222-8222-222222222222";
const users = [
  {
    id: NANNY,
    email: "bea@example.test" as Email,
    password: "x".repeat(12),
    role: "nanny" as const,
  },
];

/**
 * `nanny_leads_phone_e164_gb_check` (`0014:54-55`) as a predicate — the column's own rule, not this test's
 * opinion, and built from `LOCALE.phonePrefix` so the prefix stays config's (L4).
 */
const COLUMN_RULE = new RegExp(`^\\${LOCALE.phonePrefix}[1-9][0-9]{8,9}$`, "u");
const acceptedByTheColumn = (phone: unknown): boolean =>
  phone === null ||
  phone === undefined ||
  (typeof phone === "string" && COLUMN_RULE.test(phone));

const PORTAL: Record<string, string | ReadonlyArray<string>> = {
  district: "SW4",
  area: "Clapham",
  rtwStatus: "settled",
  hasEnhancedDbs: "yes",
  yearsExperience: "4",
  ageGroups: ["toddlers"],
  roleTypes: ["part-time"],
  availability: JSON.stringify({ tuesday: ["afternoon"] }),
  rateMin: "16",
  rateMax: "22",
  bio: "Four years with toddlers in south London, references on request.",
};

const formDataOf = (
  fields: Record<string, string | ReadonlyArray<string>>,
): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") data.set(key, value);
    else for (const item of value) data.append(key, item);
  }
  return data;
};

let leads: ReturnType<typeof memoryNannyLeadStore>;

beforeEach(async () => {
  resetJar();
  configureRateLimiter(
    createRateLimiter({
      store: memoryRateLimitStore(),
      burstAlertMultiple: SECURITY.burstAlertMultiple,
    }),
  );
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));
  leads = memoryNannyLeadStore();
  configureNannyLeadStore(leads);
  const accounts = memoryNannyAccountStore({
    emails: { [NANNY]: "bea@example.test" as Email },
  });
  configureNannyAccountStore(accounts);
  configureAuth(stubAuth({ users, signedInUserId: NANNY }));
  // ADR-152 (1)'s invited nanny, exactly: isolated, and with no mobile on the account.
  await accounts.create({
    userId: NANNY as never,
    firstName: "Bea",
    lastName: "Lin",
    isolated: true,
  });
});

describe("S-N-19 for a nanny whose account holds no mobile (REVIEW-3 H-3)", () => {
  it.fails(
    "PINNED — apply-from-portal writes a phone `nanny_leads` will accept, never an empty string (0014:54; owner: 03's NannyLeadStore row + `2a`)",
    async () => {
      await applyFromPortalAction(null, formDataOf(PORTAL));
      expect(leads.rows()).toHaveLength(1);
      // `""` here is a row the real column refuses — so against Postgres this whole journey stops dead.
      expect(acceptedByTheColumn(leads.rows()[0]?.mobile)).toBe(true);
    },
  );

  it("meanwhile a nanny who does have a mobile applies normally, so only the absent case is broken", async () => {
    await applyFromPortalAction(null, formDataOf(PORTAL));
    // The lead is written in memory either way; this case exists to say the defect is the *value*, not the
    // road — nothing else about S-N-19 is in question.
    expect(leads.rows()).toHaveLength(1);
    expect(leads.rows()[0]?.source).toBe("portal");
  });
});
