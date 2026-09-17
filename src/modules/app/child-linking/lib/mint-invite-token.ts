// Mints one `XXXX-XXXX` token (02 §4.6; `INVITE_TOKEN` holds the alphabet and the shape).
//
// Randomness comes from the Web Crypto `getRandomValues` both runtimes provide. A plain `byte % 32` would
// favour the first 32 of the 256 byte values very slightly; a token is a bearer credential, so bytes at or
// above the largest whole multiple of 32 are dropped and redrawn rather than folded in. The generator is
// injectable so a test can pin the mapping without pinning the randomness.
import { INVITE_TOKEN } from "./invite-token-alphabet";

/** The largest multiple of the alphabet that fits in a byte; at or above it, a draw would skew. */
const UNBIASED_CEILING = 256 - (256 % INVITE_TOKEN.alphabet.length);

export function mintInviteToken(
  random: (into: Uint8Array) => void = (into) => crypto.getRandomValues(into),
): string {
  const out: string[] = [];
  const buffer = new Uint8Array(INVITE_TOKEN.length * 2);
  while (out.length < INVITE_TOKEN.length) {
    random(buffer);
    for (const byte of buffer) {
      if (out.length === INVITE_TOKEN.length) break;
      if (byte >= UNBIASED_CEILING) continue;
      out.push(
        INVITE_TOKEN.alphabet[byte % INVITE_TOKEN.alphabet.length] as string,
      );
    }
  }
  const head = out.slice(0, INVITE_TOKEN.group).join("");
  const tail = out.slice(INVITE_TOKEN.group).join("");
  return `${head}-${tail}`;
}
