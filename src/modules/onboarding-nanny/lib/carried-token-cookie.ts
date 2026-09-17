// ADR-150 — a bearer carried between two screens in an `HttpOnly` cookie, never a query string. One helper for
// both carried tokens (`SECURITY.carriedTokens`): minted by a server action, read by the receiving route or
// action, cleared by the action that consumes it. `Secure` follows the request's scheme so the local stack (http)
// still carries it; `SameSite=Lax` because the visitor arrives by a top-level navigation from her own inbox or
// the family's message. The value is validated by the reader's own shape check — the cookie carries, it never
// vouches.
import { cookies, headers } from "next/headers";
import { SECURITY } from "@/modules/config";

type CarriedTokenName = keyof typeof SECURITY.carriedTokens;

// `Secure` follows the request's scheme (`x-forwarded-proto`, which Vercel sets) rather than an environment
// read: the local stack is http, and 07 §7 keeps the environment behind `config`'s two readers.
const isSecureRequest = (): boolean => {
  try {
    return headers().get("x-forwarded-proto") === "https";
  } catch {
    return false;
  }
};

export const carriedTokenCookie = Object.freeze({
  set(name: CarriedTokenName, value: string): void {
    const spec = SECURITY.carriedTokens[name];
    cookies().set({
      name: spec.name,
      value,
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureRequest(),
      path: "/",
      maxAge: spec.maxAgeSeconds,
    });
  },
  read(name: CarriedTokenName): string | null {
    try {
      const value = cookies().get(SECURITY.carriedTokens[name].name)?.value;
      return value === undefined || value === "" ? null : value;
    } catch {
      return null;
    }
  },
  clear(name: CarriedTokenName): void {
    try {
      cookies().delete(SECURITY.carriedTokens[name].name);
    } catch {
      // outside a request scope there is nothing to clear
    }
  },
});
