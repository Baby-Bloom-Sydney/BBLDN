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
