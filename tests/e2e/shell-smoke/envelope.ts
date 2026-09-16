// The suite's one reader of an 01 §4c error envelope, and the one statement of the statuses it asserts.
//
// It imports the **real** `ErrorEnvelope` and `ErrorStatus` from `platform` rather than restating their shape
// inline (typescript-reviewer MEDIUM 2): a rename of `error.code` or a change to the 01 §4a status table is then
// a `tsc` failure at every call site, which is cheaper than discovering it from a red suite. `Envelope` is a
// type-only import, so nothing of `platform` reaches the Playwright runtime.
//
// `errorEnvelopeOf` **narrows instead of casting**. `APIResponse.json()` is `any` in Playwright's own typings,
// so a plain cast would let a shape drift read as `undefined` and an assertion like
// `expect(body.error?.code).toBe("UNAUTHENTICATED")` would fail with a useless message — or worse, a
// `toBeUndefined()` check would pass while the real property moved elsewhere (typescript-reviewer MEDIUM 1).
// A guard that throws names the route and the keys it actually got. The keys are named, never the values: a
// body is not something a test report should echo.
import type { APIResponse } from "@playwright/test";
import type { ErrorEnvelope, ErrorStatus } from "@/modules/platform";

/** 01 §4a's HTTP column for the codes this suite asserts, plus the two non-error statuses it needs. */
export const STATUS = Object.freeze({
  ok: 200 as const,
  redirect: 307 as const,
  unauthenticated: 401 satisfies ErrorStatus,
  notFound: 404 satisfies ErrorStatus,
  validation: 422 satisfies ErrorStatus,
  internal: 500 satisfies ErrorStatus,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 01 §4c: every enveloped response carries a `requestId`, and `envelopeOf` echoes it as `x-request-id`. */
export const isRequestId = (value: unknown): boolean =>
  typeof value === "string" && UUID.test(value);

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== "object" || body === null) return false;
  const { error, requestId } = body as Record<string, unknown>;
  if (!isRequestId(requestId)) return false;
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as Record<string, unknown>;
  return typeof code === "string" && typeof message === "string";
}

/**
 * Reads the response as an 01 §4c **error** envelope or fails the test saying so. Because the guard requires an
 * `error` object, it also rules out a success envelope — an unauthenticated read that leaked `data` cannot reach
 * an assertion at all.
 */
export async function errorEnvelopeOf(
  response: APIResponse,
): Promise<ErrorEnvelope> {
  const body: unknown = await response.json();
  if (!isErrorEnvelope(body)) {
    const shape =
      typeof body === "object" && body !== null
        ? Object.keys(body).join(", ")
        : typeof body;
    throw new Error(
      `${response.url()} did not answer the 01 §4c error envelope — keys: [${shape}]`,
    );
  }
  return body;
}
