// `POST /api/legal/cookie-consent` — the three rulings this unit carries, each driven rather than described.
//
// The defect `3c` measured was not subtle: the visitor id came from the request body, the insert ran at service
// scope with no limiter, and because `cookie_consent_records_current_idx` (`0004`) is UNIQUE on `(visitor_id)
// where superseded_by is null`, a **second** choice raised `23505` and the route answered 500. A visitor could
// not change her mind — which is the withdrawal right (Art 7(3); 07 §6), not a nicety.
//
// The connector is installed here over the **memory** store, because what is under test is the route: which id
// it writes against, what it refuses, and that a second choice succeeds. The database side of the same claim —
// that the RPC supersedes where a raw insert collides — is `int.cookie-consent-supersedes`, against the applied
// schema, because that is where the unique index actually lives.
import { beforeEach, describe, expect, it } from "vitest";
import { SECURITY } from "@/modules/config";
import {
  configureConsent,
  configureRateLimiter,
  createConsent,
  createRateLimiter,
  memoryConsentStore,
  memoryRateLimitStore,
} from "@/modules/platform";
import { GET, POST } from "./route";

const CALLER = { "x-forwarded-for": "203.0.113.11" };
const OTHER_CALLER = { "x-forwarded-for": "198.51.100.9" };
const ACCEPT = {
  consent_choice: "accept_all",
  analytics_enabled: true,
  marketing_enabled: true,
};
const REJECT = {
  consent_choice: "reject_non_essential",
  analytics_enabled: false,
  marketing_enabled: false,
};

const PER_MINUTE = SECURITY.rateLimits.cookieConsent.perMinute ?? 0;

