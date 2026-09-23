// **The Conversions API sink, proved by running it** (`4c`; 03 §9.5; ADR-055; 07 §2.9).
//
// The claim this suite exists to make is the server-side twin of `MetaPixel.test.tsx`'s: **a send for a visitor
// who has not agreed is the same violation as a script loaded before she chose.** It is the harder half to
// notice, because nothing appears in her browser when it happens — so every branch that must not send is a
// named case here, and each one asserts on `fetch` never having been called rather than on a return value.
//
// It also pins the two facts a marketing dashboard depends on: `position.created` is the **primary**
// conversion (ADR-055), and every send carries `event_id = envelope.id`, which is what lets the same
// conversion arrive from a browser and from here and be counted once.
import { describe, expect, it } from "vitest";
import { META, META_EVENTS } from "@/modules/config";
import type {
  EventId,
  EventName,
  Instant,
  Result,
  UserId,
  VisitorId,
} from "@/modules/shared-types";
import { metaSink, ok, err } from "@/modules/platform";
import type {
  ConsentSubject,
  EventEnvelope,
  MetaEventPayload,
} from "@/modules/platform";

const ENDPOINT = "https://graph.example.test/v0.0/000/events";
const TOKEN = "placeholder-capi-token";
const ID = "evt-1" as EventId;
const USER = "00000000-0000-4000-8000-0000000000aa" as UserId;
const VISITOR = "00000000-0000-4000-8000-0000000000bb" as VisitorId;
const TS = "2026-09-15T08:00:00.000Z" as Instant;
/** SHA-256 of `USER`, computed independently of the code under test. */
const USER_SHA256 =
  "87d96e07d1bf390d144fce80f3c634be66524878ea3133a800b7c597952fc714";

type Call = { readonly url: string; readonly body: string };

function harness(
  options: {
    readonly consent?: Result<boolean>;
    readonly status?: number;
  } = {},
) {
  const calls: Call[] = [];
  const sink = metaSink({
    endpoint: ENDPOINT,
    accessToken: TOKEN,
    consent: {
      hasMarketing: async (_subject: ConsentSubject) =>
        options.consent ?? ok(true),
    },
    fetch: (async (url: string, init: { body: string }) => {
      calls.push({ url: String(url), body: init.body });
      const status = options.status ?? 200;
      return { ok: status < 400, status } as Response;
    }) as unknown as typeof fetch,
  });
  return { sink, calls };
}

const envelope = (overrides: Record<string, unknown> = {}): EventEnvelope =>
  ({
    id: ID,
    name: "position.created" as EventName,
    ts: TS,
    source: "server",
    actor: { kind: "user", id: USER, role: "parent" },
    props: {},
    ...overrides,
  }) as EventEnvelope;

const payloadOf = (body: string): MetaEventPayload =>
  (JSON.parse(body) as { data: ReadonlyArray<MetaEventPayload> }).data[0]!;

