// 07 §8 row 2's key for the funnel steps: **IP + User-Agent hash** — never the consent-gated `visitor_id`
// (07 §2.9, S-6). Hashed together for the same reason as the address alone; a missing scope degrades to one
// shared bucket.
import { headers } from "next/headers";

const NO_CALLER = "no-caller";
const KEY_LENGTH = 32;

export async function callerIpUaKey(): Promise<string> {
  let address = "";
  let agent = "";
  try {
    const h = headers();
    address = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
    agent = h.get("user-agent") ?? "";
  } catch {
    return NO_CALLER;
  }
  if (address === "" && agent === "") return NO_CALLER;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${address}\n${agent}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, KEY_LENGTH);
}
