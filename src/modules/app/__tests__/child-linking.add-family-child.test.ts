// S-N-01 `/nanny/onboarding/add-child` (`03.19` Rejig; 04 §4.1 row 8, §4.4 c1) — the one action behind "Add a
// family". It is one submit because it is one decision she makes: the guardian's permission is the condition
// of the whole thing, so the tick, the child and the token she passes them travel together. RED first.
//
// AGR-14 is the disclaimer's record (07 §2.8 "informed action": always given, document optional), stamped with
// the child it was given for. It is recorded **after** the row exists, because a record that names no child is
// evidence of nothing — and if the record refuses, the child and the link still stand and the refusal is
// logged, which is this module's standing rule ("the child is the fact").
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import { SECURITY } from "@/modules/config";
import {
  configureConsent,
  configureEvents,
  createConsent,
  createEvents,
  createLogger,
  log,
  memoryConsentStore,
  memoryEventLogStore,
} from "@/modules/platform";
import type { ConsentRecordId, Email, Instant } from "@/modules/shared-types";
import {
  configureChildLinking,
  createChildLinking,
  memoryChildLinkingStore,
} from "@/modules/app";
import { addFamilyChildAction } from "../child-linking/actions/add-family-child-action";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const NANNY = "22222222-2222-4222-8222-222222222222";
const PARENT = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-09-18T09:00:00.000Z" as Instant;

const users = [
  {
    id: NANNY,
    email: "bea@example.test" as Email,
    password: "x".repeat(12),
    role: "nanny" as const,
  },
  {
    id: PARENT,
    email: "ada@example.test" as Email,
    password: "x".repeat(12),
    role: "parent" as const,
  },
];

const form = (over: Record<string, string> = {}): FormData => {
  const data = new FormData();
  data.set("firstName", "Amara");
  data.set("dateOfBirth", "2025-01-15");
  data.set("guardianPermission", "on");
  for (const [key, value] of Object.entries(over)) data.set(key, value);
  return data;
};

let store: ReturnType<typeof memoryChildLinkingStore>;
let consents: ReturnType<typeof memoryConsentStore>;

const signedInAs = (id: string | null) =>
  configureAuth(
    stubAuth(id === null ? { users } : { users, signedInUserId: id }),
  );

beforeEach(() => {
  store = memoryChildLinkingStore();
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));
  consents = memoryConsentStore();
  let n = 0;
  configureConsent(
    createConsent({
      store: consents,
      clock: () => NOW,
      newId: () => `c-${(n += 1)}` as ConsentRecordId,
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
      log: createLogger({ sink: () => undefined }),
    }),
  );
  configureChildLinking(
    createChildLinking({
      store,
      events: { emit: async () => ({ ok: true, value: undefined }) } as never,
      now: () => NOW,
      inviteBaseUrl: "https://example.test/invite",
    } as never),
  );
  signedInAs(NANNY);
});

describe("S-N-01 — addFamilyChildAction", () => {
  it("creates the unclaimed child, records AGR-14 against it and hands back the link", async () => {
    const result = await addFamilyChildAction(null, form());

    expect(result.error).toBeNull();
    expect(result.url).toContain("https://example.test/invite");
    expect(store.state.children).toHaveLength(1);
    expect(store.state.children[0]?.parent_user_id).toBeNull();
    expect(store.state.children[0]?.created_by_user_id).toBe(NANNY);
    expect(store.state.invites[0]?.direction).toBe("nanny_to_parent");
  });

  it("stamps the AGR-14 record with the child it was given for", async () => {
    await addFamilyChildAction(null, form());

    const record = consents.consents.find((row) => row.agreementId === "AGR-14");
    expect(record?.purpose).toBe("agr14_nanny_child_add");
    expect(record?.consentGiven).toBe(true);
    expect(record?.relatedEntityId).toBe(store.state.children[0]?.id);
  });

  it("refuses without the guardian tick, and writes nothing at all", async () => {
    const refused = await addFamilyChildAction(
      null,
      form({ guardianPermission: "" }),
    );

    expect(refused.url).toBeNull();
    expect(refused.error).not.toBeNull();
    expect(store.state.children).toEqual([]);
  });

  it("refuses an empty name before it writes", async () => {
    const refused = await addFamilyChildAction(null, form({ firstName: " " }));

    expect(refused.url).toBeNull();
    expect(refused.error).not.toBeNull();
    expect(store.state.children).toEqual([]);
  });

  it("refuses a signed-out visitor", async () => {
    signedInAs(null);

    const refused = await addFamilyChildAction(null, form());

    expect(refused.url).toBeNull();
    expect(store.state.children).toEqual([]);
  });

  it("refuses a parent — S-N-01 is the nanny's surface, and hers adds her own child", async () => {
    signedInAs(PARENT);

    const refused = await addFamilyChildAction(null, form());

    expect(refused.url).toBeNull();
    expect(refused.error).not.toBeNull();
    expect(store.state.children).toEqual([]);
  });

  it("asked twice for the same family, mints no second token", async () => {
    const first = await addFamilyChildAction(null, form());
    const second = await addFamilyChildAction(null, form());

    expect(first.url).not.toBeNull();
    expect(second.url).not.toBeNull();
    // two children (two families), one pending token each — never two tokens for one child
    expect(store.state.invites).toHaveLength(2);
    expect(new Set(store.state.invites.map((row) => row.child_id)).size).toBe(2);
  });
});