describe("meta sink — the four ways it refuses to send", () => {
  it("★ sends nothing for a name that is not in config/meta-events.ts — the map is an allow-list", async () => {
    const { sink, calls } = harness();
    const result = await sink.handle(envelope({ name: "ui.click" }));
    expect(result.ok).toBe(true);
    expect(calls).toEqual([]);
  });

  it("★ sends nothing for an admin actor — she consented to being helped, not to being measured", async () => {
    const { sink, calls } = harness();
    const result = await sink.handle(
      envelope({
        actor: {
          kind: "admin",
          id: USER,
          onBehalfOf: { role: "parent", id: USER },
        },
      }),
    );
    expect(result.ok).toBe(true);
    expect(calls).toEqual([]);
  });

  it("★ sends nothing for a system or anonymous actor — no subject, so no record can exist", async () => {
    const { sink, calls } = harness();
    await sink.handle(envelope({ actor: { kind: "system", job: "cron" } }));
    await sink.handle(envelope({ actor: { kind: "anonymous" } }));
    expect(calls).toEqual([]);
  });

  it("★ sends nothing and REPORTS FAILURE when consent could not be read — an outage is not a green light", async () => {
    const { sink, calls } = harness({
      consent: err("INTERNAL", "store unavailable"),
    });
    const result = await sink.handle(envelope());
    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("★ sends nothing and reports SUCCESS when she has not agreed — not sending is the correct outcome", async () => {
    const { sink, calls } = harness({ consent: ok(false) });
    const result = await sink.handle(envelope());
    expect(result.ok).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe("meta sink — what it sends when she has agreed", () => {
  it("★ position.created is the primary conversion, mapped to Meta's SubmitApplication (ADR-055)", async () => {
    const { sink, calls } = harness();
    await sink.handle(envelope());
    expect(calls).toHaveLength(1);
    expect(payloadOf(calls[0]!.body).event_name).toBe(
      META_EVENTS.map["position.created"],
    );
  });

  it("★ every send carries event_id = envelope.id — the shared id a pixel call repeats to dedup", async () => {
    const { sink, calls } = harness();
    for (const name of Object.keys(META_EVENTS.map) as ReadonlyArray<EventName>)
      await sink.handle(envelope({ name, id: `evt-${name}` as EventId }));
    expect(calls).toHaveLength(Object.keys(META_EVENTS.map).length);
    for (const call of calls)
      expect(payloadOf(call.body).event_id).toMatch(/^evt-/);
  });

  it("★ the user id leaves hashed, never raw — Meta gets a digest that resolves against nothing", async () => {
    const { sink, calls } = harness();
    await sink.handle(envelope());
    expect(calls[0]!.body).not.toContain(USER);
    expect(payloadOf(calls[0]!.body).user_data.external_id).toBe(USER_SHA256);
  });

  it("★ the access token travels in the BODY, never the URL — a URL reaches proxy and error logs", async () => {
    const { sink, calls } = harness();
    await sink.handle(envelope());
    expect(calls[0]!.url).toBe(ENDPOINT);
    expect(calls[0]!.url).not.toContain(TOKEN);
    expect(JSON.parse(calls[0]!.body).access_token).toBe(TOKEN);
  });

  it("carries the one-dataset audience split from config, never a literal", async () => {
    const { sink, calls } = harness();
    await sink.handle(envelope());
    expect(payloadOf(calls[0]!.body).custom_data?.content_category).toBe(
      META_EVENTS.contentCategory.parent,
    );
  });

  it("derives fbc from a surviving fbclid, and sends none when there is no click id", async () => {
    const { sink, calls } = harness();
    await sink.handle(
      envelope({ attribution: { fbclid: "abc123", landingPath: "/results" } }),
    );
    await sink.handle(envelope());
    expect(payloadOf(calls[0]!.body).user_data.fbc).toBe(
      `fb.1.${Date.parse(TS)}.abc123`,
    );
    expect(payloadOf(calls[0]!.body).event_source_url).toContain("/results");
    expect(payloadOf(calls[1]!.body).user_data.fbc).toBeUndefined();
  });

  it("works for a visitor actor as well as a signed-in user", async () => {
    const { sink, calls } = harness();
    await sink.handle(envelope({ actor: { kind: "visitor", id: VISITOR } }));
    expect(calls).toHaveLength(1);
    expect(payloadOf(calls[0]!.body).user_data.external_id).not.toBe(VISITOR);
  });

  it("reports failure when the Conversions API refuses, so fan-out logs ALERT_EVENT_SINK_FAILED", async () => {
    const { sink } = harness({ status: 400 });
    const result = await sink.handle(envelope());
    expect(result.ok).toBe(false);
  });
});

describe("meta sink — what it does NOT yet know, pinned rather than pretended", () => {
  // `ecc-lite` rule 4: where the code and a document disagree, the document wins — so the documented
  // behaviour is pinned as a failing test with a named owner rather than quietly dropped.
  //
  // 01 §3.1 (`config/testUserDomain.ts`) and 03 §9.5 both say test users are excluded from the pixel and the
  // CAPI. The sink cannot do it: `user_profiles.is_test_user` is authoritative in production (06 §13 O-7),
  // `platform` is a leaf and may not read that table, and the envelope carries no such flag. The fix is the
  // same shape as the consent one — an `isTestUser` reader injected at boot beside the `ConsentReader` — and
  // that is an amendment to 03 §9.5's connector, which a sink unit does not get to smuggle in.
  //
  // **Owner: the unit that amends 03 §9.5 to add the reader.** Until then a seeded test family's conversions
  // reach the live dataset. The cost is bounded — the sink is bound in production only, where day one has no
  // test users — and it is visible here rather than nowhere.
  it.fails(
    "★ OWED — a test user's conversion is still sent (01 §3.1 excludes them; the sink has no reader)",
    async () => {
      const { sink, calls } = harness();
      await sink.handle(envelope());
      expect(calls).toEqual([]);
    },
  );
});

describe("meta sink — deduplication is structural, not hopeful", () => {
  it("★ the browser's own event is not one the server sends, so no pair can be double-counted today", () => {
    const serverSends = Object.values(META_EVENTS.map);
    expect(serverSends).not.toContain(META.pageViewEvent);
  });

  it("★ the map contains position.created — the primary conversion is not signup", () => {
    expect(META_EVENTS.map["position.created"]).toBeDefined();
    expect(META_EVENTS.map["position.created"]).not.toBe(
      META_EVENTS.map["signup.completed"],
    );
  });
});
