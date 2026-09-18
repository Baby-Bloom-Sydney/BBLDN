// The visitor id, minted and signed by the server (07 §2.9 / §6; L-009 `3e`).
//
// **What this replaces.** `POST /api/legal/cookie-consent` read `visitor_id` out of the request body. Anything
// that can post could therefore name any visitor it liked — and because `cookie_consent_records_current_idx`
// (`0004`) is UNIQUE on `(visitor_id) where superseded_by is null`, naming a real visitor's id is not merely
// noise: it collides with the row that holds her current answer.
//
// **Why signed and not merely HttpOnly.** `HttpOnly` stops a script on our own pages from reading or replacing
// the value; it does nothing about a caller that is not a browser, and `curl` can send whatever cookie it
// likes. The signature is what makes the id *ours*: a value we did not mint does not verify, and is discarded.
// ADR-150 says a carried token is unsigned when the value is unguessable, which a v4 uuid is — but ADR-150 is
// about a token travelling **between two of our own screens**, where the only question is whether an attacker
// can guess it. Here the question is different and the answer has to be stronger: this cookie decides **which
// row a write lands on**, so "unguessable" is not enough, "minted by us" is the property required.
//
// **Where the key comes from** — `VISITOR_COOKIE_SECRET`, its own value in the environment (ADR-178). `3e`
// derived it by HKDF from `CRON_SECRET`, because there was no dedicated secret and a consent surface that
// silently stops recording is worse than the defect it replaced. That derivation is cryptographically sound and
// operationally wrong, and ADR-178 ruled it out for two reasons rather than one: rotating the cron Bearer would
// have invalidated every visitor's consent cookie for a reason unrelated to consent, and a leaked cron Bearer
// would have become a key for **forging** consent records — the one artefact whose whole value is that it
// evidences what a person actually chose. Two unrelated trust domains now rotate and leak apart.
//
// HKDF stays, over the dedicated secret: it normalises an arbitrary-length secret to a 32-byte key and the
// `info` label carries a version, so a future change of scheme is a label change rather than a silent
// re-interpretation of the same bytes. Rotation invalidates outstanding cookies and the next visitor is asked
// again — which is the correct failure, not a defect to design around.
import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "@/modules/config/server";
import { SECURITY, publicEnv } from "@/modules/config";

const COOKIE = SECURITY.visitorCookie;
const HKDF_INFO = "bbldn:visitor-cookie:v1";
const KEY_BYTES = 32;

/** `<uuid>.<signature>` — one dot, a v4 uuid on the left. */
const SIGNED = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]+)$/;

function key(): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      env.server.VISITOR_COOKIE_SECRET,
      "",
      HKDF_INFO,
      KEY_BYTES,
    ),
  );
}

function sign(id: string): string {
  return createHmac("sha256", key()).update(id).digest("base64url");
}

/** Constant-time, and length-safe: `timingSafeEqual` throws on a length mismatch rather than returning false. */
function matches(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The verified visitor id in this request's cookies, or `null` — for an absent cookie, a malformed one, and a
 * value whose signature does not check out, which are deliberately the same answer. A caller that presents a
 * forged id is not told that it was forged; it is simply treated as a new visitor.
 */
export function visitorIdOf(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (header === null) return null;
  const raw = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE.name}=`))
    ?.slice(COOKIE.name.length + 1);
  if (raw === undefined || raw === "") return null;
  const decoded = decode(raw);
  if (decoded === null) return null;
  const parsed = SIGNED.exec(decoded);
  if (parsed === null) return null;
  return matches(sign(parsed[1]), parsed[2]) ? parsed[1] : null;
}

/**
 * `decodeURIComponent` **throws** `URIError` on a malformed percent-sequence, and a cookie header is caller
 * input: `Cookie: bb_visitor=%` would otherwise have thrown out of this function and answered 500 — on every
 * later request too, because the browser keeps sending the cookie it has (security pass HIGH, 2026-09-19). A
 * value we cannot decode is a value we did not write, which is already this function's "no cookie" case.
 */
function decode(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export function mintVisitorId(): string {
  return randomUUID();
}

/**
 * The `Set-Cookie` value carrying `id`. Re-issued on every recorded choice so the cookie's life tracks the
 * record's (07 §6.2 row 12) rather than expiring in the middle of it.
 *
 * `Secure` is omitted in development only, where the dev server is plain HTTP; every deployed environment sets
 * `NODE_ENV=production`, so the flag is on wherever a real visitor can reach it. The environment is read
 * through `publicEnv`, never `process.env` — 01 §1.3 rule 1, and `check:env-reads` is the gate.
 */
export function visitorCookieHeader(id: string): string {
  const parts = [
    `${COOKIE.name}=${encodeURIComponent(`${id}.${sign(id)}`)}`,
    "Path=/",
    `Max-Age=${COOKIE.maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (publicEnv.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
