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
// **Where the key comes from, stated plainly because it is a judgement.** There is no dedicated signing secret
// in the environment, and adding one would make the cookie banner depend on a value BAI has not set yet — a
// consent surface that silently stops recording is worse than the defect it replaces. So the key is *derived*
// from `CRON_SECRET` with HKDF (RFC 5869) under its own `info` label: the derived key cannot be reversed to
// `CRON_SECRET`, and holding it does not let anyone forge a cron bearer.
//
// **The cost, both halves, because only naming one of them would be dishonest** (security pass, 2026-09-19):
//   * *Rotation* invalidates every visitor cookie. The whole consequence is that a fresh id is minted on the
//     next request — no error, no lost record, just a new pseudonymous visitor.
//   * *A leak of `CRON_SECRET`* is the graver half and it is an **expansion of that secret's blast radius**.
//     The derivation is public and forward-computable, so whoever holds a leaked `CRON_SECRET` can mint a valid
//     cookie for any uuid they choose — and if they have separately learned a real visitor's id (from a log, a
//     referrer, an analytics export), they can supersede that person's consent row. Accepted, not overlooked:
//     the same leak already opens every cron endpoint, and the bound on this extra harm is one consent record
//     per id they can already name.
// Recorded in L-009 PROGRESS with the alternative — a dedicated `VISITOR_COOKIE_SECRET`, which costs a new
// value BAI owes and a boot dependency — for the planner to rule on. `refine-env.ts` now holds `CRON_SECRET` to
// a minimum length outside development, because it carries two security properties instead of one.
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
    hkdfSync("sha256", env.server.CRON_SECRET, "", HKDF_INFO, KEY_BYTES),
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
