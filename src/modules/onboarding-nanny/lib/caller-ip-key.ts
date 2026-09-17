// The rate-limit key for the IP-keyed halves of 07 §8 rows 2 and 3: the caller's address, **hashed**, joined to
// nothing else — the reason `onboarding-parent`'s copy gives (`rate_limit_buckets` carries no retention sweep
// and an IP is personal data, 07 §2 class C). `headers()` throws outside a request scope and these actions never
// throw, so a missing scope degrades to one shared bucket: the strict answer, not the lax one.
//
// Third copy of this helper (`api/_lib/ip-key.ts`, `onboarding-parent/lib/caller-ip-key.ts`) — recorded for the
// checkpoint as the M-10 shape: one `platform/rate-limit` key helper, then a mechanical pass.
import { headers } from "next/headers";

const NO_ADDRESS = "no-address";
const KEY_LENGTH = 32;

export async function callerIpKey(): Promise<string> {
  let forwarded: string | null = null;
  try {
    forwarded = headers().get("x-forwarded-for");
  } catch {
    forwarded = null;
  }
  const address = (forwarded ?? "").split(",")[0]?.trim() ?? "";
  if (address === "") return NO_ADDRESS;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(address),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, KEY_LENGTH);
}
