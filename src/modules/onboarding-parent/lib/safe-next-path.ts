// 01 §4d step 2 — the `next=` a route echoes back into a redirect must be a same-origin *path*: an absolute URL,
// a protocol-relative `//host` or a backslash-smuggled host would make S-X-08 an open redirect. `null` = use the
// role's own dashboard instead. Same rule as `auth`'s `loginRedirectUrl`, read here from the other side.
export function safeNextPath(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\"))
    return null;
  return raw;
}
