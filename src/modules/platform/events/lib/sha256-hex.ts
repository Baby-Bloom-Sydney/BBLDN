// SHA-256 → lowercase hex, over Web Crypto so the same code runs on Node and on the edge (`node:crypto` in
// `platform` is what dragged a Node builtin into the edge bundle once already — see `src/instrumentation.ts`).
//
// Its one caller hashes our own user id before it leaves the building (`meta-payload.ts`). Meta requires
// `external_id` to be hashed, and that requirement happens to be the privacy property we want anyway: the
// identifier that reaches a third party is a digest, so a breach of their side yields nothing that resolves
// against our database.
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
