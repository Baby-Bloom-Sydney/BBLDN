// The auth gate (01 §4d), carried from Sydney `03.01` / `11.24` with the two tightenings that document names:
// `NEXT_PUBLIC_DEV_MODE` is honoured only outside production (step 4 — `PUBLIC_FLAGS.DEV_MODE` already encodes
// that rule), and missing Supabase configuration **fails the boot** rather than bypassing the gate (step 5 —
// importing `config` parses the public env at module load and throws on a missing name; Sydney returned
// `next()` instead, which silently unlocked every route). The file is thin on purpose: the session read lives in
// `auth` (the only module that touches `@supabase/*`, 01 §6.3) and the decision in `auth`'s pure `gateDecision`.
import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_FLAGS } from "@/modules/config";
import { auth, gateDecision } from "@/modules/auth";
import { log } from "@/modules/platform";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  if (PUBLIC_FLAGS.DEV_MODE) return NextResponse.next({ request });

  // Step 1 — refresh the session on every matched request; `response` carries the rotated cookies.
  const response = NextResponse.next({ request });
  const session = await auth.refreshSession(request, response);
  if (!session.ok)
    log.warn("session refresh failed; treating the request as signed out", {
      module: "auth",
      action: "middleware",
      errorCode: session.error.code,
    });

  const decision = gateDecision({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    session: session.ok ? session.value : null,
  });
  if (decision.kind === "allow") return response;

  // A redirect must carry the cookies the refresh just set, or the next request re-refreshes and can loop.
  const redirect = NextResponse.redirect(new URL(decision.to, request.url));
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: [
    // Everything except Next's own static output and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
