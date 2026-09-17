// Mints one `XXXX-XXXX` token (02 §4.6; `INVITE_TOKEN` holds the alphabet and the shape).
//
// Randomness comes from the Web Crypto `getRandomValues` both runtimes provide, mapped straight through
// `byte % 32`. **That modulo is exactly uniform and needs no rejection sampling**, because 32 divides 256: each
// of the 32 symbols is the image of exactly 8 of the 256 byte values. The first draft of this file carried a
// rejection loop against modulo bias, copied from the general case — it was dead code (its threshold computed
// to 256, so nothing was ever rejected) and the test written to prove it fired is what found that. The
// uniformity is asserted directly instead, because it is the property that matters and it is true.
//
// The generator is injectable so a test can pin the mapping without pinning the randomness.
import { INVITE_TOKEN } from "./invite-token-alphabet";

export function mintInviteToken(
  random: (into: Uint8Array) => void = (into) => crypto.getRandomValues(into),
): string {
  const bytes = new Uint8Array(INVITE_TOKEN.length);
  random(bytes);
  const symbols = [...bytes].map(
    (byte) => INVITE_TOKEN.alphabet[byte % INVITE_TOKEN.alphabet.length] ?? "0",
  );
  const head = symbols.slice(0, INVITE_TOKEN.group).join("");
  const tail = symbols.slice(INVITE_TOKEN.group).join("");
  return `${head}-${tail}`;
}