function post(
  body: unknown,
  headers: Readonly<Record<string, string>> = CALLER,
): Request {
  return new Request("https://example.test/api/legal/cookie-consent", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** The `Set-Cookie` this response issues, as a request header a follow-up call can present. */
function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie");
  expect(header, "the route must issue a visitor cookie").not.toBeNull();
  return (header ?? "").split(";")[0];
}

beforeEach(() => {
  configureConsent(
    createConsent({
      store: memoryConsentStore(),
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
    }),
  );
  configureRateLimiter(
    createRateLimiter({
      store: memoryRateLimitStore(),
      burstAlertMultiple: SECURITY.burstAlertMultiple,
    }),
    "shared",
  );
});

describe("POST /api/legal/cookie-consent — the visitor id is ours (ruling (a))", () => {
  it("mints a signed HttpOnly cookie on a first visit", async () => {
    const response = await POST(post(ACCEPT));

    expect(response.status).toBe(200);
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toContain(`${SECURITY.visitorCookie.name}=`);
    expect(header).toContain("HttpOnly");

    expect(header).toContain(`Max-Age=${SECURITY.visitorCookie.maxAgeSeconds}`);
    // signed: `<uuid>.<mac>`, and the mac is not the id
    const value = decodeURIComponent(header.split("=")[1].split(";")[0]);
    expect(value.split(".")).toHaveLength(2);
    expect(value.split(".")[1].length).toBeGreaterThan(20);
  });

  it("★ a `visitor_id` in the body is REFUSED, not quietly ignored", async () => {
    const response = await POST(
      post({ ...ACCEPT, visitor_id: "11111111-1111-4111-8111-111111111111" }),
    );

    expect(response.status).toBe(422);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("VALIDATION");
  });

  it("★ a forged cookie is treated as no cookie — a new id is minted, and it is not the forged one", async () => {
    const forged = `${SECURITY.visitorCookie.name}=22222222-2222-4222-8222-222222222222.notasignature`;

    const response = await POST(post(ACCEPT, { ...CALLER, cookie: forged }));

    expect(response.status).toBe(200);
    expect(cookieFrom(response)).not.toBe(forged);
  });

  it("★ a cookie that cannot even be URL-decoded does not 500 the endpoint (security pass, HIGH)", async () => {
    // `decodeURIComponent` throws `URIError` on a malformed percent-sequence, and a cookie header is caller
    // input. Unguarded, `Cookie: bb_visitor=%` answered 500 — and kept answering 500 on every later request,
    // because the browser goes on sending the cookie it has. A value we cannot decode is a value we did not
    // write, which is already the "no cookie" case.
    const response = await POST(
      post(ACCEPT, { ...CALLER, cookie: `${SECURITY.visitorCookie.name}=%` }),
    );

    expect(response.status).toBe(200);
    expect(cookieFrom(response)).not.toContain("%");
  });

  it("the cookie is SameSite=Strict — it is never read on the arriving navigation", async () => {
    const header = (await POST(post(ACCEPT))).headers.get("set-cookie") ?? "";
    expect(header).toContain("SameSite=Strict");
  });

  it("the cookie it issued is accepted back, so a returning visitor keeps one identity", async () => {
    const first = await POST(post(ACCEPT));
    const cookie = cookieFrom(first);

    const second = await POST(post(REJECT, { ...CALLER, cookie }));

    expect(second.status).toBe(200);
    expect(cookieFrom(second)).toBe(cookie);
  });

  it("never echoes the visitor id in the body — HttpOnly means the page cannot have it either", async () => {
    const response = await POST(post(ACCEPT));
    const text = await response.text();
    const id = decodeURIComponent(cookieFrom(response).split("=")[1]).split(
      ".",
    )[0];
    expect(text).not.toContain(id);
  });
});

describe("POST /api/legal/cookie-consent — she can change her mind (ruling (b))", () => {
  it("★ a second choice from the same visitor succeeds — the defect `3c` measured", async () => {
    const first = await POST(post(ACCEPT));
    expect(first.status).toBe(200);
    const cookie = cookieFrom(first);

    const changed = await POST(post(REJECT, { ...CALLER, cookie }));

    // Before this unit the second call raised 23505 on `cookie_consent_records_current_idx` and answered 500.
    expect(changed.status).toBe(200);
  });

  it("and back again, any number of times — consent is append-only, never an update", async () => {
    let cookie = cookieFrom(await POST(post(ACCEPT)));
    for (const choice of [REJECT, ACCEPT, REJECT]) {
      const response = await POST(post(choice, { ...CALLER, cookie }));
      expect(response.status).toBe(200);
      cookie = cookieFrom(response);
    }
  });

  it("refuses a choice whose flags contradict it, with the reason rather than a constraint's 500", async () => {
    const response = await POST(
      post({ ...ACCEPT, marketing_enabled: false }), // accept_all with marketing off — `0004`'s CHECK
    );

    expect(response.status).toBe(422);
  });

  it("refuses a body that is not JSON at all", async () => {
    const response = await POST(
      new Request("https://example.test/api/legal/cookie-consent", {
        method: "POST",
        headers: { "content-type": "application/json", ...CALLER },
        body: "not json",
      }),
    );

    expect(response.status).toBe(422);
  });
});

describe("POST /api/legal/cookie-consent — 07 §8 row 5 (ruling (c))", () => {
  it("★ refuses a burst with 429 and a Retry-After", async () => {
    expect(PER_MINUTE).toBeGreaterThan(0);
    for (let i = 0; i < PER_MINUTE; i += 1) {
      expect((await POST(post(ACCEPT))).status).toBe(200);
    }

    const refused = await POST(post(ACCEPT));

    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("limits per caller, and the limiter runs before the body is parsed", async () => {
    for (let i = 0; i <= PER_MINUTE; i += 1) await POST(post(ACCEPT));

    // Another address is unaffected...
    expect((await POST(post(ACCEPT, OTHER_CALLER))).status).toBe(200);
    // ...and the burst caller is refused even with a body that would not have parsed, which is only possible
    // if the limit is consumed first (a 422 here would mean a scanner could spend our parse budget freely).
    expect((await POST(post({ nonsense: true }))).status).toBe(429);
  });

  it("★ fails CLOSED: `cookieConsent` is not on the fail-open allow-list (ADR-134)", () => {
    expect(SECURITY.failOpenOnLimiterOutage).not.toContain("cookieConsent");
  });
});

// --------------------------------------------------------------------------------------------------------
// L-009 `3g` — the readable preference cookie, and the `GET` the preference screen reads the record through.
// --------------------------------------------------------------------------------------------------------

/** Every `Set-Cookie` on a response, as separate values — `headers.get` joins them with a comma. */
function setCookies(response: Response): ReadonlyArray<string> {
  const all = response.headers.getSetCookie?.();
  return (
    all ?? (response.headers.get("set-cookie") ?? "").split(/,\s*(?=\w+=)/)
  );
}

function preferenceCookieOf(response: Response): string | undefined {
  return setCookies(response).find((value) =>
    value.startsWith(`${SECURITY.consentPreferenceCookie.name}=`),
  );
}

function get(headers: Readonly<Record<string, string>> = CALLER): Request {
  return new Request("https://example.test/api/legal/cookie-consent", {
    headers,
  });
}

describe("POST — the readable preference cookie (ADR-175 (c); FATE 10.22)", () => {
  it("★ is written on the response that recorded the choice, so the browser's copy cannot outrun the row", async () => {
    const response = await POST(post(ACCEPT));

    expect(response.status).toBe(200);
    expect(preferenceCookieOf(response)).toContain("bb_consent=accept_all.11");
  });

  it("★ a reject writes it too — the banner must not re-ask a visitor who declined", async () => {
    const cookie = preferenceCookieOf(await POST(post(REJECT)));

    expect(cookie).toContain("bb_consent=reject_non_essential.00");
  });

  it("is readable by script, unlike the visitor cookie, because the gate has to read it", async () => {
    const cookie = preferenceCookieOf(await POST(post(ACCEPT))) ?? "";

    expect(cookie).not.toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("carries no identifier — the visitor id stays in the HttpOnly cookie and out of the body", async () => {
    const response = await POST(post(ACCEPT));
    const visitor = setCookies(response).find((value) =>
      value.startsWith(`${SECURITY.visitorCookie.name}=`),
    );
    const id = decodeURIComponent(
      (visitor ?? "").split(";")[0].split("=")[1],
    ).split(".")[0];

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(preferenceCookieOf(response)).not.toContain(id);
    expect(await response.clone().text()).not.toContain(id);
  });

  it("is not written when the write was refused — a refused choice leaves no mirror of itself", async () => {
    const refused = await POST(
      post({
        consent_choice: "accept_all",
        analytics_enabled: false,
        marketing_enabled: true,
      }),
    );

    expect(refused.status).toBe(422);
    expect(preferenceCookieOf(refused)).toBeUndefined();
  });
});

describe("GET — the preference screen reads the record, not the mirror", () => {
  it("★ answers 'no choice' for a visitor with no cookie, so the toggles start off", async () => {
    const response = await GET(get());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { choice: null, analyticsEnabled: false, marketingEnabled: false },
    });
  });

  it("★ answers with the recorded choice for a visitor who has one", async () => {
    const recorded = await POST(post(REJECT));
    const cookie = cookieFrom(recorded);

    const response = await GET(get({ ...CALLER, cookie }));

    expect(await response.json()).toMatchObject({
      data: {
        choice: "reject_non_essential",
        analyticsEnabled: false,
        marketingEnabled: false,
      },
    });
  });

  it("★ answers with the LATEST choice — the road is append-only and the read takes the newest row", async () => {
    const first = await POST(post(ACCEPT));
    const cookie = cookieFrom(first);
    await POST(post(REJECT, { ...CALLER, cookie }));

    const response = await GET(get({ ...CALLER, cookie }));

    expect(await response.json()).toMatchObject({
      data: { choice: "reject_non_essential", marketingEnabled: false },
    });
  });

  it("never echoes the visitor id, which is HttpOnly for a reason", async () => {
    const recorded = await POST(post(ACCEPT));
    const cookie = cookieFrom(recorded);
    const id = decodeURIComponent(cookie.split("=")[1]).split(".")[0];

    const body = await (await GET(get({ ...CALLER, cookie }))).text();

    expect(body).not.toContain(id);
  });

  it("treats a forged cookie as no cookie, rather than telling the caller it was forged", async () => {
    const response = await GET(
      get({
        ...CALLER,
        cookie: `${SECURITY.visitorCookie.name}=not-a-signed-value`,
      }),
    );

    expect(await response.json()).toMatchObject({ data: { choice: null } });
  });

  it("consumes the same limiter as the write — a read of someone else's absence is still a call", async () => {
    for (let i = 0; i < PER_MINUTE; i += 1)
      expect((await GET(get())).status).toBe(200);

    expect((await GET(get())).status).toBe(429);
  });
});
