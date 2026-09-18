// ★ **ADR-169 — a session id can no longer be accepted where a profile id belongs.** REVIEW-4 C-3.
//
// The measurement first, because the ruling turns on it. `vetting_submissions.nanny_id` is
// `references public.nannies (id)` (`0008:156`) and `submit_verification_evidence` writes it as
// `select n.id from public.nannies n where n.user_id = auth.uid()` (`0023:865`). So of the two sides of that
// write, **the column was right and the label was wrong**: `db-vetting-store.ts:98` branded it `UserId`, and
// every road `2c` built then re-resolved it through `nannies.user_id = $1`, where a `nannies.id` matches
// nothing. The queue opened no row, L4 was unreachable, and an adverse DBS raised neither email nor admin row —
// a type lie that read as an empty queue rather than as an error.
//
// Two guards, because the defect had two halves.
//
//   · **The compiler.** `NannyId` and `UserId` are distinct brands, and the `@ts-expect-error` cases below fail
//     the `typecheck` gate the moment either side goes back to accepting the other. They are assertions that a
//     line does NOT compile, so they cost nothing at runtime and cannot rot: if the brand is relaxed, the
//     directive becomes unused and `tsc` refuses it.
//   · **The doubles.** A brand is erased at runtime, so a cast silences it — which is exactly what happened.
//     The memory world therefore now models both id spaces as different VALUES (`ledger.partyIdOf`), so a
//     confusion that a cast has hidden still shows up as a row that is not found.
//
// The seam itself is the third case: it is crossed once, named, through the store — never by passing whichever
// id was to hand.
import { beforeEach, describe, expect, it } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import {
  configureEvents,
  createEvents,
  log,
  memoryEventLogStore,
} from "@/modules/platform";
import type { Email, NannyId, UserId } from "@/modules/shared-types";
import {
  configureVettingStore,
  listSubmissions,
  memoryVettingStore,
  stubManualProvider,
} from "@/modules/vetting-providers";
import type { MemoryVettingStore } from "@/modules/vetting-providers";
import { memoryVerificationStore } from "../index";

const NANNY = "11111111-1111-4111-8111-111111111111" as UserId;

let ledger: MemoryVettingStore;

beforeEach(() => {
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));
  ledger = memoryVettingStore();
  configureVettingStore(ledger);
  configureAuth(
    stubAuth({
      users: [
        {
          id: NANNY,
          email: "nanny@example.test" as Email,
          role: "nanny",
          mfaVerified: false,
        },
      ],
      signedInUserId: NANNY,
    }),
  );
});

async function submitIdentity(): Promise<void> {
  const submitted = await stubManualProvider.submit({
    id: "ev-1" as never,
    nannyId: NANNY,
    type: "identity-document",
    documents: [
      {
        bucket: "verification-documents",
        path: `${NANNY as string}/identity-document/a.jpg`,
        signedUrl: "https://stub.storage.test/x" as never,
        expiresAt: "2026-09-20T01:00:00.000Z" as never,
      },
    ],
    declared: { surname: "Okafor" },
    consent: { biometric: "consent-1" as never },
    submittedAt: "2026-09-20T00:00:00.000Z" as never,
  });
  if (!submitted.ok) throw new Error("submit refused");
}

describe("★ ADR-169 — the two id spaces do not mix", () => {
  it("the ledger row is keyed by the party row, and the session id is a different value", async () => {
    await submitIdentity();

    const rows = ledger.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.nannyId).toBe(ledger.partyIdOf(NANNY));
    expect(rows[0]?.nannyId as string).not.toBe(NANNY as string);
  });

  it("★ the ledger filter answers nothing for a session id cast into the party's place", async () => {
    await submitIdentity();

    // The cast is the defect, reproduced: a `UserId` forced through the seam. The compiler refuses it without
    // the cast (the case below), and the double refuses it with one — which is the belt the brand is the braces
    // for. Before ADR-169 this returned a row in the double and none in production, and the difference between
    // those two answers is the whole finding.
    const wrong = await listSubmissions({
      nannyId: NANNY as string as NannyId,
    });
    const right = await listSubmissions({ nannyId: ledger.partyIdOf(NANNY) });

    expect(wrong.ok && wrong.value).toEqual([]);
    expect(right.ok && right.value).toHaveLength(1);
  });

  it("the seam is crossed through the store, once and named — `partyIdOf` answers the id the ledger speaks", async () => {
    await submitIdentity();
    const store = memoryVerificationStore(ledger);

    const party = await store.partyIdOf(NANNY);

    expect(party.ok && party.value).toBe(ledger.partyIdOf(NANNY));
  });

  it("and it answers null for a user with no nanny row, rather than an id that resolves to nothing", async () => {
    const store = memoryVerificationStore(ledger);

    const party = await store.partyIdOf(
      "44444444-4444-4444-8444-444444444444" as UserId,
    );

    expect(party.ok && party.value).toBeNull();
  });

  it("★ the compiler refuses a session id where a profile id belongs, on every road that broke", async () => {
    await submitIdentity();
    const store = memoryVerificationStore(ledger);

    // Each of these is a road REVIEW-4 C-3 measured dead. The `@ts-expect-error` IS the assertion: if any of
    // them starts accepting a `UserId` again, `tsc` fails the directive as unused and the `typecheck` gate goes
    // red — which is the guard that does not depend on anyone remembering to run a test.
    // @ts-expect-error a UserId is not a NannyId — `readAdminRecord` keys on `nannies.id`
    await store.readAdminRecord(NANNY);
    // @ts-expect-error a UserId is not a NannyId — `syncLevel`'s p_nanny_id is the party row
    await store.syncLevel(NANNY);
    await store.recordUpdateServiceCheck({
      // @ts-expect-error a UserId is not a NannyId — the level-4 write keys on the party row
      nannyId: NANNY,
      result: "no_change",
      subscribed: true,
      checkedBy: NANNY,
    });
    // @ts-expect-error a UserId is not a NannyId — the ledger filter keys on `vetting_submissions.nanny_id`
    await listSubmissions({ nannyId: NANNY });

    // And the reverse: the party row is refused where the SESSION's id belongs, so the fix cannot be "cast the
    // other way" either. `getStatus` is her own read and keys on the user (R-7).
    // @ts-expect-error a NannyId is not a UserId — `getStatus` keys on the session
    await store.getStatus(ledger.partyIdOf(NANNY));

    expect(ledger.rows()).toHaveLength(1);
  });
});
