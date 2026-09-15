// Result helpers + the API envelope (01 §4a / §4c / §4e): one shape, `cause` never crosses the boundary, HTTP
// status from the one ErrorCode table, `Retry-After` on 429, INTERNAL never leaks the thrown text.
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "@/modules/shared-types";
import type { ErrorCode, Result } from "@/modules/shared-types";
import {
  envelopeOf,
  err,
  fromThrown,
  ok,
  statusForCode,
  toActionResult,
  toClientError,
  toResponse,
} from "@/modules/platform";

const REQUEST_ID = "req-123";

describe("platform — Result helpers (01 §4a)", () => {
  it("ok / err build the one shape and freeze it", () => {
    const good = ok({ id: 1 });
    expect(good).toEqual({ ok: true, value: { id: 1 } });
    expect(Object.isFrozen(good)).toBe(true);

    const bad = err("NOT_FOUND", "gone", { reason: "absent" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toEqual({
      code: "NOT_FOUND",
      message: "gone",
      details: { reason: "absent" },
    });
    expect(Object.isFrozen(bad.error)).toBe(true);
  });

  it("err keeps `cause` for the server side only", () => {
    const boom = new Error("provider said 500");
    const bad = err(
      "PROVIDER_ERROR",
      "stripe failed",
      { provider: "stripe" },
      boom,
    );
    expect(bad.error.cause).toBe(boom);
    expect(toClientError(bad.error)).toEqual({
      code: "PROVIDER_ERROR",
      message: "stripe failed",
      details: { provider: "stripe" },
    });
    expect("cause" in toClientError(bad.error)).toBe(false);
  });

  it("fromThrown maps any throw to INTERNAL with a generic message and the throw as cause", () => {
    const thrown = new Error("secret stack trace with sk_live_abc");
    const bad = fromThrown(thrown, {
      module: "platform",
      action: "emit",
      requestId: REQUEST_ID,
    });
    expect(bad.ok).toBe(false);
    expect(bad.error.code).toBe("INTERNAL");
    expect(bad.error.message).not.toContain("sk_live");
    expect(bad.error.message).not.toContain("stack");
    expect(bad.error.cause).toBe(thrown);
    expect(bad.error.details).toEqual({
      module: "platform",
      action: "emit",
      requestId: REQUEST_ID,
    });
  });

  it("fromThrown accepts a non-Error throw", () => {
    const bad = fromThrown("a string");
    expect(bad.error.code).toBe("INTERNAL");
    expect(bad.error.cause).toBe("a string");
  });

  it("toClientError replaces an INTERNAL message + details with the generic form", () => {
    const leaky = err("INTERNAL", "pg: relation events does not exist", {
      sql: "select 1",
    });
    const client = toClientError(leaky.error);
    expect(client.message).not.toContain("pg:");
    expect(client.details).toBeUndefined();
    expect(client.code).toBe("INTERNAL");
  });

  it("statusForCode follows the 01 §4a table for every code", () => {
    const expected: Record<ErrorCode, number> = {
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      VALIDATION: 422,
      CONFLICT: 409,
      RATE_LIMITED: 429,
      PROVIDER_ERROR: 502,
      INTERNAL: 500,
    };
    for (const code of ERROR_CODES)
      expect(statusForCode(code)).toBe(expected[code]);
  });
});

describe("platform — envelope (01 §4c)", () => {
  it("wraps a success as { data, requestId } with 200 and the request id header", () => {
    const payload = envelopeOf(ok({ id: "x" }), { requestId: REQUEST_ID });
    expect(payload).toEqual({
      status: 200,
      body: { data: { id: "x" }, requestId: REQUEST_ID },
      headers: { "x-request-id": REQUEST_ID },
    });
  });

  it("carries collection meta and honours 201 / 204", () => {
    const meta = { page: 1, limit: 20, total: 156, totalPages: 8 };
    const list = envelopeOf(ok([1, 2]), { requestId: REQUEST_ID, meta });
    expect(list.body).toEqual({ data: [1, 2], meta, requestId: REQUEST_ID });

    expect(
      envelopeOf(ok({}), { requestId: REQUEST_ID, status: 201 }).status,
    ).toBe(201);
    const gone = envelopeOf(ok(undefined), {
      requestId: REQUEST_ID,
      status: 204,
    });
    expect(gone.status).toBe(204);
    expect(gone.body).toBeNull();
  });

  it("wraps an error as { error, requestId } with the table status and no cause", () => {
    const failed = err(
      "VALIDATION",
      "bad input",
      { mobile: ["UK mobile required"] },
      new Error("x"),
    );
    const payload = envelopeOf(failed, { requestId: REQUEST_ID });
    expect(payload.status).toBe(422);
    expect(payload.body).toEqual({
      error: {
        code: "VALIDATION",
        message: "bad input",
        details: { mobile: ["UK mobile required"] },
      },
      requestId: REQUEST_ID,
    });
    expect(JSON.stringify(payload.body)).not.toContain("cause");
  });

  it("adds Retry-After on RATE_LIMITED when the details carry retryAfterSeconds", () => {
    const limited = err("RATE_LIMITED", "slow down", {
      reason: "limit",
      window: "minute",
      retryAfterSeconds: 42,
    });
    const payload = envelopeOf(limited, { requestId: REQUEST_ID });
    expect(payload.status).toBe(429);
    expect(payload.headers).toEqual({
      "x-request-id": REQUEST_ID,
      "Retry-After": "42",
    });
  });

  it("toResponse builds a JSON Response (and an empty 204)", async () => {
    const response = toResponse(ok({ id: "x" }), {
      requestId: REQUEST_ID,
      status: 201,
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      data: { id: "x" },
      requestId: REQUEST_ID,
    });

    const empty = toResponse(ok(undefined), {
      requestId: REQUEST_ID,
      status: 204,
    });
    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe("");
  });

  it("toActionResult strips cause so a server action's Result is serialisable (01 §4e)", () => {
    const failed: Result<number> = err(
      "CONFLICT",
      "not movable",
      { reason: "stage" },
      new Error("x"),
    );
    expect(toActionResult(failed)).toEqual({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "not movable",
        details: { reason: "stage" },
      },
    });
    expect(toActionResult(ok(3))).toEqual({ ok: true, value: 3 });
  });
});

// S3b — the S3 security review's MEDIUM on `toClientError`: `details` was only stripped for INTERNAL, so any
// other code could carry a raw provider body, a stack or a PII-shaped string across the boundary.
describe("platform — toClientError guards `details` on every code (S3b)", () => {
  it("strips Error instances and PII-shaped strings from details, not just for INTERNAL", () => {
    const failed = err("PROVIDER_ERROR", "stripe failed", {
      provider: "stripe",
      thrown: new Error("at /app/src/modules/payments/lib/charge.ts:12:9"),
      contact: "ann@example.test",
      key: "sk_live_ci-dummy",
      note: "ring +44 7700 900123 back", // config-literal-ok: a PII fixture the guard must redact
      nested: { deeper: { email: "ann@example.test" } },
      list: ["fine", "ann@example.test"],
      reason: "declined",
      retryAfterSeconds: 30,
    });
    expect(toClientError(failed.error)).toEqual({
      code: "PROVIDER_ERROR",
      message: "stripe failed",
      details: {
        provider: "stripe",
        thrown: "[redacted]",
        contact: "[redacted]",
        key: "[redacted]",
        note: "ring [redacted] back",
        nested: { deeper: { email: "[redacted]" } },
        list: ["fine", "[redacted]"],
        reason: "declined",
        retryAfterSeconds: 30,
      },
    });
  });

  it("leaves a clean details object untouched and never mutates the caller's error", () => {
    const details = { mobile: ["UK mobile required"], field: "mobile" };
    const failed = err("VALIDATION", "check the form", details);
    const client = toClientError(failed.error);
    expect(client.details).toEqual(details);
    expect(Object.isFrozen(client)).toBe(true);
    expect(failed.error.details).toBe(details);
  });

  it("bounds the depth it walks, so a deep details object cannot hide a leak below it", () => {
    const failed = err("VALIDATION", "check the form", {
      a: { b: { c: { d: { e: "ann@example.test" } } } },
    });
    expect(JSON.stringify(toClientError(failed.error))).not.toContain(
      "ann@example.test",
    );
  });

  it("redacts a token embedded mid-sentence in a provider's message, not just a whole-value one", () => {
    const failed = err("PROVIDER_ERROR", "stripe failed", {
      providerMessage:
        "Stripe declined: Authorization Bearer sk_live_ci-dummy is invalid",
      trace:
        "call rejected, jwt abcdefghijkl.mnopqrstuvwx.yz0123456789_- expired",
      alsoFine: "declined by the issuer",
    });
    const details = toClientError(failed.error).details as Record<
      string,
      string
    >;
    expect(details.providerMessage).not.toContain("sk_live");
    expect(details.providerMessage).not.toContain("Bearer");
    expect(details.providerMessage).toContain("[redacted]");
    expect(details.trace).not.toContain("abcdefghijkl");
    expect(details.alsoFine).toBe("declined by the issuer");
  });

  it("checks numbers the same way the log line does, so the two boundaries agree", () => {
    const failed = err("VALIDATION", "check the form", {
      mobile: 447700900123, // config-literal-ok: a PII fixture the guard must redact
      retryAfterSeconds: 30,
      finishedAtMs: 1758000000000,
    });
    expect(toClientError(failed.error).details).toEqual({
      mobile: "[redacted]",
      retryAfterSeconds: 30,
      finishedAtMs: 1758000000000,
    });
  });

  it("redacts a secret-named field whatever its value looks like (most real credentials match no pattern)", () => {
    const failed = err("PROVIDER_ERROR", "stripe failed", {
      apiKey: "an-ordinary-looking-string",
      token: "0123",
      password: "hunter2",
      authorization: "opaque",
      body: { raw: "the provider's whole response" },
      documentContents: "scan text",
      provider: "stripe",
    });
    expect(toClientError(failed.error).details).toEqual({
      apiKey: "[redacted]",
      token: "[redacted]",
      password: "[redacted]",
      authorization: "[redacted]",
      body: "[redacted]",
      documentContents: "[redacted]",
      provider: "stripe",
    });
  });

  it("keeps the personal-named validation fields the envelope's own example uses (01 §4c)", () => {
    const failed = err("VALIDATION", "check the form", {
      mobile: ["UK mobile required"],
      email: ["Email required"],
      firstName: ["Required"],
    });
    expect(toClientError(failed.error).details).toEqual({
      mobile: ["UK mobile required"],
      email: ["Email required"],
      firstName: ["Required"],
    });
  });

  it("redacts anything that is not plain data — a Date, a Map, a class instance — rather than flattening it", () => {
    class Opaque {
      constructor(readonly secretInside: string) {}
    }
    const failed = err("CONFLICT", "not movable", {
      when: new Date("2026-09-15T08:00:00.000Z"),
      seen: new Map([["a", 1]]),
      thing: new Opaque("ann@example.test"),
      reason: "stage",
    });
    expect(toClientError(failed.error).details).toEqual({
      when: "[redacted]",
      seen: "[redacted]",
      thing: "[redacted]",
      reason: "stage",
    });
  });

  it("an error with no details still crosses the boundary unchanged", () => {
    expect(toClientError(err("NOT_FOUND", "gone").error)).toEqual({
      code: "NOT_FOUND",
      message: "gone",
    });
  });

  it("the same guard runs through the envelope and the action result (one chokepoint)", () => {
    const failed = err("CONFLICT", "not movable", {
      reason: "stage",
      thrown: new Error("boom"),
    });
    const envelope = envelopeOf(failed, { requestId: REQUEST_ID });
    expect(envelope.body).toMatchObject({
      error: { details: { reason: "stage", thrown: "[redacted]" } },
    });
    expect(toActionResult(failed)).toMatchObject({
      error: { details: { reason: "stage", thrown: "[redacted]" } },
    });
  });
});
